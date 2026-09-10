import express from "express";
import Interview from "../models/Interview.js";
import FollowUp from "../models/FollowUp.js";
import authMiddleware from "../middleware/auth.js";
import { generateICS, buildInterviewEvents, buildFollowUpEvents } from "../utils/ics.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/calendar/ics -> export all interviews and follow-ups as ICS
router.get("/ics", async (req, res) => {
  try {
    const { type = "all" } = req.query;

    const [interviews, followUps] = await Promise.all([
      type !== "followups" ? Interview.find({ owner: req.userId }).populate("application", "jobTitle companyName") : [],
      type !== "interviews" ? FollowUp.find({ owner: req.userId, status: "Pending" }).populate("application", "jobTitle companyName") : [],
    ]);

    const events = [
      ...buildInterviewEvents(interviews),
      ...buildFollowUpEvents(followUps),
    ];

    const icsContent = generateICS(events, "Job Applications Calendar");

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="job-applications-calendar.ics"',
    });
    res.send(icsContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/calendar/ics/interviews -> export only interviews
router.get("/ics/interviews", async (req, res) => {
  try {
    const interviews = await Interview.find({ owner: req.userId }).populate("application", "jobTitle companyName");
    const events = buildInterviewEvents(interviews);
    const icsContent = generateICS(events, "Interviews");

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interviews.ics"',
    });
    res.send(icsContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/calendar/ics/followups -> export only follow-ups
router.get("/ics/followups", async (req, res) => {
  try {
    const followUps = await FollowUp.find({ owner: req.userId, status: "Pending" }).populate("application", "jobTitle companyName");
    const events = buildFollowUpEvents(followUps);
    const icsContent = generateICS(events, "Follow-ups");

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="followups.ics"',
    });
    res.send(icsContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/calendar/ics/application/:id -> export events for a specific application
router.get("/ics/application/:id", async (req, res) => {
  try {
    const [interviews, followUps] = await Promise.all([
      Interview.find({ owner: req.userId, application: req.params.id }).populate("application", "jobTitle companyName"),
      FollowUp.find({ owner: req.userId, application: req.params.id, status: "Pending" }).populate("application", "jobTitle companyName"),
    ]);

    const events = [
      ...buildInterviewEvents(interviews),
      ...buildFollowUpEvents(followUps),
    ];

    const appName = interviews[0]?.application?.jobTitle || followUps[0]?.application?.jobTitle || "Application";
    const icsContent = generateICS(events, `Application: ${appName}`);

    res.set({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${appName.replace(/[^a-z0-9]/gi, "-")}-calendar.ics"`,
    });
    res.send(icsContent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;