import express from "express";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import EmailLog from "../models/EmailLog.js";
import { callLLM, parseJson } from "../utils/llmClient.js";
import { getTransporter } from "../utils/mailer.js";
import { generateTrackingId, injectTrackingIntoHtml, injectTrackingIntoText } from "../utils/tracking.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

const ADMIN_EMAIL = "manish12099@gmail.com";
const JSON_ONLY = "Respond ONLY with raw JSON, no markdown fences, no preamble";

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

// Core logic: send AI follow-up emails for applications sent ~3 days ago with no follow-up yet.
export const runAutoFollowUps = async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Applications whose initial email was sent 3+ days ago and are still awaiting a response
  const candidates = await Application.find({
    applicationDate: { $lte: threeDaysAgo },
    status: { $in: ["EMAIL_SENT", "APPLYING", "SAVED", "NEW"] },
  }).limit(50);

  let sent = 0;
  let skipped = 0;

  for (const application of candidates) {
    try {
      const user = await User.findById(application.owner);
      if (!user || !user.gmailConnected || user.isDisabled) {
        skipped++;
        continue;
      }

      // Skip if a follow-up was already sent for this application
      const existingFollowUp = await EmailLog.findOne({
        owner: user._id,
        application: application._id,
        emailType: "Follow-up",
      });
      if (existingFollowUp) {
        skipped++;
        continue;
      }

      const contact = application.contact
        ? await Contact.findById(application.contact)
        : null;
      if (!contact?.email && !application.hrEmail) {
        skipped++;
        continue;
      }

      const profile = await CandidateProfile.findOne({ owner: user._id });
      const originalEmail = await EmailLog.findOne({
        owner: user._id,
        application: application._id,
        status: "Sent",
      }).sort({ createdAt: -1 });

      const userProviders = user.aiProviders || [];
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
${masterPromptBlock(profile)}
${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

      const text = await callLLM({ userProviders, prompt });
      const parsed = parseJson(text);
      if (!parsed.subject || !parsed.body) {
        skipped++;
        continue;
      }

      const transporter = getTransporter(user);
      const trackingId = generateTrackingId();
      const htmlContent = injectTrackingIntoHtml(parsed.body.replace(/\n/g, "<br/>"), trackingId, true);
      const textContent = injectTrackingIntoText(parsed.body, trackingId, true);

      const logEntry = await EmailLog.create({
        owner: user._id,
        application: application._id,
        company: application.company || contact?.companyRef || null,
        contact: contact?._id || null,
        recipient: contact?.email || application.hrEmail,
        recipientName: contact?.name || application.hrName || "",
        subject: parsed.subject,
        body: parsed.body,
        status: "Pending",
        emailType: "Follow-up",
        isAiGenerated: true,
        trackingId,
        trackingEnabled: true,
      });

      await transporter.sendMail({
        from: `"${user.name}" <${user.gmailAddress}>`,
        to: logEntry.recipient,
        subject: parsed.subject,
        text: textContent,
        html: htmlContent,
      });

      logEntry.status = "Sent";
      logEntry.sentAt = new Date();
      await logEntry.save();

      application.status = "FOLLOW_UP_SENT";
      await application.save();

      sent++;
    } catch (err) {
      console.error("Auto follow-up failed for application", application._id, err.message);
      skipped++;
    }
  }

  return { sent, skipped, ranAt: now.toISOString() };
};

// GET /api/cron/auto-followup - invoked by Vercel Cron (or manually)
router.get("/auto-followup", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const result = await runAutoFollowUps();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/cron/run-auto-followup - admin-triggered manual run
router.post("/run-auto-followup", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("email");
    if (!user || user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ message: "Admin access required" });
    }
    const result = await runAutoFollowUps();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
