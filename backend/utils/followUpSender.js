import https from "https";
import CandidateProfile from "../models/CandidateProfile.js";
import EmailLog from "../models/EmailLog.js";
import FollowUp from "../models/FollowUp.js";
import { callLLM, parseJson } from "./llmClient.js";
import { getTransporter } from "./mailer.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "./tracking.js";

const JSON_ONLY = "Respond ONLY with raw JSON, no markdown fences, no preamble";

const sanitizeText = (text) =>
  (text || "")
    .replace(/\[\s*\]/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim();

const fetchBuffer = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });

const buildLinksLine = (profile) => {
  const parts = [];
  if (profile?.linkedin?.trim()) parts.push(`LinkedIn: ${profile.linkedin.trim()}`);
  if (profile?.github?.trim()) parts.push(`GitHub: ${profile.github.trim()}`);
  if (profile?.portfolio?.trim()) parts.push(`Portfolio: ${profile.portfolio.trim()}`);
  return parts.length ? parts.join(" | ") : "(none provided)";
};

const candidateFactsBlock = (profile) => `
CANDIDATE FACTS (the ONLY truth you may use about the candidate — never invent anything beyond this):
Name: ${profile?.name || "(not provided)"}
Title: ${profile?.professionalTitle || "(not provided)"}
Experience: ${profile?.experience || "(not provided)"}
Current company: ${profile?.currentCompany || "(not provided)"}
Current CTC: ${profile?.currentCTC || "(not provided)"}
Expected CTC: ${profile?.expectedCTC || "(not provided)"}
Notice period: ${profile?.noticePeriod || "(not provided)"}
Location: ${profile?.location || "(not provided)"}
Phone: ${profile?.phone || "(not provided)"}
Email: ${profile?.email || "(not provided)"}
Skills: ${(profile?.skills || []).join(", ") || "(none listed)"}
Technologies: ${(profile?.technologies || []).join(", ") || "(none listed)"}
Previous companies: ${(profile?.previousCompanies || []).join(", ") || "(none listed)"}
Projects: ${(profile?.projects || []).join(", ") || "(none listed)"}
Education: ${profile?.education || "(not provided)"}
Links: ${buildLinksLine(profile)}`.trim();

const masterPromptBlock = (profile) =>
  profile?.masterPrompt?.trim()
    ? `\n\nUSER MASTER PROMPT (always follow these instructions):\n${profile.masterPrompt.trim()}\n`
    : "";

const pickResume = (profile) => {
  const resumes = profile?.resumes || [];
  return resumes.find((r) => r.isDefault) || resumes[0] || null;
};

/**
 * Generates and sends an AI follow-up email for an application.
 * When `followUp` is provided, the email answers only that follow-up's HR
 * request and sent-state is tracked on the follow-up itself.
 * Returns { sent: boolean, reason?: string, subject?: string }.
 */
export const sendFollowUpEmail = async ({ user, application, contact, profile, followUp }) => {
  if (!user?.gmailConnected) return { sent: false, reason: "Gmail not connected" };

  const recipientEmail = contact?.email || application.hrEmail;
  if (!recipientEmail) return { sent: false, reason: "No recipient email" };

  // Only a successfully SENT email for THIS follow-up blocks a retry. Older
  // callers without a follow-up fall back to the per-application guard.
  if (followUp?.emailSentAt) return { sent: false, reason: "already_sent" };

  const existing = followUp?._id
    ? await EmailLog.findOne({ owner: user._id, followUp: followUp._id, status: "Sent" })
    : await EmailLog.findOne({
        owner: user._id,
        application: application._id,
        emailType: "Follow-up",
        status: "Sent",
      });
  if (existing) return { sent: false, reason: "already_sent" };

  const originalEmail = await EmailLog.findOne({
    owner: user._id,
    application: application._id,
    status: "Sent",
  }).sort({ createdAt: -1 });

  const hrRequest = (followUp?.hrRequest || followUp?.note || "").trim();
  const resume = pickResume(profile);

  const prompt = `
You are an assistant that writes short, polite follow-up emails for job applications.

${candidateFactsBlock(profile)}

APPLICATION CONTEXT:
Job title: ${application.jobTitle}
Company: ${application.companyName || ""}
Applied on: ${application.applicationDate ? new Date(application.applicationDate).toDateString() : "unknown date"}
Recruiter: ${contact?.name || application.hrName || "(unknown)"}
Original email sent: ${originalEmail?.subject ? `Subject: ${originalEmail.subject}` : "(not on file)"}

RECRUITER'S REQUEST (answer ONLY what is asked here):
${hrRequest || "(no specific request — write a polite status follow-up)"}

STRICT CONTENT RULES:
- Include ONLY the details the recruiter actually asked for. If they asked for CTC, include Current CTC and Expected CTC from the candidate facts. If they asked for notice period, include the notice period. If they asked for experience, include experience. Do NOT dump unrelated profile details.
- If the recruiter did not ask for CTC, do NOT mention CTC or salary at all.
${resume ? "- The candidate's resume is attached to this email automatically — mention briefly that the resume is attached." : ""}
- ALWAYS include the candidate's Portfolio, LinkedIn and GitHub links in the signature when provided, each on its own line as a clean URL with no brackets.
- Never invent any detail that is not in the candidate facts.
- Keep it brief (under 120 words), professional and confident.

GREETING RULE: If a recruiter name is provided, start with "Dear <name>,". If no recruiter name is provided, start with "Dear Hiring Team," or "Dear Hiring Manager,". Never leave the greeting blank or use placeholders.
${masterPromptBlock(profile)}
${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

  const text = await callLLM({ userProviders: user.aiProviders || [], prompt });
  const parsed = parseJson(text);
  if (!parsed.subject || !parsed.body) return { sent: false, reason: "bad_response" };

  const subject = sanitizeText(parsed.subject);
  const body = sanitizeText(parsed.body);

  const transporter = getTransporter(user);
  const trackingId = generateTrackingId();
  const htmlContent = injectTrackingIntoHtml(body.replace(/\n/g, "<br/>"), trackingId, true);
  const textContent = injectTrackingIntoText(body, trackingId, true);

  let attachments = [];
  let resumeName = "";
  let resumeSize = 0;
  if (resume?.cloudinaryUrl) {
    try {
      const buffer = await fetchBuffer(resume.cloudinaryUrl);
      attachments.push({ filename: resume.originalName, content: buffer });
      resumeName = resume.originalName;
      resumeSize = resume.size || 0;
    } catch {
      attachments = [];
    }
  }

  const logEntry = await EmailLog.create({
    owner: user._id,
    application: application._id,
    followUp: followUp?._id || null,
    company: application.company || contact?.companyRef || null,
    contact: contact?._id || null,
    recipient: recipientEmail,
    recipientName: contact?.name || application.hrName || "",
    subject,
    body,
    status: "Pending",
    emailType: "Follow-up",
    isAiGenerated: true,
    attachmentName: attachments[0]?.filename || "",
    resumeName,
    resumeSize,
    trackingId,
    trackingEnabled: true,
  });

  try {
    await transporter.sendMail({
      from: `"${user.name}" <${user.gmailAddress}>`,
      to: recipientEmail,
      subject,
      text: textContent,
      html: htmlContent,
      attachments,
    });
  } catch (err) {
    // Mark the log Failed so it doesn't stay stuck at "Pending" in Email
    // History, and allow a retry (the already_sent guard only counts Sent).
    logEntry.status = "Failed";
    logEntry.errorMessage = err.message;
    await logEntry.save();
    return { sent: false, reason: "send_failed" };
  }

  logEntry.status = "Sent";
  logEntry.sentAt = new Date();
  await logEntry.save();

  if (followUp?._id) {
    followUp.status = "Completed";
    followUp.emailSentAt = new Date();
    followUp.emailLog = logEntry._id;
    await followUp.save();
    application.followUpDate = null;
  } else {
    // Keep the Follow-ups page in sync with Email History: complete any
    // scheduled follow-up for this application, or record this auto-send as a
    // completed follow-up so it appears in the Follow-ups list too.
    const pendingFollowUp = await FollowUp.findOne({
      owner: user._id,
      application: application._id,
      status: "Pending",
    }).sort({ date: -1 });
    if (pendingFollowUp) {
      pendingFollowUp.status = "Completed";
      pendingFollowUp.emailSentAt = new Date();
      pendingFollowUp.emailLog = logEntry._id;
      await pendingFollowUp.save();
      application.followUpDate = null;
    } else {
      const alreadyLogged = await FollowUp.findOne({
        owner: user._id,
        application: application._id,
        status: "Completed",
        type: "Email Follow-up",
      });
      if (!alreadyLogged) {
        await FollowUp.create({
          owner: user._id,
          application: application._id,
          type: "Email Follow-up",
          date: new Date(),
          note: "Follow-up email sent",
          emailSentAt: new Date(),
          emailLog: logEntry._id,
          status: "Completed",
        });
      }
    }
  }

  application.status = "FOLLOW_UP_SENT";
  await application.save();

  return { sent: true, subject };
};
