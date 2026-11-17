import express from "express";
import User from "../models/User.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import CandidateProfile from "../models/CandidateProfile.js";
import { sendFollowUpEmail } from "../utils/followUpSender.js";
import { processDueScheduledEmails } from "../services/scheduler.js";
import { isFollowUpDue, userScheduleTimezone } from "../utils/scheduling.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

const ADMIN_EMAIL = "manish12099@gmail.com";

// Core logic: send AI follow-up emails for applications with due follow-ups.
// Follow-ups are recurring (every 3 days) and are created after the first email is sent.
export const runAutoFollowUps = async () => {
  const now = new Date();

  // Find pending follow-ups that are due (date <= now) and not disabled
  const FollowUp = (await import("../models/FollowUp.js")).default;
  const dueFollowUps = await FollowUp.find({
    date: { $lte: now },
    status: "Pending",
    disabled: { $ne: true },
  })
    .populate("application")
    .limit(50);

  let sent = 0;
  let scheduled = 0;
  let skipped = 0;

  for (const followUp of dueFollowUps) {
    const application = followUp.application;
    if (!application) {
      // Orphaned follow-up
      skipped++;
      continue;
    }

    try {
      const user = await User.findById(application.owner);
      if (!user || !user.gmailConnected || user.isDisabled) {
        skipped++;
        continue;
      }

      // Calendar-day guard: a follow-up dated 18 Nov must never be sent on
      // 17 Nov just because the stored instant falls on the previous UTC day.
      const timeZone = userScheduleTimezone(user);
      if (!isFollowUpDue({ date: followUp.date, now, timeZone })) {
        skipped++;
        continue;
      }

      // Skip if follow-ups are disabled on the application
      if (application.followUpDisabled) {
        followUp.status = "Cancelled";
        await followUp.save();
        skipped++;
        continue;
      }

      const contact = application.contact
        ? await Contact.findById(application.contact)
        : null;

      const profile = await CandidateProfile.findOne({ owner: user._id });
      const result = await sendFollowUpEmail({ user, application, contact, profile, followUp });

      if (result.sent) {
        sent++;
        scheduled += result.scheduled?.length || 0;
      } else skipped++;
    } catch (err) {
      console.error("Auto follow-up failed for application", application._id, err.message);
      skipped++;
    }
  }

  return { sent, scheduled, skipped, ranAt: new Date().toISOString() };
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

// GET /api/cron/process-scheduled-emails - invoked by Vercel Cron (or manually)
// The CRON_SECRET header protects this endpoint because it sends real emails.
router.get("/process-scheduled-emails", async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({
        message: "CRON_SECRET is not configured. Set it in the server environment to enable the scheduler cron.",
      });
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const result = await processDueScheduledEmails({ limit });
    res.json({
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      ranAt: result.ranAt,
    });
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
