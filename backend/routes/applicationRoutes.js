import express from "express";
import Application, { APPLICATION_STATUSES } from "../models/Application.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Contact from "../models/Contact.js";
import Company from "../models/Company.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { logActivity } from "../utils/activity.js";
import { logUserEvent } from "../utils/userLog.js";
import { matchResumeForJob, describeResumeMatches } from "../utils/resumeMatcher.js";
import EmailLog from "../models/EmailLog.js";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

// POST /api/applications - auto-creates Company & Contact if hr/company data provided (even single field)
router.post("/", async (req, res) => {
  try {
    if (!req.body.jobTitle) return res.status(400).json({ message: "Job title is required" });

    // Resume-notes gate: when checkResume is true (extension/mobile auto-capture),
    // only save if at least one resume's role notes match the job title.
    if (req.body.checkResume && req.body.jobSource === "LinkedIn") {
      const profile = await CandidateProfile.findOne({ owner: req.userId });
      const resumes = profile?.resumes || [];
      const match = matchResumeForJob({ resumes, jobTitle: req.body.jobTitle });
      if (!match.matched) {
        return res.status(422).json({
          code: "NO_RESUME_MATCH",
          reason: match.reason,
          message: `No resume note matches the job title "${req.body.jobTitle}". Post rejected — add role notes (e.g. "Full Stack Developer") to a resume in your profile first.`,
          jobTitle: req.body.jobTitle,
          resumes: describeResumeMatches({ resumes, jobTitle: req.body.jobTitle }),
        });
      }
    }

    // Duplicate guard for auto-capture (extension auto-save-on-scroll / mobile):
    // reject if an application with the same job title + company + HR email
    // was already created today (within last 24 hours). LinkedIn exposes the
    // feed page URL instead of individual post URNs, so URL-based dedup alone
    // cannot prevent re-saving the same post on every scroll.
    if (req.body.checkResume) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dupFilter = {
        owner: req.userId,
        jobSource: "LinkedIn",
        createdAt: { $gte: dayAgo },
        jobTitle: { $regex: new RegExp(`^${escapeRegex(req.body.jobTitle)}$`, "i") },
        companyName: { $regex: new RegExp(`^${escapeRegex(req.body.companyName || "")}$`, "i") },
      };
      const hrEmail = (req.body.hrEmail || "").trim();
      if (hrEmail) dupFilter.hrEmail = { $regex: new RegExp(`^${escapeRegex(hrEmail)}$`, "i") };
      const existingDup = await Application.findOne(dupFilter).select(
        "_id jobTitle companyName hrEmail createdAt status"
      );
      if (existingDup) {
        return res.status(409).json({
          code: "DUPLICATE_APPLICATION",
          message: `Duplicate application for "${req.body.jobTitle}" at "${req.body.companyName}" already saved today. Skipped.`,
          existing: existingDup,
        });
      }
    }

    let companyId = req.body.company || null;
    const companyName = (req.body.companyName || "").trim();
    // Auto-create company if name provided but no id (handles direct API calls)
    if (!companyId && companyName) {
      let existing = await Company.findOne({ owner: req.userId, name: companyName });
      if (existing) companyId = existing._id;
      else {
        const created = await Company.create({ owner: req.userId, name: companyName });
        companyId = created._id;
      }
    }

    let contactId = req.body.contact || null;
    const hrName = (req.body.hrName || "").trim();
    const hrEmail = (req.body.hrEmail || "").trim().toLowerCase();
    const hrPhone = (req.body.hrPhone || "").trim();
    // Auto-create contact if any HR identifier present and no existing contact linked
    if (!contactId && (hrName || hrEmail || hrPhone)) {
      if (hrEmail) {
        // Check duplicate by email+companyRef (or just email if no company)
        const dupQuery = { owner: req.userId, email: hrEmail };
        if (companyId) dupQuery.companyRef = companyId;
        const existing = await Contact.findOne(dupQuery);
        if (existing) contactId = existing._id;
      }
      if (!contactId) {
        // Validate email format if present
        if (hrEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hrEmail)) {
          return res.status(400).json({ message: "Invalid hrEmail format" });
        }
        const created = await Contact.create({
          owner: req.userId,
          name: hrName,
          email: hrEmail,
          phone: hrPhone,
          company: companyName,
          companyRef: companyId || null,
          designation: "",
          location: req.body.location || "",
          contactType: "HR",
        });
        contactId = created._id;
      }
    }

    // Default auto follow-up: 3 days from now at 11:00 local server time (user can edit later)
    let followUpDate = req.body.followUpDate ? new Date(req.body.followUpDate) : null;
    if (!followUpDate || Number.isNaN(followUpDate.getTime())) {
      followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 3);
      followUpDate.setHours(11, 0, 0, 0);
    }

    const application = await Application.create({
      ...req.body,
      company: companyId,
      companyName: companyName || req.body.companyName,
      contact: contactId,
      owner: req.userId,
      followUpDate,
      activity: [{ type: "created", message: "Application created", at: new Date() }],
    });

    // Create a pending Email Follow-up so it appears in the Follow-ups page
    try {
      const FollowUp = (await import("../models/FollowUp.js")).default;
      await FollowUp.create({
        owner: req.userId,
        application: application._id,
        type: "Email Follow-up",
        date: followUpDate,
        note: "Auto-scheduled (3 days at 11:00). Edit if needed.",
        status: "Pending",
      });
    } catch (e) {
      console.error("Auto follow-up schedule failed:", e.message);
    }

    await logUserEvent(req.authUser, "activity", `Created application: ${application.jobTitle}${application.companyName ? ` at ${application.companyName}` : ""}`, { applicationId: application._id }, req);
    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// BULK routes must be before /:id to avoid param shadowing
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

    // Normalize date: if only YYYY-MM-DD, set time to 11:00
    let due = new Date(date);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) {
      due = new Date(date + "T11:00:00");
    }
    if (Number.isNaN(due.getTime())) {
      due = new Date();
      due.setDate(due.getDate() + 3);
      due.setHours(11, 0, 0, 0);
    }

    const followUps = applications.map((app) => ({
      owner: req.userId,
      application: app._id,
      type: type || "Email Follow-up",
      date: due,
      note: note || "",
    }));

    await FollowUp.insertMany(followUps);

    const bulkOps = applications.map((app) => ({
      updateOne: {
        filter: { _id: app._id },
        update: {
          $set: { followUpDate: due },
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

// POST /api/applications/bulk/send-followups  -> bulk send follow-up emails
router.post("/bulk/send-followups", requireFeature("autoFollowUp"), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "ids are required" });

    const applications = await Application.find({ _id: { $in: ids }, owner: req.userId });
    if (!applications.length) return res.status(404).json({ message: "No applications found" });

    const User = (await import("../models/User.js")).default;
    const Contact = (await import("../models/Contact.js")).default;
    const CandidateProfile = (await import("../models/CandidateProfile.js")).default;
    const { sendFollowUpEmail } = await import("../utils/followUpSender.js");

    const user = await User.findById(req.userId);
    if (!user.gmailConnected) {
      return res.status(400).json({ message: "Connect Gmail in Config before sending follow-ups" });
    }

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    let sent = 0;
    let failed = 0;

    for (const application of applications) {
      try {
        const contact = application.contact ? await Contact.findById(application.contact) : null;
        const result = await sendFollowUpEmail({ user, application, contact, profile });
        if (result.sent) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }

    await logUserEvent(req.authUser, "activity", `Bulk sent ${sent} follow-up email(s)`, { sent, failed }, req);
    res.json({ sent, failed });
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
    await logUserEvent(req.authUser, "activity", `Deleted ${result.deletedCount} application(s)`, {}, req);
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/applications/:id/resume-match
// Read-only preview of the resume the auto-send flow will use.
router.get("/:id/resume-match", async (req, res) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Not found" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const resumes = profile?.resumes || [];
    const match = matchResumeForJob({ resumes, jobTitle: application.jobTitle });
    const alreadySent = await EmailLog.findOne({
      owner: req.userId,
      application: application._id,
      status: "Sent",
    });

    let hasRecipient = !!application.hrEmail;
    if (!hasRecipient && application.contact) {
      const contact = await Contact.findOne({ _id: application.contact, owner: req.userId }).select("email");
      hasRecipient = !!contact?.email;
    }

    res.json({
      ...match,
      resumes: describeResumeMatches({ resumes, jobTitle: application.jobTitle }),
      hasRecipient,
      emailAlreadySent: !!alreadySent,
      alreadySentAt: alreadySent?.sentAt || null,
    });
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

export default router;
