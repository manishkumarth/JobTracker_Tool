import CandidateProfile from "../models/CandidateProfile.js";
import EmailLog from "../models/EmailLog.js";
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
export const sendFollowUpEmail = async ({ user, application, contact, profile }) => {
  if (!user?.gmailConnected) return { sent: false, reason: "Gmail not connected" };

  const recipientEmail = contact?.email || application.hrEmail;
  if (!recipientEmail) return { sent: false, reason: "No recipient email" };

  const existing = await EmailLog.findOne({
    owner: user._id,
    application: application._id,
    emailType: "Follow-up",
  });
  if (existing) return { sent: false, reason: "already_sent" };

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
  if (!parsed.subject || !parsed.body) return { sent: false, reason: "bad_response" };

  const subject = sanitizeText(parsed.subject);
  const body = sanitizeText(parsed.body);

  const transporter = getTransporter(user);
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
    trackingId,
    trackingEnabled: true,
  });

  await transporter.sendMail({
    from: `"${user.name}" <${user.gmailAddress}>`,
    to: recipientEmail,
    subject,
    text: textContent,
    html: htmlContent,
  });

  logEntry.status = "Sent";
  logEntry.sentAt = new Date();
  await logEntry.save();

  application.status = "FOLLOW_UP_SENT";
  await application.save();

  return { sent: true, subject };
};
