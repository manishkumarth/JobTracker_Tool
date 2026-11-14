import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import ScheduledEmail, { SCHEDULED_EMAIL_STATUSES } from "../models/ScheduledEmail.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { resolveEmailAccount } from "../utils/emailAccounts.js";
import { parseFutureSchedule } from "../utils/scheduling.js";
import { logUserEvent } from "../utils/userLog.js";
import {
  ACTIVE_STATUSES,
  DEFAULT_TIMEZONE,
  ServiceError,
  buildDedupeKey,
  createScheduledEmail,
  releaseDedupeKey,
  toPublicScheduledEmail,
} from "../services/scheduledEmailService.js";
import { processDueScheduledEmails, processScheduledEmailById } from "../services/scheduler.js";

const router = express.Router();
router.use(authMiddleware);

const sendError = (res, err) => {
  const status = err.status || (err?.code === 11000 ? 409 : 500);
  if (status >= 500) console.error("Scheduled email error:", err.message);
  res.status(status).json({
    message: err.message || "Something went wrong",
    ...(err.code ? { code: err.code } : {}),
    ...(err.data || {}),
  });
};

const withRelations = (query) =>
  query
    .populate("application", "jobTitle companyName status")
    .populate("company", "name");

// GET /api/scheduled-emails — dashboard list
router.get("/", async (req, res) => {
  try {
    const { status, search = "", page = 1, limit = 50, sort = "scheduledAt" } = req.query;
    const query = { owner: req.userId };
    if (status && status !== "All") query.status = status;
    if (search) {
      query.$or = [
        { recipient: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { accountEmail: { $regex: search, $options: "i" } },
      ];
    }

    const sortSpec = sort === "createdAt" ? { createdAt: -1 } : { scheduledAt: 1, createdAt: -1 };
    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      withRelations(ScheduledEmail.find(query)).sort(sortSpec).skip(skip).limit(Number(limit)),
      ScheduledEmail.countDocuments(query),
    ]);

    res.json({
      emails: jobs.map(toPublicScheduledEmail),
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      statuses: SCHEDULED_EMAIL_STATUSES,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/scheduled-emails/counts
router.get("/counts", async (req, res) => {
  try {
    const rows = await ScheduledEmail.aggregate([
      { $match: { owner: new mongoose.Types.ObjectId(req.userId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(SCHEDULED_EMAIL_STATUSES.map((s) => [s, 0]));
    for (const row of rows) counts[row._id] = row.count;
    counts.All = Object.values(counts).reduce((sum, n) => sum + n, 0);
    res.json({ counts });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/scheduled-emails — create a scheduled email
router.post("/", requireFeature("sendEmail"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const job = await createScheduledEmail({
      user,
      input: { ...req.body, timezone: req.body.timezone || DEFAULT_TIMEZONE },
    });

    await logUserEvent(
      req.authUser,
      "activity",
      `Scheduled email "${job.subject}" to ${job.recipient} for ${job.scheduledAt.toISOString()}`,
      { scheduledEmailId: job._id, accountEmail: job.accountEmail },
      req
    );

    // If it is already due, let the worker pick it up on the next tick.
    if (job.status === "Pending") {
      setImmediate(() => {
        processScheduledEmailById({ id: job._id, ownerId: job.owner }).catch(() => {});
      });
    }

    res.status(201).json({
      message: job.status === "Pending" ? "Email queued for immediate sending" : "Email scheduled",
      email: toPublicScheduledEmail(job),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/scheduled-emails/:id — edit a pending/scheduled email
router.put("/:id", requireFeature("sendEmail"), async (req, res) => {
  try {
    const job = await ScheduledEmail.findOne({ _id: req.params.id, owner: req.userId });
    if (!job) return res.status(404).json({ message: "Scheduled email not found" });
    if (!["Pending", "Scheduled"].includes(job.status)) {
      throw new ServiceError(409, `A ${job.status.toLowerCase()} email can no longer be edited.`, "NOT_EDITABLE");
    }

    const { subject, body, scheduledAt, timezone, accountId, recipient, recipientName } = req.body;
    const updates = {};

    if (subject !== undefined) {
      if (!String(subject).trim()) throw new ServiceError(400, "Subject is required", "MISSING_SUBJECT");
      updates.subject = String(subject).trim();
    }
    if (body !== undefined) {
      if (!String(body).trim()) throw new ServiceError(400, "Email body is required", "MISSING_BODY");
      updates.body = String(body);
    }
    if (recipient !== undefined) {
      const email = String(recipient || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ServiceError(400, "A valid recipient email is required", "INVALID_RECIPIENT");
      }
      updates.recipient = email;
      updates.dedupeKey = buildDedupeKey({
        ownerId: req.userId,
        applicationId: job.application,
        recipient: email,
        emailType: job.emailType,
      });
    }
    if (recipientName !== undefined) updates.recipientName = String(recipientName || "").trim();

    if (accountId !== undefined && accountId !== null && accountId !== "") {
      const user = await User.findById(req.userId);
      const account = await resolveEmailAccount(user, accountId);
      updates.accountId = account._id;
      updates.accountEmail = account.address;
    }

    // Only a newly selected time is validated as future; editing the subject of
    // a job that is already due must keep working.
    let finalSchedule = job.scheduledAt;
    if (scheduledAt !== undefined) {
      const parsed = parseFutureSchedule(scheduledAt);
      if (parsed.error) {
        throw new ServiceError(400, parsed.error, "INVALID_SCHEDULE_TIME");
      }
      finalSchedule = parsed.date;
    }
    if (Number.isNaN(new Date(finalSchedule).getTime())) {
      throw new ServiceError(400, "A valid scheduled date/time is required", "INVALID_SCHEDULE_TIME");
    }
    updates.scheduledAt = finalSchedule;
    updates.nextRetryAt = null;
    if (timezone !== undefined) updates.timezone = timezone || DEFAULT_TIMEZONE;

    updates.status = finalSchedule.getTime() <= Date.now() + 30 * 1000 ? "Pending" : "Scheduled";
    updates.lastError = "";
    updates.attempts = 0;
    updates.processingStartedAt = null;

    // Atomic: only edit if the worker has not claimed the job in the meantime.
    const updated = await ScheduledEmail.findOneAndUpdate(
      { _id: job._id, owner: req.userId, status: { $in: ["Pending", "Scheduled"] } },
      { $set: updates },
      { new: true }
    );
    if (!updated) {
      throw new ServiceError(409, "This email was just sent or is being processed and can no longer be edited.", "NOT_EDITABLE");
    }

    if (updated.status === "Pending") {
      setImmediate(() => {
        processScheduledEmailById({ id: updated._id, ownerId: updated.owner }).catch(() => {});
      });
    }

    res.json({ message: "Scheduled email updated", email: toPublicScheduledEmail(updated) });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/scheduled-emails/:id/cancel
router.post("/:id/cancel", async (req, res) => {
  try {
    const existing = await ScheduledEmail.findOne({ _id: req.params.id, owner: req.userId });
    if (!existing) return res.status(404).json({ message: "Scheduled email not found" });
    if (!["Pending", "Scheduled"].includes(existing.status)) {
      throw new ServiceError(409, `A ${existing.status.toLowerCase()} email cannot be cancelled.`, "NOT_CANCELLABLE");
    }

    // Atomic: if the worker claims the job between the read and the update, the
    // filter no longer matches and we report that it is already being sent.
    const job = await ScheduledEmail.findOneAndUpdate(
      { _id: existing._id, owner: req.userId, status: { $in: ["Pending", "Scheduled"] } },
      { $set: { status: "Cancelled", cancelledAt: new Date(), nextRetryAt: null } },
      { new: true }
    );
    if (!job) {
      throw new ServiceError(409, "This email is already being sent and can no longer be cancelled.", "NOT_CANCELLABLE");
    }

    await releaseDedupeKey(job);

    await logUserEvent(req.authUser, "activity", `Cancelled scheduled email "${job.subject}"`, { scheduledEmailId: job._id }, req);
    res.json({ message: "Scheduled email cancelled", email: toPublicScheduledEmail(job) });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/scheduled-emails/:id/retry — retry a failed email
router.post("/:id/retry", requireFeature("sendEmail"), async (req, res) => {
  try {
    const job = await ScheduledEmail.findOne({ _id: req.params.id, owner: req.userId });
    if (!job) return res.status(404).json({ message: "Scheduled email not found" });
    if (job.status !== "Failed") {
      throw new ServiceError(409, "Only failed emails can be retried.", "NOT_RETRYABLE");
    }

    const dedupeKey = buildDedupeKey({
      ownerId: req.userId,
      applicationId: job.application,
      recipient: job.recipient,
      emailType: job.emailType,
    });
    const duplicate = await ScheduledEmail.findOne({
      _id: { $ne: job._id },
      owner: req.userId,
      dedupeKey,
      status: { $in: ACTIVE_STATUSES },
    });
    if (duplicate) {
      throw new ServiceError(409, "Another scheduled email is already active for this application.", "DUPLICATE_SCHEDULE");
    }

    // Atomic: only retry if the job is still Failed (another click/worker could
    // have picked it up in the meantime).
    const claimed = await ScheduledEmail.findOneAndUpdate(
      { _id: job._id, owner: req.userId, status: "Failed" },
      {
        $set: {
          dedupeKey,
          attempts: 0,
          lastError: "",
          processingStartedAt: null,
          nextRetryAt: null,
          scheduledAt: new Date(),
          status: "Pending",
        },
      },
      { new: true }
    );
    if (!claimed) {
      throw new ServiceError(409, "This email is already being retried or was sent.", "NOT_RETRYABLE");
    }

    const result = await processScheduledEmailById({ id: claimed._id, ownerId: req.userId });
    const fresh = await ScheduledEmail.findById(claimed._id);
    res.json({
      message: result.sent ? "Email sent" : "Retry attempted — check the status for details",
      sent: !!result.sent,
      email: toPublicScheduledEmail(fresh),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/scheduled-emails/:id/send-now — send immediately
router.post("/:id/send-now", requireFeature("sendEmail"), async (req, res) => {
  try {
    const job = await ScheduledEmail.findOne({ _id: req.params.id, owner: req.userId });
    if (!job) return res.status(404).json({ message: "Scheduled email not found" });
    if (job.status === "Processing") {
      throw new ServiceError(409, "This email is already being sent.", "ALREADY_PROCESSING");
    }
    if (job.status === "Sent") {
      throw new ServiceError(409, "This email was already sent.", "ALREADY_SENT");
    }
    if (job.status === "Cancelled") {
      throw new ServiceError(409, "Cancelled emails cannot be sent. Create a new one.", "CANCELLED");
    }

    const dedupeKey = buildDedupeKey({
      ownerId: req.userId,
      applicationId: job.application,
      recipient: job.recipient,
      emailType: job.emailType,
    });
    const duplicate = await ScheduledEmail.findOne({
      _id: { $ne: job._id },
      owner: req.userId,
      dedupeKey,
      status: { $in: ACTIVE_STATUSES },
    });
    if (duplicate) {
      throw new ServiceError(409, "Another scheduled email is already active for this application.", "DUPLICATE_SCHEDULE");
    }

    // Atomic: the status filter prevents a double send when the worker has
    // already claimed the job between the read above and this update.
    const claimed = await ScheduledEmail.findOneAndUpdate(
      { _id: job._id, owner: req.userId, status: { $in: ["Pending", "Scheduled", "Failed"] } },
      {
        $set: {
          dedupeKey,
          attempts: 0,
          lastError: "",
          processingStartedAt: null,
          scheduledAt: new Date(),
          nextRetryAt: null,
          status: "Pending",
        },
      },
      { new: true }
    );
    if (!claimed) {
      throw new ServiceError(409, "This email was already sent or is currently being sent.", "ALREADY_PROCESSING");
    }

    const result = await processScheduledEmailById({ id: claimed._id, ownerId: req.userId });
    const fresh = await ScheduledEmail.findById(claimed._id);
    res.json({
      message: result.sent ? "Email sent" : "Send attempted — check the status for details",
      sent: !!result.sent,
      email: toPublicScheduledEmail(fresh),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/scheduled-emails/:id — remove a terminal record
router.delete("/:id", async (req, res) => {
  try {
    const job = await ScheduledEmail.findOne({ _id: req.params.id, owner: req.userId });
    if (!job) return res.status(404).json({ message: "Scheduled email not found" });
    if (!["Cancelled", "Failed"].includes(job.status)) {
      throw new ServiceError(409, "Only cancelled or failed emails can be deleted.", "NOT_DELETABLE");
    }
    await job.deleteOne();
    res.json({ message: "Scheduled email deleted" });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/scheduled-emails/run-due — manual worker tick (also used by cron)
router.post("/run-due", async (req, res) => {
  try {
    const limit = Math.min(50, Number(req.body?.limit) || 20);
    const result = await processDueScheduledEmails({ limit });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
