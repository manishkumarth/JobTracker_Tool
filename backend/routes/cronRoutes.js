import express from "express";
import User from "../models/User.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import CandidateProfile from "../models/CandidateProfile.js";
import { sendFollowUpEmail } from "../utils/followUpSender.js";
import { processDueScheduledEmails } from "../services/scheduler.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

const ADMIN_EMAIL = "manish12099@gmail.com";

// Core logic: send AI follow-up emails for applications sent ~3 days ago with no follow-up yet.
export const runAutoFollowUps = async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

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

      const contact = application.contact
        ? await Contact.findById(application.contact)
        : null;

      const profile = await CandidateProfile.findOne({ owner: user._id });
      const result = await sendFollowUpEmail({ user, application, contact, profile });

      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      console.error("Auto follow-up failed for application", application._id, err.message);
      skipped++;
    }
  }

  return { sent, skipped, ranAt: new Date().toISOString() };
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
