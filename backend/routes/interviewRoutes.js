import express from "express";
import Interview from "../models/Interview.js";
import Application from "../models/Application.js";
import authMiddleware from "../middleware/auth.js";
import { logActivity } from "../utils/activity.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/interviews?scope=upcoming
router.get("/", async (req, res) => {
  try {
    const { application, scope } = req.query;
    const query = { owner: req.userId };
    if (application) query.application = application;
    if (scope === "upcoming") {
      query.date = { $gte: new Date() };
      query.result = { $in: ["Scheduled", "Rescheduled"] };
    }

    const interviews = await Interview.find(query)
      .populate({ path: "application", select: "jobTitle companyName company", populate: { path: "company", select: "name" } })
      .sort({ date: 1 });
    res.json(interviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/interviews
router.post("/", async (req, res) => {
  try {
    const { application, round, interviewType, date, meetingUrl, interviewer, notes, result } = req.body;
    if (!application || !date) return res.status(400).json({ message: "application and date are required" });

    const app = await Application.findOne({ _id: application, owner: req.userId });
    if (!app) return res.status(404).json({ message: "Application not found" });

    const interview = await Interview.create({
      owner: req.userId, application, round, interviewType, date, meetingUrl, interviewer, notes, result,
    });

    await logActivity(app, "interview", `${round || "Interview"} (${interviewType || "Video"}) scheduled for ${new Date(date).toLocaleString()}`);
    if (app.status === "APPLIED" || app.status === "EMAIL_SENT" || app.status === "RECRUITER_REPLIED") {
      app.status = "INTERVIEW_SCHEDULED";
      await app.save();
    }

    res.status(201).json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/interviews/:id  (edit or update result)
router.put("/:id", async (req, res) => {
  try {
    const interview = await Interview.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, req.body, { new: true });
    if (!interview) return res.status(404).json({ message: "Not found" });

    if (req.body.result) {
      const app = await Application.findOne({ _id: interview.application, owner: req.userId });
      if (app) await logActivity(app, "interview_result", `${interview.round} marked as ${req.body.result}`);
    }

    res.json(interview);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/interviews/:id
router.delete("/:id", async (req, res) => {
  const interview = await Interview.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!interview) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
