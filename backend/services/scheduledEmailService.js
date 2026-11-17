import ScheduledEmail, { SCHEDULED_EMAIL_STATUSES } from "../models/ScheduledEmail.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import CandidateProfile from "../models/CandidateProfile.js";
import EmailLog from "../models/EmailLog.js";
import { resolveEmailAccount } from "../utils/emailAccounts.js";
import { validateResumeForJob, describeResumeMatches, getApplicationExperience } from "../utils/resumeMatcher.js";
import { parseFutureSchedule, DEFAULT_SCHEDULE_TIMEZONE } from "../utils/scheduling.js";

export const DEFAULT_TIMEZONE = DEFAULT_SCHEDULE_TIMEZONE;
export const ACTIVE_STATUSES = ["Pending", "Scheduled", "Processing"];
const TERMINAL_STATUSES = ["Sent", "Failed", "Cancelled"];

export class ServiceError extends Error {
  constructor(status, message, code = null, data = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

/**
 * Validate the requested timestamp and never accept a past schedule.
 * "Send Now" uses the immediate endpoints, not the scheduling API.
 */
function parseScheduledAt(value) {
  const { date, error } = parseFutureSchedule(value);
  if (error) {
    throw new ServiceError(400, error, "INVALID_SCHEDULE_TIME");
  }
  return date;
}

/**
 * Duplicate protection:
 * - Job applications are unique per application (one application per company/
 *   recruiter, regardless of which sender account is chosen).
 * - Other email types additionally include the type so a follow-up can coexist.
 */
export function buildDedupeKey({ ownerId, applicationId, recipient, emailType, accountId }) {
  const base = applicationId ? `app:${applicationId}` : `rcpt:${normalizeEmail(recipient)}`;
  const suffix = emailType && emailType !== "Job Application" ? `:${emailType}` : "";
  // Duplicate protection is per sender account: the same application can be
  // scheduled from a second Gmail account, but never twice from one account.
  const accountSuffix = accountId ? `:acct:${String(accountId)}` : "";
  return `${ownerId}:${base}${suffix}${accountSuffix}`;
}

/** Resolve the recipient for an application (contact first, then saved HR email). */
export async function resolveRecipient({ ownerId, application, recipientEmail, recipientName, contactId }) {
  let contact = null;
  const explicit = normalizeEmail(recipientEmail);

  const resolvedContactId = contactId || application?.contact || null;
  if (resolvedContactId) {
    contact = await Contact.findOne({ _id: resolvedContactId, owner: ownerId });
  }

  const email =
    explicit ||
    normalizeEmail(contact?.email) ||
    normalizeEmail(application?.hrEmail);

  if (!email) {
    throw new ServiceError(
      400,
      "This application has no recruiter email. Add an HR email first.",
      "NO_RECIPIENT"
    );
  }

  return {
    recipient: email,
    recipientName: recipientName || contact?.name || application?.hrName || "",
    contact,
  };
}

/**
 * Create a persistent scheduled email record.
 * The actual sending is handled by the scheduler worker.
 *
 * @param {Object} opts
 * @param {Object} opts.user - full User document
 * @param {Object} opts.input
 */
export async function createScheduledEmail({ user, input = {} }) {
  const {
    applicationId,
    contactId,
    recipientEmail,
    recipientName,
    subject,
    body,
    resumeId,
    accountId,
    scheduledAt,
    timezone = DEFAULT_TIMEZONE,
    emailType = "Job Application",
    isAiGenerated = false,
    allowResend = false,
    companyId,
  } = input;

  if (!subject || !String(subject).trim()) throw new ServiceError(400, "Subject is required", "MISSING_SUBJECT");
  if (!body || !String(body).trim()) throw new ServiceError(400, "Email body is required", "MISSING_BODY");
  if (!scheduledAt) throw new ServiceError(400, "scheduledAt is required", "MISSING_SCHEDULE_TIME");

  const when = parseScheduledAt(scheduledAt);

  // Ownership: the application must belong to this user.
  let application = null;
  if (applicationId) {
    application = await Application.findOne({ _id: applicationId, owner: user._id });
    if (!application) throw new ServiceError(404, "Application not found", "APPLICATION_NOT_FOUND");
  }

  // Ownership + recipient.
  const { recipient, recipientName: resolvedName, contact } = await resolveRecipient({
    ownerId: user._id,
    application,
    recipientEmail,
    recipientName,
    contactId,
  });

  // Sender account must exist, belong to the user and be enabled.
  const account = await resolveEmailAccount(user, accountId || null);

  // Never send twice from the SAME account for the same application unless the
  // user allows a resend. Other accounts may still be scheduled — that is how
  // multi-account follow-up coverage works.
  if (application && emailType === "Job Application" && !allowResend) {
    const alreadySent = await EmailLog.findOne({
      owner: user._id,
      application: application._id,
      status: "Sent",
      emailType: "Job Application",
      $or: [
        { senderAccountId: account._id },
        { senderAccountId: null, senderAccount: account.address },
      ],
    });
    if (alreadySent) {
      throw new ServiceError(
        409,
        `An email has already been sent for this application from ${account.address}. Duplicate sends from the same account are blocked.`,
        "ALREADY_SENT",
        { alreadySentAt: alreadySent.sentAt, senderAccount: account.address }
      );
    }
  }

  // Resume must match the job (same rules as the immediate send flow).
  let resume = null;
  let resumeName = "";
  if (resumeId && application) {
    const profile = await CandidateProfile.findOne({ owner: user._id });
    resume = profile?.resumes?.id(resumeId) || null;
    if (!resume) throw new ServiceError(404, "Resume not found", "RESUME_NOT_FOUND");

    const validation = validateResumeForJob({
      resumes: profile.resumes,
      resumeId,
      jobTitle: application.jobTitle,
      jobExperience: getApplicationExperience(application),
      profileExperience: profile.experience || "",
    });
    if (!validation.valid) {
      throw new ServiceError(
        409,
        `The selected resume does not match the job title "${application.jobTitle}". Email not scheduled.`,
        "RESUME_MISMATCH",
        {
          jobTitle: application.jobTitle,
          matchedResume: validation.resume,
          resumes: describeResumeMatches({
            resumes: profile.resumes,
            jobTitle: application.jobTitle,
            jobExperience: getApplicationExperience(application),
          }),
          reason: validation.reason,
        }
      );
    }
    resumeName = resume.originalName || "";
  }

  const dedupeKey = buildDedupeKey({
    ownerId: user._id,
    applicationId: application?._id,
    recipient,
    emailType,
    accountId: account._id,
  });

  // Friendly pre-check (the unique index below is the real race guard).
  // The legacy key (no account suffix) is checked too so rows created before
  // per-account scheduling can never cause a double send from one account.
  const legacyKey = buildDedupeKey({
    ownerId: user._id,
    applicationId: application?._id,
    recipient,
    emailType,
  });
  const existing = await ScheduledEmail.findOne({
    owner: user._id,
    status: { $in: ACTIVE_STATUSES },
    $or: legacyKey === dedupeKey
      ? [{ dedupeKey }]
      : [{ dedupeKey }, { dedupeKey: legacyKey, accountId: account._id }],
  });
  if (existing) {
    throw new ServiceError(
      409,
      "A scheduled email already exists for this application. Cancel or edit it before scheduling another.",
      "DUPLICATE_SCHEDULE",
      { scheduledEmailId: existing._id, scheduledAt: existing.scheduledAt, status: existing.status }
    );
  }

  const now = Date.now();
  const dueNow = when.getTime() <= now + 30 * 1000;

  try {
    return await ScheduledEmail.create({
      owner: user._id,
      application: application?._id || null,
      company: companyId || application?.company || null,
      contact: contact?._id || null,
      accountId: account._id || null,
      accountEmail: account.address,
      recipient,
      recipientName: resolvedName,
      subject: String(subject).trim(),
      body: String(body),
      emailType,
      isAiGenerated: !!isAiGenerated,
      resumeId: resume?._id || null,
      resumeName,
      scheduledAt: when,
      timezone: timezone || DEFAULT_TIMEZONE,
      status: dueNow ? "Pending" : "Scheduled",
      attempts: 0,
      dedupeKey,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ServiceError(
        409,
        "A scheduled email already exists for this application. Duplicate schedules are not allowed.",
        "DUPLICATE_SCHEDULE"
      );
    }
    throw err;
  }
}

/**
 * Remove the active duplicate guard. Uses $unset because the unique index is
 * sparse: literal null values would collide, missing fields do not.
 */
export async function releaseDedupeKey(job) {
  if (!job?._id) return;
  job.dedupeKey = undefined;
  await ScheduledEmail.updateOne({ _id: job._id }, { $unset: { dedupeKey: 1 } });
}

/** Safe API representation — never includes credential material. */
export function toPublicScheduledEmail(doc) {
  if (!doc) return null;
  const job = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return {
    _id: String(job._id),
    application: job.application && typeof job.application === "object" && job.application.jobTitle
      ? { _id: String(job.application._id || job.application), jobTitle: job.application.jobTitle, companyName: job.application.companyName || "" }
      : job.application
        ? String(job.application)
        : null,
    company: job.company && job.company.name
      ? { _id: String(job.company._id), name: job.company.name }
      : job.company || null,
    accountId: job.accountId ? String(job.accountId) : null,
    senderAccount: job.accountEmail || "",
    recipient: job.recipient,
    recipientName: job.recipientName || "",
    subject: job.subject,
    body: job.body,
    emailType: job.emailType,
    isAiGenerated: !!job.isAiGenerated,
    resumeId: job.resumeId ? String(job.resumeId) : null,
    resumeName: job.resumeName || "",
    scheduledAt: job.scheduledAt,
    timezone: job.timezone || DEFAULT_TIMEZONE,
    status: job.status,
    attempts: job.attempts || 0,
    maxAttempts: job.maxAttempts || 3,
    lastError: job.lastError || "",
    sentAt: job.sentAt || null,
    cancelledAt: job.cancelledAt || null,
    emailLogId: job.emailLog ? String(job.emailLog) : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export { SCHEDULED_EMAIL_STATUSES, TERMINAL_STATUSES };
