import CandidateProfile from "../models/CandidateProfile.js";
import EmailLog from "../models/EmailLog.js";
import FollowUp from "../models/FollowUp.js";
import { callLLM, parseJson } from "./llmClient.js";
import { createTransporter } from "./mailer.js";
import { resolveEmailAccount } from "./emailAccounts.js";
import { scheduleForOtherAccounts } from "../services/multiAccountScheduler.js";
import { followUpSlotAfter, userScheduleTimezone, zonedDayBounds } from "./scheduling.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "./tracking.js";

const JSON_ONLY = "Respond ONLY with raw JSON, no markdown fences, no preamble";

const sanitizeText = (text) =>
  (text || "")
    .replace(/\[\s*\]/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim();

const candidateFactsBlock = (profile) => `
CANDIDATE FACTS (the ONLY truth you may use about the candidate — never invent anything beyond this):
Name: ${profile?.name || "(not provided)"}
Title: ${profile?.professionalTitle || "(not provided)"}
Experience: ${profile?.experience || "(not provided)"}
Skills: ${(profile?.skills || []).join(", ") || "(none listed)"}
Technologies: ${(profile?.technologies || []).join(", ") || "(none listed)"}
Previous companies: ${(profile?.previousCompanies || []).join(", ") || "(none listed)"}
Projects: ${(profile?.projects || []).join(", ") || "(none listed)"}
Education: ${profile?.education || "(not provided)"}`.trim();

const masterPromptBlock = (profile) =>
  profile?.masterPrompt?.trim()
    ? `\n\nUSER MASTER PROMPT (always follow these instructions):\n${profile.masterPrompt.trim()}\n`
    : "";

/**
 * Generates and sends an AI follow-up email for an application.
 * Returns { sent: boolean, reason?: string, subject?: string }.
 */
export const sendFollowUpEmail = async ({
  user,
  application,
  contact,
  profile,
  followUp = null,
  accountId = null,
  scheduleOtherAccounts = true,
}) => {
  if (!user?.gmailConnected) return { sent: false, reason: "Gmail not connected" };

  const recipientEmail = contact?.email || application.hrEmail;
  if (!recipientEmail) return { sent: false, reason: "No recipient email" };

  // Send from the default usable account (multi-account aware).
  let sender;
  try {
    sender = await resolveEmailAccount(user, accountId);
  } catch (err) {
    return { sent: false, reason: err.message };
  }

  // Follow-ups are recurring (every 3 days), so we only block a duplicate on
  // the SAME day. Blocking on any past Sent follow-up would silently stop the
  // whole recurring sequence after the first one.
  const timeZone = userScheduleTimezone(user);
  const { start: startOfToday } = zonedDayBounds(new Date(), timeZone);
  const existingToday = await EmailLog.findOne({
    owner: user._id,
    application: application._id,
    emailType: "Follow-up",
    status: "Sent",
    sentAt: { $gte: startOfToday },
  });
  if (existingToday) return { sent: false, reason: "already_sent_today" };

  const originalEmail = await EmailLog.findOne({
    owner: user._id,
    application: application._id,
    status: "Sent",
  }).sort({ createdAt: -1 });

  const prompt = `
You are an assistant that writes short, polite follow-up emails for job applications.

${candidateFactsBlock(profile)}

APPLICATION CONTEXT:
Job title: ${application.jobTitle}
Company: ${application.companyName || ""}
Applied on: ${application.applicationDate ? new Date(application.applicationDate).toDateString() : "unknown date"}
Recruiter: ${contact?.name || application.hrName || "(unknown)"}
Original email sent: ${originalEmail?.subject ? `Subject: ${originalEmail.subject}` : "(not on file)"}

Write a brief, professional follow-up email (under 100 words) checking in on the application status, referencing the original application politely without being pushy.

GREETING RULE: If a recruiter name is provided, start with "Dear <name>,". If no recruiter name is provided, start with "Dear Hiring Team," or "Dear Hiring Manager,". Never leave the greeting blank or use placeholders.
${masterPromptBlock(profile)}
${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

  const text = await callLLM({ userProviders: user.aiProviders || [], prompt });
  const parsed = parseJson(text);
  if (!parsed.subject || !parsed.body) {
    // AI failed (e.g., token limit, bad response) — create a Failed follow-up
    // so the user sees it in the Follow-ups list and can retry.
    await FollowUp.create({
      owner: user._id,
      application: application._id,
      type: "Email Follow-up",
      date: new Date(),
      note: "AI generation failed (token limit / bad response). Retry to send.",
      status: "Failed",
    });
    return { sent: false, reason: "bad_response" };
  }

  const subject = sanitizeText(parsed.subject);
  const body = sanitizeText(parsed.body);

  const transporter = createTransporter(sender.address, sender.appPassword);
  const trackingId = generateTrackingId();
  const htmlContent = injectTrackingIntoHtml(body.replace(/\n/g, "<br/>"), trackingId, true);
  const textContent = injectTrackingIntoText(body, trackingId, true);

  const logEntry = await EmailLog.create({
    owner: user._id,
    application: application._id,
    company: application.company || contact?.companyRef || null,
    contact: contact?._id || null,
    recipient: recipientEmail,
    recipientName: contact?.name || application.hrName || "",
    subject,
    body,
    status: "Pending",
    emailType: "Follow-up",
    isAiGenerated: true,
    senderAccount: sender.address,
    senderAccountId: sender._id || null,
    trackingId,
    trackingEnabled: true,
  });

  try {
    await transporter.sendMail({
      from: `"${user.name}" <${sender.address}>`,
      to: recipientEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });
  } catch (err) {
    // Mark the log Failed so it doesn't stay stuck at "Pending" in Email
    // History, and allow a retry (the already_sent guard only counts Sent).
    logEntry.status = "Failed";
    logEntry.errorMessage = err.message;
    await logEntry.save();

    // Create/refresh a Failed follow-up doc so the user can retry from the
    // Follow-ups page. Retrying an existing doc updates it instead of creating
    // a duplicate row on every attempt.
    if (followUp) {
      followUp.status = "Failed";
      followUp.note = `Send failed: ${err.message}. Retry to send.`;
      await followUp.save();
    } else {
      await FollowUp.create({
        owner: user._id,
        application: application._id,
        type: "Email Follow-up",
        date: new Date(),
        note: `Send failed: ${err.message}. Retry to send.`,
        status: "Failed",
      });
    }

    return { sent: false, reason: "send_failed" };
  }

  logEntry.status = "Sent";
  logEntry.sentAt = new Date();
  await logEntry.save();

  // Complete the follow-up that triggered this send (or the earliest pending
  // one) and schedule the NEXT one for 3 days later, unless disabled.
  const pendingFollowUp =
    followUp ||
    (await FollowUp.findOne({
      owner: user._id,
      application: application._id,
      status: { $in: ["Pending", "Failed"] },
    }).sort({ date: 1 }));
  if (pendingFollowUp) {
    pendingFollowUp.status = "Completed";
    pendingFollowUp.date = pendingFollowUp.date || new Date();
    await pendingFollowUp.save();
  }

  // Keep a history row for manual sends that had no scheduled doc. When a doc
  // triggered this send it is already marked Completed above — never duplicate.
  if (!pendingFollowUp) {
    await FollowUp.create({
      owner: user._id,
      application: application._id,
      type: "Email Follow-up",
      date: new Date(),
      note: "Follow-up email sent",
      status: "Completed",
    });
  }

  // Schedule the next follow-up (recurring every 3 days) at 11:00 in the
  // user's own timezone — never the server's UTC clock.
  if (!application.followUpDisabled) {
    const nextFollowUpDate = followUpSlotAfter({
      days: 3,
      time: "11:00",
      timeZone: userScheduleTimezone(user),
    });
    await FollowUp.create({
      owner: user._id,
      application: application._id,
      type: "Email Follow-up",
      date: nextFollowUpDate,
      note: "Auto-scheduled (3 days after last follow-up). Edit if needed.",
      status: "Pending",
    });
    application.followUpDate = nextFollowUpDate;
  } else {
    application.followUpDate = null;
  }

  application.status = "FOLLOW_UP_SENT";
  await application.save();

  // Schedule the SAME follow-up from every other usable account, each at its
  // own preferred time/timezone (never on a Sunday). The subject/body are
  // reused verbatim — no extra AI/LLM call is made for these copies.
  let scheduleSummary = { scheduled: [], skipped: [], errors: [] };
  if (scheduleOtherAccounts) {
    try {
      scheduleSummary = await scheduleForOtherAccounts({
        user,
        application,
        recipient: {
          contactId: contact?._id || null,
          recipientEmail,
          recipientName: contact?.name || application.hrName || "",
        },
        draft: { subject, body, generated: true },
        senderAccountId: sender._id,
        emailType: "Follow-up",
        skipDays: [0],
      });
    } catch (err) {
      console.error("[followup] multi-account scheduling failed:", err.message);
      scheduleSummary.errors.push({ accountEmail: "all", message: err.message });
    }
  }

  return {
    sent: true,
    subject,
    senderAccount: sender.address,
    scheduled: scheduleSummary.scheduled,
    scheduleSkipped: scheduleSummary.skipped,
    scheduleErrors: scheduleSummary.errors,
  };
};
