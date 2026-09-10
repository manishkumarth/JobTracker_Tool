import express from "express";
import Application, { APPLICATION_STATUSES } from "../models/Application.js";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { logActivity } from "../utils/activity.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/applications  (filter, sort, search, pagination)
router.get("/", async (req, res) => {
  try {
    const {
      search = "", status, company, source, workMode, priority,
      page = 1, limit = 20, sortBy = "createdAt", sortDir = "desc",
    } = req.query;

    const query = { owner: req.userId };
    if (status) query.status = status;
    if (company) query.company = company;
    if (source) query.jobSource = source;
    if (workMode) query.workMode = workMode;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { jobTitle: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
        { hrName: { $regex: search, $options: "i" } },
        { hrEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortDir === "asc" ? 1 : -1 };

    const [applications, total] = await Promise.all([
      Application.find(query).populate("company", "name").populate("contact", "name email phone")
        .sort(sort).skip(skip).limit(Number(limit)),
      Application.countDocuments(query),
    ]);

    res.json({ applications, total, page: Number(page), pages: Math.ceil(total / Number(limit)), statuses: APPLICATION_STATUSES });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications
router.post("/", async (req, res) => {
  try {
    if (!req.body.jobTitle) return res.status(400).json({ message: "Job title is required" });
    const application = await Application.create({
      ...req.body,
      owner: req.userId,
      activity: [{ type: "created", message: "Application created", at: new Date() }],
    });
    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/applications/:id
router.get("/:id", async (req, res) => {
  const application = await Application.findOne({ _id: req.params.id, owner: req.userId })
    .populate("company").populate("contact");
  if (!application) return res.status(404).json({ message: "Not found" });
  res.json(application);
});

// PUT /api/applications/:id  (general update)
router.put("/:id", async (req, res) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Not found" });

    Object.assign(application, req.body);
    await application.save();
    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/applications/:id/status  -> records a timeline entry
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!APPLICATION_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const application = await Application.findOne({ _id: req.params.id, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Not found" });

    const previous = application.status;
    application.status = status;
    await logActivity(application, "status_change", `Status changed from ${previous} to ${status}`, { from: previous, to: status });

    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/notes
router.post("/:id/notes", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Note text is required" });

    const application = await Application.findOne({ _id: req.params.id, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Not found" });

    application.notes.push({ text });
    await logActivity(application, "note", "Note added");
    res.json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/:id/match-score
// Simple, transparent keyword-overlap match (no AI needed for this part).
router.post("/:id/match-score", async (req, res) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Not found" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const candidateSkills = new Set(
      [...(profile?.skills || []), ...(profile?.technologies || [])].map((s) => s.toLowerCase().trim())
    );

    const required = application.requiredSkills.map((s) => s.toLowerCase().trim());
    const matching = required.filter((s) => candidateSkills.has(s));
    const missing = required.filter((s) => !candidateSkills.has(s));
    const score = required.length ? Math.round((matching.length / required.length) * 100) : null;

    application.jobMatchScore = score;
    application.jobMatchDetails = { matchingSkills: matching, missingSkills: missing };
    await application.save();

    res.json({ score, matchingSkills: matching, missingSkills: missing });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/applications/:id
router.delete("/:id", async (req, res) => {
  const application = await Application.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!application) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

// POST /api/applications/bulk/status  -> bulk status update
router.post("/bulk/status", async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids?.length || !status) return res.status(400).json({ message: "ids and status are required" });
    if (!APPLICATION_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const applications = await Application.find({ _id: { $in: ids }, owner: req.userId });
    if (!applications.length) return res.status(404).json({ message: "No applications found" });

    const bulkOps = applications.map((app) => ({
      updateOne: {
        filter: { _id: app._id },
        update: {
          $set: { status },
          $push: { activity: { type: "status_change", message: `Status changed to ${status} (bulk)`, at: new Date() } },
        },
      },
    }));

    await Application.bulkWrite(bulkOps);
    res.json({ updated: applications.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/bulk/followup  -> bulk follow-up scheduling
router.post("/bulk/followup", async (req, res) => {
  try {
    const { ids, date, type, note } = req.body;
    if (!ids?.length || !date) return res.status(400).json({ message: "ids and date are required" });

    const FollowUp = (await import("../models/FollowUp.js")).default;
    const applications = await Application.find({ _id: { $in: ids }, owner: req.userId });
    if (!applications.length) return res.status(404).json({ message: "No applications found" });

    const followUps = applications.map((app) => ({
      owner: req.userId,
      application: app._id,
      type: type || "General",
      date: new Date(date),
      note: note || "",
    }));

    await FollowUp.insertMany(followUps);

    const bulkOps = applications.map((app) => ({
      updateOne: {
        filter: { _id: app._id },
        update: {
          $set: { followUpDate: new Date(date) },
          $push: { activity: { type: "followup_scheduled", message: `Follow-up scheduled for ${new Date(date).toLocaleDateString()} (bulk)`, at: new Date() } },
        },
      },
    }));
    await Application.bulkWrite(bulkOps);

    res.json({ created: followUps.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/applications/bulk/delete  -> bulk delete
router.post("/bulk/delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "ids are required" });

    const result = await Application.deleteMany({ _id: { $in: ids }, owner: req.userId });
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
