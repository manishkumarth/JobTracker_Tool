import express from "express";
import multer from "multer";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { getTransporter, createTransporter } from "../utils/mailer.js";
import { resolveEmailAccount, usableEmailAccounts } from "../utils/emailAccounts.js";
import { fetchBuffer } from "../utils/fetchBuffer.js";
import { createScheduledEmail, toPublicScheduledEmail, DEFAULT_TIMEZONE } from "../services/scheduledEmailService.js";
import { scheduleForOtherAccounts } from "../services/multiAccountScheduler.js";
import { logActivity } from "../utils/activity.js";
import { logUserEvent } from "../utils/userLog.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "../utils/tracking.js";
import { generateApplicationEmail, buildFallbackApplicationEmail } from "../utils/emailWriter.js";
import { matchResumeForJob, validateResumeForJob, describeResumeMatches, getApplicationExperience, getResumeEffectiveExperience } from "../utils/resumeMatcher.js";
import { followUpSlotAfter, userScheduleTimezone } from "../utils/scheduling.js";

const router = express.Router();
router.use(authMiddleware);

// Memory storage only - no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

// POST /api/mail/upload  -> attach a PDF (in memory)
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.json({ filename: req.file.originalname, buffer: true, originalName: req.file.originalname });
});

// Fetch file from URL as buffer (for Cloudinary resumes) lives in utils/fetchBuffer.js

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class HttpError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const sendError = (res, err) => {
  const isTimeout = /timed out|timeout|aborted/i.test(err.message || "");
  const status = err.status || (isTimeout ? 504 : 500);
  if (status >= 500) console.error("Mail send error:", err.message);
  logSlowSend(res, "errored request", err.message || "");
  res.status(status).json({
    message: isTimeout
      ? `${err.message || "Request timed out"} — the email may still have been sent. Check Email History.`
      : err.message || "Something went wrong",
    ...(err.data || {}),
  });
};

// Hard ceiling for routes that talk to an LLM, Cloudinary and Gmail SMTP.
// Vercel kills the function without a body once maxDuration is hit; this makes
// sure the client always receives a readable JSON error instead of hanging.
const SEND_ROUTE_TIMEOUT_MS = 55000;
// One-click send gets a short AI budget; past this we send a truthful template
// instead of risking a Vercel function timeout. Tunable without a code change.
const QUICK_DRAFT_TIMEOUT_MS = Number(process.env.QUICK_DRAFT_TIMEOUT_MS) || 8000;
const guardSlowSend = (req, res, next) => {
  const startedAt = Date.now();
  res.locals.mailStartedAt = startedAt;
  res.setTimeout(SEND_ROUTE_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      console.error(`[mail] request timed out after ${Date.now() - startedAt}ms: ${req.method} ${req.originalUrl}`);
      res.status(504).json({
        message: "Sending took too long and was stopped. Check Email History — the email may still have been sent.",
        code: "REQUEST_TIMEOUT",
      });
    }
  });
  next();
};

// Log only genuinely slow requests so production logs stay readable.
const logSlowSend = (res, label, extra = "") => {
  const elapsed = Date.now() - (res.locals.mailStartedAt || Date.now());
  if (elapsed > 5000) {
    console.log(`[mail] slow ${label}: ${elapsed}ms${extra ? ` ${extra}` : ""}`);
  }
};

// Shared send implementation used by POST /mail/send and POST /mail/auto-send.
async function performSend(req, params) {
  const {
    contactIds, subject, message, resumeId, attachmentFilename,
    applicationId, companyId, emailType = "Job Application",
    isAiGenerated = false, templateId, allowResend = false,
    recipientEmail, recipientName, accountId = null,
  } = params;

  if ((!contactIds?.length && !recipientEmail) || !subject || !message) {
    throw new HttpError(400, "contactIds (or recipientEmail), subject and message are required");
  }

  const user = await User.findById(req.userId);
  if (!user) throw new HttpError(404, "User not found");

  // Resolve the sender account (multi-account aware, legacy-compatible).
  const account = await resolveEmailAccount(user, accountId);
  const transporter = createTransporter(account.address, account.appPassword);

  // 24-hour dedup: block auto-send to the same recipient within 24 hours.
  // After 24 hours a new send is allowed.
  if (applicationId && !allowResend) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recipients = contactIds?.length
      ? (await Contact.find({ _id: { $in: contactIds }, owner: req.userId }).select("email")).map(c => c.email)
      : recipientEmail ? [recipientEmail] : [];
    for (const rec of recipients) {
      if (!rec) continue;
      const recent = await EmailLog.findOne({
        owner: req.userId,
        application: applicationId,
        recipient: rec,
        status: "Sent",
        sentAt: { $gte: oneDayAgo },
        // Per sender account: another Gmail account may still send/schedule.
        $or: [
          { senderAccountId: account._id },
          { senderAccountId: null, senderAccount: account.address },
        ],
      });
      if (recent) {
        throw new HttpError(
          409,
          `An email was already sent to ${rec} for this application within the last 24 hours. Try again after 24 hours.`,
          { code: "EMAIL_24H_DEDUP", recipient: rec, alreadySentAt: recent.sentAt }
        );
      }
    }
  }

  let application = null;
  if (applicationId) {
    application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) throw new HttpError(404, "Application not found");

    if (!allowResend) {
      const alreadySent = await EmailLog.findOne({ owner: req.userId, application: applicationId, status: "Sent" });
      if (alreadySent) {
        throw new HttpError(409, "An email has already been sent for this application. Pass allowResend to send again.", {
          alreadySentAt: alreadySent.sentAt,
        });
      }
    }
  }

  let contacts;
  if (contactIds?.length) {
    contacts = await Contact.find({ _id: { $in: contactIds }, owner: req.userId });
  } else {
    // Inline email mode — no Contact document required
    contacts = [{ _id: null, email: recipientEmail, name: recipientName || "", companyRef: null, save: async () => {} }];
  }

  // Build attachments - all in memory, no disk writes
  let attachments = [];
  let resumeName = "";
  let resumeSize = 0;
  let usedResume = null;
  if (resumeId) {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const resume = profile?.resumes?.id(resumeId);
    if (!resume) throw new HttpError(404, "Resume not found");

    // Never trust a client-sent resume id: it must match the job title notes.
    if (application) {
      const validation = validateResumeForJob({
        resumes: profile.resumes,
        resumeId,
        jobTitle: application.jobTitle,
        jobExperience: getApplicationExperience(application),
        profileExperience: profile.experience || "",
      });
      if (!validation.valid) {
        throw new HttpError(
          409,
          `The selected resume does not match the job title "${application.jobTitle}". Email not sent.`,
          {
            code: "RESUME_MISMATCH",
            jobTitle: application.jobTitle,
            matchedResume: validation.resume,
            reason: validation.reason,
          }
        );
      }
    }

    const buffer = await fetchBuffer(resume.cloudinaryUrl);
    attachments.push({ filename: resume.originalName, content: buffer });
    resumeName = resume.originalName;
    resumeSize = resume.size || 0;
    usedResume = resume;
  } else if (attachmentFilename) {
    // In-memory upload buffer passed via req.file
    // (attachmentFilename is stored in frontend but buffer is in memory)
  }

  const results = [];
  for (const contact of contacts) {
    const trackingId = generateTrackingId();
    const trackingEnabled = true;

    const htmlContent = injectTrackingIntoHtml(message.replace(/\n/g, "<br/>"), trackingId, trackingEnabled);
    const textContent = injectTrackingIntoText(message, trackingId, trackingEnabled);

    const logEntry = await EmailLog.create({
      owner: req.userId,
      application: applicationId || null,
      company: companyId || contact.companyRef || null,
      contact: contact._id,
      recipient: contact.email,
      recipientName: contact.name || "",
      subject,
      body: message,
      status: "Pending",
      emailType,
      isAiGenerated,
      template: templateId || null,
      attachmentName: attachments[0]?.filename || "",
      resumeName,
      resumeSize,
      senderAccount: account.address,
      senderAccountId: account._id || null,
      trackingId,
      trackingEnabled,
    });

    try {
      await transporter.sendMail({
        from: `"${user.name}" <${account.address}>`,
        to: contact.email,
        subject,
        text: textContent,
        html: htmlContent,
        attachments,
      });
      contact.lastSentAt = new Date();
      await contact.save();

      logEntry.status = "Sent";
      logEntry.sentAt = new Date();
      await logEntry.save();

      results.push({ email: contact.email, status: "sent" });
    } catch (err) {
      logEntry.status = "Failed";
      logEntry.errorMessage = err.message;
      await logEntry.save();
      results.push({ email: contact.email, status: "failed", error: err.message });
    }
    // Small stagger between recipients only — never wait after the last one.
    if (contact !== contacts[contacts.length - 1]) await delay(1500);
  }

  if (application && usedResume) {
    application.resumeUsed = usedResume.originalName;
  }

  if (application) {
    const sentCount = results.filter((r) => r.status === "sent").length;
    if (sentCount > 0) {
      application.applicationDate = application.applicationDate || new Date();
      if (["NEW", "SAVED", "APPLYING"].includes(application.status)) {
        application.status = "EMAIL_SENT";
      }

      // Create the first follow-up (3 days from now) if one doesn't already exist
      // and follow-ups aren't disabled for this application.
      if (!application.followUpDisabled) {
        const FollowUp = (await import("../models/FollowUp.js")).default;
        const existing = await FollowUp.findOne({
          owner: req.userId,
          application: application._id,
        });
        if (!existing) {
          const followUpDate = followUpSlotAfter({
            days: 3,
            time: "11:00",
            timeZone: userScheduleTimezone(user),
          });
          await FollowUp.create({
            owner: req.userId,
            application: application._id,
            type: "Email Follow-up",
            date: followUpDate,
            note: "Auto-scheduled (3 days after first email). Edit if needed.",
            status: "Pending",
          });
          application.followUpDate = followUpDate;
        }
      }

      await logActivity(application, "email_sent", `Email sent to ${sentCount} recipient(s)${isAiGenerated ? " (AI-generated)" : ""}`);
    }
  }

  const sentTotal = results.filter((r) => r.status === "sent").length;
  await logUserEvent(req.authUser, "activity", `Sent email "${subject}" to ${sentTotal} recipient(s)`, { emailType, isAiGenerated, applicationId: applicationId || null }, req);

  return {
    results,
    resume: usedResume ? { _id: usedResume._id, originalName: usedResume.originalName } : null,
    senderAccount: account.address,
    senderAccountId: account._id ? String(account._id) : null,
  };
}

// POST /api/mail/send
// body: { contactIds: [...], subject, message, resumeId?, attachmentFilename?, applicationId?, companyId?,
//         emailType?, isAiGenerated?, templateId?, allowResend? }
router.post("/send", guardSlowSend, requireFeature("sendEmail"), async (req, res) => {
  try {
    const { results } = await performSend(req, req.body);
    res.json({ results });
  } catch (err) {
    sendError(res, err);
  }
});

const RESUME_REASON_MESSAGES = {
  no_resumes: "You have not uploaded any resume yet.",
  no_resume_notes: "None of your resumes has role notes. Add notes like \"Full Stack Developer\" or \"React Developer\" in your profile.",
  no_matching_resume: (title) => `No resume note matches the job title "${title}".`,
  missing_job_title: "This application has no job title to match against.",
};

function sendNoResumeMatch(res, { match, resumes, application }) {
  const message = match.reason === "no_matching_resume"
    ? RESUME_REASON_MESSAGES.no_matching_resume(application.jobTitle)
    : RESUME_REASON_MESSAGES[match.reason] || "No resume matches this job title.";
  return res.status(422).json({
    code: "NO_RESUME_MATCH",
    reason: match.reason,
    message,
    jobTitle: application.jobTitle,
    resumes: describeResumeMatches({
      resumes,
      jobTitle: application.jobTitle,
      jobExperience: getApplicationExperience(application),
    }),
  });
}

async function resolveApplicationRecipient({ userId, application }) {
  let contactId = application.contact || null;
  let contactEmail = "";
  let contactName = "";
  if (contactId) {
    const contact = await Contact.findOne({ _id: contactId, owner: userId });
    if (contact?.email) {
      contactEmail = contact.email;
      contactName = contact.name || "";
    } else {
      contactId = null;
    }
  }
  if (!contactId && !application.hrEmail) {
    throw new HttpError(400, "This application has no recruiter email. Add an HR email first.");
  }
  return {
    contactId,
    // Always expose a concrete address so the preview can show it and the
    // inline-send fallback keeps working when the contact changes.
    recipientEmail: contactEmail || application.hrEmail || "",
    recipientName: contactName || application.hrName || "",
  };
}

async function getOrGenerateDraft({
  req, application, profile, tone, length, provider, model, subject, body, user,
  draftTimeoutMs, allowTemplateFallback = false,
  matchedResume = null,
}) {
  if (String(subject || "").trim() && String(body || "").trim()) {
    return { subject: String(subject).trim(), body: String(body), generated: false, fallback: false };
  }

  const resumeExperience = matchedResume ? getResumeEffectiveExperience(matchedResume) : null;

  try {
    const generated = await generateApplicationEmail({
      profile,
      application,
      tone,
      length,
      userProviders: user?.aiProviders || [],
      provider,
      model,
      timeoutMs: draftTimeoutMs,
      resumeExperience,
    });
    return {
      subject: String(subject || "").trim() || generated.subject,
      body: String(body || "").trim() || generated.body,
      generated: true,
      fallback: false,
    };
  } catch (err) {
    // One-click send must stay inside the serverless time budget, so a slow or
    // failing AI provider falls back to a truthful template instead of leaving
    // the request hanging until Vercel kills it.
    if (!allowTemplateFallback) throw err;
    console.error("[mail] AI draft unavailable, using template:", err.message);
    const template = buildFallbackApplicationEmail({ profile, application, resumeExperience });
    return {
      subject: String(subject || "").trim() || template.subject,
      body: String(body || "").trim() || template.body,
      generated: false,
      fallback: true,
    };
  }
}

// POST /api/mail/draft
// Preview step: match resume → generate AI email, WITHOUT sending.
router.post("/draft", guardSlowSend, requireFeature("aiEmail"), async (req, res) => {
  try {
    const { applicationId, tone, length, provider, model, manualResumeId } = req.body;
    if (!applicationId) throw new HttpError(400, "applicationId is required");

    const application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) throw new HttpError(404, "Application not found");

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const resumes = profile?.resumes || [];

    let match = null;
    let matchedResume = null;
    let matchedResumeId = null;

    // If a manual resume ID is provided, use that resume directly
    if (manualResumeId) {
      const manualResume = resumes.find((r) => String(r._id) === String(manualResumeId));
      if (manualResume) {
        match = { matched: true, resume: manualResume, resumeId: String(manualResume._id), score: 1, matchedTerms: [], experienceMatch: "manual", reason: null, jobTitle: application.jobTitle };
        matchedResume = manualResume;
        matchedResumeId = String(manualResume._id);
      }
    }

    // Fall back to automatic matching
    if (!match) {
      match = matchResumeForJob({
        resumes,
        jobTitle: application.jobTitle,
        profileExperience: profile?.experience || "",
        jobExperience: getApplicationExperience(application),
      });
    }

    if (!match.matched) return sendNoResumeMatch(res, { match, resumes, application });

    const publicMatchedResume = match.resume ? publicResume(match.resume) : null;
    // Get the full resume object for experience extraction
    const fullResume = matchedResume || resumes.find((r) => String(r._id) === String(match.resumeId));

    const recipient = await resolveApplicationRecipient({ userId: req.userId, application });
    const user = await User.findById(req.userId);
    const draft = await getOrGenerateDraft({
      req, application, profile, tone, length, provider, model, user,
      matchedResume: match.resume,
    });

    const alreadySent = await EmailLog.findOne({
      owner: req.userId,
      application: application._id,
      status: "Sent",
      emailType: "Job Application",
    });

    res.json({
      draft: { subject: draft.subject, body: draft.body },
      resume: match.resume,
      resumeId: match.resumeId,
      matchedTerms: match.matchedTerms,
      experienceMatch: match.experienceMatch,
      recipient: recipient.recipientEmail,
      recipientName: recipient.recipientName || application.hrName || "",
      contactId: recipient.contactId ? String(recipient.contactId) : null,
      hasRecipient: !!(recipient.contactId || recipient.recipientEmail),
      emailAlreadySent: !!alreadySent,
      alreadySentAt: alreadySent?.sentAt || null,
      manual: !!manualResumeId,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/mail/auto-send
// Match resume notes → generate (or use supplied) email → send now or schedule.
// If no resume note matches the job title we return 422 and never fall back.
router.post("/auto-send", guardSlowSend, requireFeature("sendEmail"), requireFeature("aiEmail"), async (req, res) => {
  try {
    const {
      applicationId, tone, length, allowResend = false, provider, model,
      mode = "send", accountId = null, scheduledAt, timezone = DEFAULT_TIMEZONE,
      subject, body, scheduleOtherAccounts = false, manualResumeId,
    } = req.body;
    if (!applicationId) throw new HttpError(400, "applicationId is required");
    if (!["send", "schedule"].includes(mode)) throw new HttpError(400, "mode must be 'send' or 'schedule'");

    const application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) throw new HttpError(404, "Application not found");

    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(404, "User not found");
    const sender = await resolveEmailAccount(user, accountId);

    if (!allowResend) {
      const alreadySent = await EmailLog.findOne({
        owner: req.userId,
        application: applicationId,
        status: "Sent",
        emailType: "Job Application",
        $or: [
          { senderAccountId: sender._id },
          { senderAccountId: null, senderAccount: sender.address },
        ],
      });
      if (alreadySent) {
        throw new HttpError(
          409,
          `An email has already been sent for this application from ${sender.address}.`,
          { alreadySentAt: alreadySent.sentAt, code: "ALREADY_SENT" }
        );
      }
    }

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const resumes = profile?.resumes || [];

    let match = null;
    // If a manual resume ID is provided, use that resume directly (skip auto-matching)
    if (manualResumeId) {
      const manualResume = resumes.find((r) => String(r._id) === String(manualResumeId));
      if (manualResume) {
        match = {
          matched: true,
          resume: manualResume,
          resumeId: String(manualResume._id),
          score: 1,
          matchedTerms: [],
          experienceMatch: "manual",
          reason: null,
          jobTitle: application.jobTitle,
        };
      }
    }

    // Fall back to automatic matching
    if (!match) {
      match = matchResumeForJob({
        resumes,
        jobTitle: application.jobTitle,
        profileExperience: profile?.experience || "",
        jobExperience: getApplicationExperience(application),
      });
    }

    if (!match.matched) return sendNoResumeMatch(res, { match, resumes, application });

    const recipient = await resolveApplicationRecipient({ userId: req.userId, application });
    const draft = await getOrGenerateDraft({
      req, application, profile, tone, length, provider, model, subject, body, user,
      draftTimeoutMs: QUICK_DRAFT_TIMEOUT_MS,
      allowTemplateFallback: true,
      matchedResume: match.resume,
    });

    if (mode === "schedule") {
      const job = await createScheduledEmail({
        user,
        input: {
          applicationId: application._id,
          contactId: recipient.contactId,
          recipientEmail: recipient.recipientEmail,
          recipientName: recipient.recipientName,
          subject: draft.subject,
          body: draft.body,
          resumeId: match.resumeId,
          accountId,
          scheduledAt,
          timezone,
          emailType: "Job Application",
          isAiGenerated: draft.generated,
          allowResend,
        },
      });

      logSlowSend(res, "auto-send (scheduled)", `aiDraft=${draft.generated}`);
      return res.status(201).json({
        scheduled: true,
        email: toPublicScheduledEmail(job),
        draft: { subject: draft.subject, body: draft.body },
        resume: match.resume,
        matchedTerms: match.matchedTerms,
        experienceMatch: match.experienceMatch,
      });
    }

    const params = {
      applicationId: application._id,
      subject: draft.subject,
      message: draft.body,
      resumeId: match.resumeId,
      isAiGenerated: draft.generated,
      emailType: "Job Application",
      allowResend,
      accountId,
    };
    if (recipient.contactId) {
      params.contactIds = [recipient.contactId];
    } else {
      params.recipientEmail = recipient.recipientEmail;
      params.recipientName = recipient.recipientName;
    }

    const out = await performSend(req, params);
    const emailSent = out.results.some((r) => r.status === "sent");

    // Schedule the same application email from the other accounts (per their
    // own preferred time/timezone) so one click covers every sender account.
    let scheduleResult = { scheduled: [], skipped: [], errors: [] };
    if (scheduleOtherAccounts && emailSent) {
      scheduleResult = await scheduleForOtherAccounts({
        user,
        application,
        recipient,
        draft,
        resumeId: match.resumeId,
        senderAccountId: out.senderAccountId || sender._id,
        allowResend,
      });
    }

    logSlowSend(
      res,
      "auto-send (send)",
      `aiDraft=${draft.generated} fallback=${!!draft.fallback} scheduled=${scheduleResult.scheduled.length}`
    );
    res.json({
      ...out,
      draft: { subject: draft.subject, body: draft.body },
      aiFallback: !!draft.fallback,
      resume: match.resume,
      matchedTerms: match.matchedTerms,
      experienceMatch: match.experienceMatch,
      emailSent,
      scheduledOther: scheduleResult.scheduled,
      scheduleSkipped: scheduleResult.skipped,
      scheduleErrors: scheduleResult.errors,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/mail/auto-send-multi — send from default account now, schedule for other accounts per their prefs
router.post("/auto-send-multi", guardSlowSend, requireFeature("sendEmail"), requireFeature("aiEmail"), async (req, res) => {
  try {
    const {
      applicationId, tone, length, allowResend = false, provider, model,
      subject, body, manualResumeId,
    } = req.body;
    if (!applicationId) throw new HttpError(400, "applicationId is required");

    const application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) throw new HttpError(404, "Application not found");

    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(404, "User not found");

    // Only accounts that are enabled AND have an App Password may send.
    const enabledAccounts = usableEmailAccounts(user);
    console.log(`[auto-send-multi] ${enabledAccounts.length} usable accounts out of ${(user.emailAccounts || []).length} total`);
    if (!enabledAccounts.length) {
      throw new HttpError(
        400,
        "No enabled Gmail account with an App Password. Enable an account or add its App Password in Settings → Gmail Accounts."
      );
    }

    // Default account sends NOW
    const defaultAccount = enabledAccounts.find((a) => a.isDefault) || enabledAccounts[0];

    if (!allowResend) {
      const alreadySent = await EmailLog.findOne({
        owner: req.userId,
        application: applicationId,
        status: "Sent",
        emailType: "Job Application",
        $or: [
          { senderAccountId: defaultAccount._id },
          { senderAccountId: null, senderAccount: defaultAccount.address },
        ],
      });
      if (alreadySent) {
        throw new HttpError(
          409,
          `An email has already been sent for this application from ${defaultAccount.address}.`,
          { alreadySentAt: alreadySent.sentAt, code: "ALREADY_SENT" }
        );
      }
    }

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const resumes = profile?.resumes || [];

    let match = null;
    if (manualResumeId) {
      const manualResume = resumes.find((r) => String(r._id) === String(manualResumeId));
      if (manualResume) {
        match = {
          matched: true,
          resume: manualResume,
          resumeId: String(manualResume._id),
          score: 1,
          matchedTerms: [],
          experienceMatch: "manual",
          reason: null,
          jobTitle: application.jobTitle,
        };
      }
    }

    if (!match) {
      match = matchResumeForJob({
        resumes,
        jobTitle: application.jobTitle,
        profileExperience: profile?.experience || "",
        jobExperience: getApplicationExperience(application),
      });
    }

    if (!match.matched) return sendNoResumeMatch(res, { match, resumes, application });

    const recipient = await resolveApplicationRecipient({ userId: req.userId, application });
    const draft = await getOrGenerateDraft({
      req, application, profile, tone, length, provider, model, subject, body, user,
      draftTimeoutMs: QUICK_DRAFT_TIMEOUT_MS,
      allowTemplateFallback: true,
      matchedResume: match.resume,
    });

    // Send immediately from default account
    const sendParams = {
      applicationId: application._id,
      subject: draft.subject,
      message: draft.body,
      resumeId: match.resumeId,
      isAiGenerated: draft.generated,
      emailType: "Job Application",
      allowResend,
      accountId: String(defaultAccount._id),
    };
    if (recipient.contactId) {
      sendParams.contactIds = [recipient.contactId];
    } else {
      sendParams.recipientEmail = recipient.recipientEmail;
      sendParams.recipientName = recipient.recipientName;
    }

    const sendResult = await performSend(req, sendParams);
    const sentNow = sendResult.results.some((r) => r.status === "sent");

    // Schedule the same email from every other account at its own preferred
    // time/timezone (weekends skipped).
    let scheduleResult = { scheduled: [], skipped: [], errors: [] };
    if (sentNow) {
      scheduleResult = await scheduleForOtherAccounts({
        user,
        application,
        recipient,
        draft,
        resumeId: match.resumeId,
        senderAccountId: defaultAccount._id,
        allowResend,
      });
    }

    const summary = {
      scheduledOther: scheduleResult.scheduled,
      scheduleSkipped: scheduleResult.skipped,
      scheduleErrors: scheduleResult.errors,
    };

    logSlowSend(res, "auto-send-multi", `scheduled=${scheduleResult.scheduled.length} skipped=${scheduleResult.skipped.length} errors=${scheduleResult.errors.length} fallback=${!!draft.fallback}`);
    res.json({
      sentNow,
      aiFallback: !!draft.fallback,
      draft: { subject: draft.subject, body: draft.body },
      resume: match.resume,
      matchedTerms: match.matchedTerms,
      experienceMatch: match.experienceMatch,
      scheduled: scheduleResult.scheduled,
      defaultAccount: defaultAccount.address,
      ...summary,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/mail/reply - Reply to an existing email (threaded)
router.post("/reply", guardSlowSend, requireFeature("sendEmail"), async (req, res) => {
  try {
    const { parentEmailId, contactIds, subject, message, resumeId, attachmentFilename } = req.body;
    if (!parentEmailId || !contactIds?.length || !message) {
      return res.status(400).json({ message: "parentEmailId, contactIds and message are required" });
    }

    const parentEmail = await EmailLog.findOne({ _id: parentEmailId, owner: req.userId });
    if (!parentEmail) return res.status(404).json({ message: "Parent email not found" });

    const user = await User.findById(req.userId);
    const transporter = getTransporter(user);

    const contacts = await Contact.find({ _id: { $in: contactIds }, owner: req.userId });

    let attachments = [];
    if (resumeId) {
      const profile = await CandidateProfile.findOne({ owner: req.userId });
      const resume = profile?.resumes?.id(resumeId);
      if (resume) {
        const buffer = await fetchBuffer(resume.cloudinaryUrl);
        attachments.push({ filename: resume.originalName, content: buffer });
      }
    } else if (attachmentFilename) {
      // attachmentFilename noted but no disk buffer available
    }

    const threadId = parentEmail.threadId || parentEmail._id.toString();
    const references = [...(parentEmail.references || []), parentEmail._id.toString()];

    const results = [];
    for (const contact of contacts) {
      const trackingId = generateTrackingId();
      const trackingEnabled = true;

      const replySubject = subject.startsWith("Re:") ? subject : `Re: ${parentEmail.subject}`;
      const htmlContent = injectTrackingIntoHtml(message.replace(/\n/g, "<br/>"), trackingId, trackingEnabled);
      const textContent = injectTrackingIntoText(message, trackingId, trackingEnabled);

      const logEntry = await EmailLog.create({
        owner: req.userId,
        application: parentEmail.application,
        company: parentEmail.company,
        contact: contact._id,
        recipient: contact.email,
        recipientName: contact.name || "",
        subject: replySubject,
        body: message,
        status: "Pending",
        emailType: "Recruiter Response",
        isAiGenerated: false,
        attachmentName: attachments[0]?.filename || "",
        trackingId,
        trackingEnabled,
        threadId,
        inReplyTo: parentEmail._id.toString(),
        references,
        isReply: true,
        parentEmail: parentEmail._id,
      });

      try {
        await transporter.sendMail({
          from: `"${user.name}" <${user.gmailAddress}>`,
          to: contact.email,
          subject: replySubject,
          text: textContent,
          html: htmlContent,
          attachments,
          inReplyTo: parentEmail._id.toString(),
          references: references.join(" "),
        });
        contact.lastSentAt = new Date();
        await contact.save();

        logEntry.status = "Sent";
        logEntry.sentAt = new Date();
        await logEntry.save();

        results.push({ email: contact.email, status: "sent" });
      } catch (err) {
        logEntry.status = "Failed";
        logEntry.errorMessage = err.message;
        await logEntry.save();
        results.push({ email: contact.email, status: "failed", error: err.message });
      }
      await delay(1500);
    }

    if (parentEmail.application) {
      const application = await Application.findById(parentEmail.application);
      if (application) {
        await logActivity(application, "email_sent", `Reply sent to ${results.filter(r => r.status === "sent").length} recipient(s)`);
      }
    }

    await logUserEvent(req.authUser, "activity", `Replied to email "${parentEmail.subject}"`, { parentEmailId: parentEmail._id }, req);

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/mail/thread/:emailId - Get full email thread
router.get("/thread/:emailId", async (req, res) => {
  try {
    const email = await EmailLog.findOne({ _id: req.params.emailId, owner: req.userId });
    if (!email) return res.status(404).json({ message: "Email not found" });

    const threadId = email.threadId || email._id.toString();
    const thread = await EmailLog.find({ owner: req.userId, threadId })
      .sort({ createdAt: 1 })
      .populate("contact", "name email")
      .populate("application", "jobTitle companyName");

    res.json({ thread, rootEmail: email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
