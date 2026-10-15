import express from "express";
import FollowUp from "../models/FollowUp.js";
import Application from "../models/Application.js";
import Contact from "../models/Contact.js";
import EmailLog from "../models/EmailLog.js";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { logActivity } from "../utils/activity.js";
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
router.post("/:id/send", async (req, res) => {
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
    res.json({ message: "Follow-up sent", subject: result.subject });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
