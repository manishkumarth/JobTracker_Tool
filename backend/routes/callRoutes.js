import express from "express";
import Call from "../models/Call.js";
import Application from "../models/Application.js";
import authMiddleware from "../middleware/auth.js";
import { logActivity } from "../utils/activity.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/calls
router.get("/", async (req, res) => {
  try {
    const { contact, company, application, page = 1, limit = 20 } = req.query;
    const query = { owner: req.userId };
    if (contact) query.contact = contact;
    if (company) query.company = company;
    if (application) query.application = application;

    const skip = (Number(page) - 1) * Number(limit);
    const [calls, total] = await Promise.all([
      Call.find(query).populate("contact", "name email phone").sort({ callDate: -1 }).skip(skip).limit(Number(limit)),
      Call.countDocuments(query),
    ]);
    res.json({ calls, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/calls
router.post("/", async (req, res) => {
  try {
    const { contact, company, application, callDate, durationMinutes, result, notes, nextFollowUpDate } = req.body;
    const call = await Call.create({
      owner: req.userId, contact, company, application,
      callDate, durationMinutes, result, notes, nextFollowUpDate,
    });

    if (application) {
      const app = await Application.findOne({ _id: application, owner: req.userId });
      if (app) {
        if (nextFollowUpDate) app.followUpDate = nextFollowUpDate;
        await logActivity(app, "call", `Call logged \u2014 ${result}${notes ? `: ${notes}` : ""}`);
      }
    }

    res.status(201).json(call);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/calls/:id
router.put("/:id", async (req, res) => {
  const call = await Call.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, req.body, { new: true });
  if (!call) return res.status(404).json({ message: "Not found" });
  res.json(call);
});

// DELETE /api/calls/:id
router.delete("/:id", async (req, res) => {
  const call = await Call.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!call) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
