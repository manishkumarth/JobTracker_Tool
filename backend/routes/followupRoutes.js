import express from "express";
import FollowUp from "../models/FollowUp.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import EmailLog from "../models/EmailLog.js";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { logActivity } from "../utils/activity.js";
import { logUserEvent } from "../utils/userLog.js";
import { sendFollowUpEmail } from "../utils/followUpSender.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/followups?scope=today|overdue|upcoming|all
router.get("/", async (req, res) => {
  try {
    const { scope = "all", application } = req.query;
    const query = { owner: req.userId };
    if (application) query.application = application;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (scope === "today") {
      query.status = "Pending";
      query.date = { $gte: startOfToday, $lte: endOfToday };
    } else if (scope === "overdue") {
      query.status = "Pending";
      query.date = { $lt: startOfToday };
    } else if (scope === "upcoming") {
      query.status = "Pending";
      query.date = { $gt: endOfToday };
    }

    // Self-healing backfill: follow-up emails sent before follow-ups were
    // synced with this collection (cron auto-followup, bulk send, older
    // builds) created EmailLog entries but no FollowUp documents, so they
    // never appeared here. Surface them now. Idempotent, runs before the
    // main query so backfilled docs are included in this response.
    const logs = await EmailLog.find({
      owner: req.userId,
      emailType: "Follow-up",
      status: { $in: ["Sent", "Failed", "Pending"] },
    })
      .select("application status sentAt createdAt")
      .sort({ createdAt: -1 });

    if (logs.length) {
      const sentAppIds = [];
      const latestByApp = new Map();
      for (const log of logs) {
        if (!log.application) continue;
        const key = String(log.application);
        if (log.status === "Sent") sentAppIds.push(log.application);
        if (!latestByApp.has(key)) latestByApp.set(key, log);
      }

      // Emails were sent for these apps: complete any still-pending email
      // follow-up docs left over from before the sync existed.
      if (sentAppIds.length) {
        const pendingDocs = await FollowUp.find({
          owner: req.userId,
          type: "Email Follow-up",
          status: "Pending",
          application: { $in: sentAppIds },
        }).select("_id application");
        if (pendingDocs.length) {
          await FollowUp.updateMany(
            { _id: { $in: pendingDocs.map((d) => d._id) } },
            { status: "Completed" }
          );
          await Application.updateMany(
            { owner: req.userId, _id: { $in: pendingDocs.map((d) => d.application) } },
            { $set: { followUpDate: null } }
          );
        }
      }

      // Create docs for apps that have follow-up email logs but no email
      // follow-up doc at all. Sent -> Completed; Failed/stuck Pending ->
      // Pending (so they show as overdue and can be retried from here).
      const appsWithDocs = new Set(
        (
          await FollowUp.find({
            owner: req.userId,
            type: "Email Follow-up",
            application: { $in: [...latestByApp.keys()] },
          }).select("application")
        ).map((d) => String(d.application))
      );

      const toCreate = [];
      for (const [key, log] of latestByApp) {
        if (appsWithDocs.has(key)) continue;
        toCreate.push(
          log.status === "Sent"
            ? {
                owner: req.userId,
                application: log.application,
                type: "Email Follow-up",
                date: log.sentAt || log.createdAt,
                note: "Follow-up email sent",
                status: "Completed",
              }
            : {
                owner: req.userId,
                application: log.application,
                type: "Email Follow-up",
                date: log.createdAt,
                note:
                  log.status === "Failed"
                    ? "Follow-up email failed - retry from here"
                    : "Follow-up email not sent yet - retry from here",
                status: "Pending",
              }
        );
      }
      if (toCreate.length) {
        try {
          await FollowUp.insertMany(toCreate, { ordered: false });
        } catch {
          /* concurrent request race - safe to ignore */
        }
      }
    }

    const followUps = await FollowUp.find(query)
      .populate({ path: "application", select: "jobTitle companyName company" })
      .sort({ date: 1 });

    // Flag whether an email follow-up has already been sent for each application
    const appIds = followUps
      .map((f) => (f.application?._id ? f.application._id : f.application))
      .filter(Boolean);
    const sentLogs = await EmailLog.find({
      owner: req.userId,
      application: { $in: appIds },
      emailType: "Follow-up",
      status: "Sent",
    }).select("application");
    const sentSet = new Set(sentLogs.map((l) => String(l.application)));

    res.json(
      followUps.map((f) => ({
        ...f.toObject(),
        emailSent: sentSet.has(String(f.application?._id || f.application)),
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/followups
router.post("/", async (req, res) => {
  try {
    const { application, type, date, note } = req.body;
    if (!application || !date) return res.status(400).json({ message: "application and date are required" });

    const app = await Application.findOne({ _id: application, owner: req.userId });
    if (!app) return res.status(404).json({ message: "Application not found" });

    const followUp = await FollowUp.create({ owner: req.userId, application, type, date, note });
    app.followUpDate = date;
    await logActivity(app, "followup_scheduled", `Follow-up scheduled for ${new Date(date).toLocaleDateString()}`);

    res.status(201).json(followUp);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/followups/:id  (reschedule / edit note / change type)
router.put("/:id", async (req, res) => {
  const followUp = await FollowUp.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, req.body, { new: true });
  if (!followUp) return res.status(404).json({ message: "Not found" });
  res.json(followUp);
});

// PATCH /api/followups/:id/complete
router.patch("/:id/complete", async (req, res) => {
  const followUp = await FollowUp.findOneAndUpdate(
    { _id: req.params.id, owner: req.userId },
    { status: "Completed" },
    { new: true }
  );
  if (!followUp) return res.status(404).json({ message: "Not found" });
  res.json(followUp);
});

// PATCH /api/followups/:id/cancel
router.patch("/:id/cancel", async (req, res) => {
  const followUp = await FollowUp.findOneAndUpdate(
    { _id: req.params.id, owner: req.userId },
    { status: "Cancelled" },
    { new: true }
  );
  if (!followUp) return res.status(404).json({ message: "Not found" });
  res.json(followUp);
});

// DELETE /api/followups/:id
router.delete("/:id", async (req, res) => {
  const followUp = await FollowUp.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!followUp) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

// POST /api/followups/:id/send - generate + send the AI follow-up email now
router.post("/:id/send", requireFeature("autoFollowUp"), async (req, res) => {
  try {
    const followUp = await FollowUp.findOne({ _id: req.params.id, owner: req.userId });
    if (!followUp) return res.status(404).json({ message: "Follow-up not found" });

    const application = await Application.findOne({ _id: followUp.application, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Application not found" });

    const user = await User.findById(req.userId);
    if (!user.gmailConnected) {
      return res.status(400).json({ message: "Connect Gmail in Config before sending follow-ups" });
    }

    const contact = application.contact ? await Contact.findById(application.contact) : null;
    const profile = await CandidateProfile.findOne({ owner: req.userId });

    const result = await sendFollowUpEmail({ user, application, contact, profile });
    if (!result.sent) {
      if (result.reason === "already_sent") {
        return res.status(409).json({ message: "A follow-up email has already been sent for this application" });
      }
      return res.status(400).json({ message: "Could not send follow-up: " + (result.reason || "unknown error") });
    }

    await FollowUp.findByIdAndUpdate(followUp._id, { status: "Completed" });
    await logUserEvent(req.authUser, "activity", `Sent follow-up for ${application.jobTitle || "application"}`, { applicationId: application._id, followUpId: followUp._id }, req);
    res.json({ message: "Follow-up sent", subject: result.subject });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
