import User from "../models/User.js";
import Application from "../models/Application.js";
import CandidateProfile from "../models/CandidateProfile.js";
import EmailLog from "../models/EmailLog.js";
import { createTransporter } from "../utils/mailer.js";
import { resolveEmailAccount } from "../utils/emailAccounts.js";
import { fetchBuffer } from "../utils/fetchBuffer.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "../utils/tracking.js";
import { logActivity } from "../utils/activity.js";
import { DEFAULT_TIMEZONE, releaseDedupeKey } from "./scheduledEmailService.js";

export class PermanentSendError extends Error {
  constructor(message) {
    super(message);
    this.permanent = true;
  }
}

const PERMANENT_PATTERNS = [
  /gmail not connected/i,
  /no gmail account/i,
  /no enabled gmail account/i,
  /gmail account not found/i,
  /is disabled\./i,
  /app password/i,
  /invalid login/i,
  /username and password not accepted/i,
  /authentication failed/i,
  /application not found/i,
  /recipient not found/i,
  /resume not found/i,
  /could not be decrypted/i,
  /no recipient/i,
];

export function isPermanentError(err) {
  if (err?.permanent) return true;
  const message = String(err?.message || "");
  return PERMANENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Send one scheduled-email document and write the EmailLog entry.
 * Throws on failure so the scheduler can decide whether to retry.
 */
export async function sendScheduledEmail(job) {
  if (!job) throw new PermanentSendError("Scheduled email not found");

  const user = await User.findById(job.owner);
  if (!user) throw new PermanentSendError("Owner account not found");

  const account = await resolveEmailAccount(user, job.accountId || null);

  let application = null;
  if (job.application) {
    application = await Application.findOne({ _id: job.application, owner: user._id });
    if (!application) throw new PermanentSendError("Application not found");
  }

  // Re-fetch the resume so a deleted/renamed file fails loudly instead of
  // sending a job application without an attachment.
  let attachments = [];
  let resumeName = job.resumeName || "";
  if (job.resumeId) {
    const profile = await CandidateProfile.findOne({ owner: user._id });
    const resume = profile?.resumes?.id(job.resumeId);
    if (!resume) throw new PermanentSendError("The resume attached to this email no longer exists");
    resumeName = resume.originalName || resumeName;
    try {
      const buffer = await fetchBuffer(resume.cloudinaryUrl);
      attachments.push({ filename: resume.originalName, content: buffer });
    } catch (err) {
      throw new Error(`Could not download resume attachment: ${err.message}`);
    }
  }

  const trackingId = generateTrackingId();
  const html = injectTrackingIntoHtml(String(job.body || "").replace(/\n/g, "<br/>"), trackingId, true);
  const text = injectTrackingIntoText(String(job.body || ""), trackingId, true);

  const logEntry = await EmailLog.create({
    owner: user._id,
    application: job.application || null,
    company: job.company || application?.company || null,
    contact: job.contact || null,
    recipient: job.recipient,
    recipientName: job.recipientName || "",
    subject: job.subject,
    body: job.body,
    status: "Pending",
    emailType: job.emailType || "Job Application",
    isAiGenerated: !!job.isAiGenerated,
    attachmentName: attachments[0]?.filename || "",
    resumeName,
    resumeSize: attachments[0]?.content?.length || 0,
    senderAccount: account.address,
    senderAccountId: account._id || null,
    trackingId,
    trackingEnabled: true,
  });

  try {
    const transporter = createTransporter(account.address, account.appPassword);
    await transporter.sendMail({
      from: `"${user.name}" <${account.address}>`,
      to: job.recipient,
      subject: job.subject,
      text,
      html,
      attachments,
    });
  } catch (err) {
    logEntry.status = "Failed";
    logEntry.errorMessage = String(err.message || "Send failed").slice(0, 500);
    await logEntry.save();
    throw err;
  }

  logEntry.status = "Sent";
  logEntry.sentAt = new Date();
  await logEntry.save();

  job.status = "Sent";
  job.sentAt = new Date();
  job.emailLog = logEntry._id;
  job.resumeName = resumeName;
  await job.save();
  await releaseDedupeKey(job); // release the active duplicate guard

  if (application) {
    application.applicationDate = application.applicationDate || new Date();
    if (["NEW", "SAVED", "APPLYING"].includes(application.status)) {
      application.status = "EMAIL_SENT";
    }
    if (resumeName) application.resumeUsed = resumeName;
    await application.save();
    await logActivity(
      application,
      "email_sent",
      `Scheduled email sent to ${job.recipient} from ${account.address}${job.isAiGenerated ? " (AI-generated)" : ""}`
    );
  }

  return { sent: true, emailLogId: logEntry._id, senderAccount: account.address, sentAt: logEntry.sentAt };
}

/** Human-readable, secret-free error text stored on the job. */
export function summarizeError(err) {
  const message = String(err?.message || "Unknown error").replace(/\s+/g, " ").trim();
  // SMTP errors never include the password, but keep the stored text short and
  // single-line so credentials cannot accidentally leak into the dashboard.
  return message.slice(0, 300);
}

export { DEFAULT_TIMEZONE };
