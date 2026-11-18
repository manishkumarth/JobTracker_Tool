import ScheduledEmail from "../models/ScheduledEmail.js";
import EmailLog from "../models/EmailLog.js";
import { sendScheduledEmail, isPermanentError, summarizeError } from "./scheduledMailer.js";
import { releaseDedupeKey } from "./scheduledEmailService.js";

const PROCESSING_STALE_MS = 10 * 60 * 1000; // reclaim jobs stuck after a crash
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const OPPORTUNISTIC_BUDGET_MS = 25 * 1000;

let timer = null;
let ticking = false;

/**
 * Worker restart safety: a job left in "Processing" means the serverless
 * invocation was killed mid-send (Vercel freezes the function as soon as the
 * response is written, so anything started with setImmediate dies).
 *
 * Instead of blindly failing — which is what produced
 * "Send was interrupted..." on perfectly valid scheduled emails — we look at
 * the EmailLog that is written BEFORE the SMTP call:
 *   - Sent    → the mail went out, so finish the job (no duplicate).
 *   - Failed  → a real send failure, fail the job with that reason.
 *   - Pending → the send very likely never completed, so retry safely.
 */
export async function recoverStuckJobs() {
  const cutoff = new Date(Date.now() - PROCESSING_STALE_MS);
  const stuck = await ScheduledEmail.find({
    status: "Processing",
    processingStartedAt: { $lt: cutoff },
  }).limit(50);

  let recovered = 0;
  const retryInterrupted = process.env.SCHEDULER_RETRY_INTERRUPTED === "true";

  for (const job of stuck) {
    let log = job.emailLog ? await EmailLog.findById(job.emailLog) : null;
    if (!log) {
      // Older jobs never stored the reference — match the log by its identity.
      log = await EmailLog.findOne({
        owner: job.owner,
        recipient: job.recipient,
        subject: job.subject,
        emailType: job.emailType || "Job Application",
      })
        .sort({ createdAt: -1 })
        .limit(1);
    }

    if (log?.status === "Sent") {
      job.status = "Sent";
      job.sentAt = log.sentAt || new Date();
      job.emailLog = log._id;
      job.lastError = "";
      job.processingStartedAt = null;
      job.nextRetryAt = null;
      await job.save();
      await releaseDedupeKey(job);
      recovered += 1;
      continue;
    }

    if (log?.status === "Failed") {
      job.status = "Failed";
      job.lastError = log.errorMessage || "Send failed";
      job.processingStartedAt = null;
      job.nextRetryAt = null;
      await job.save();
      await releaseDedupeKey(job);
      recovered += 1;
      continue;
    }

    const attempts = job.attempts || 0;
    const maxAttempts = job.maxAttempts || 3;
    if (!retryInterrupted && attempts >= maxAttempts) {
      job.status = "Failed";
      job.lastError =
        "Send was interrupted before completion and the retry limit was reached. Check Email History before sending again.";
      job.processingStartedAt = null;
      job.nextRetryAt = null;
      await job.save();
      await releaseDedupeKey(job);
      recovered += 1;
      continue;
    }

    // No evidence of a delivered mail → safe to try again right away.
    job.status = "Scheduled";
    job.scheduledAt = new Date();
    job.nextRetryAt = null;
    job.lastError = "The previous attempt was interrupted before completion — retrying automatically.";
    job.processingStartedAt = null;
    await job.save();
    recovered += 1;
  }
  return recovered;
}

/**
 * One-time self-heal for jobs that the OLD recovery logic marked Failed with
 * "Send was interrupted..." even though the mail was never delivered.
 * Requeues them only when there is no Sent EmailLog for the same send.
 */
export async function recoverFalselyFailedJobs({ withinDays = 3 } = {}) {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const candidates = await ScheduledEmail.find({
    status: "Failed",
    lastError: { $regex: /^Send was interrupted/i },
    updatedAt: { $gte: since },
  }).limit(50);

  let requeued = 0;
  for (const job of candidates) {
    if ((job.attempts || 0) >= (job.maxAttempts || 3)) continue;

    const sentLog = await EmailLog.findOne({
      owner: job.owner,
      recipient: job.recipient,
      subject: job.subject,
      emailType: job.emailType || "Job Application",
      status: "Sent",
    });

    if (sentLog) {
      job.status = "Sent";
      job.sentAt = sentLog.sentAt || job.updatedAt;
      job.emailLog = sentLog._id;
      job.lastError = "";
      await job.save();
      continue;
    }

    job.status = "Scheduled";
    job.scheduledAt = new Date();
    job.nextRetryAt = null;
    job.lastError = "Recovered automatically — the interrupted attempt never sent the email.";
    await job.save();
    requeued += 1;
  }
  return requeued;
}

async function finishFailure(job, err) {
  const attempts = job.attempts || 0;
  const maxAttempts = job.maxAttempts || 3;
  const permanent = isPermanentError(err);

  job.lastError = summarizeError(err);
  job.processingStartedAt = null;

  if (permanent || attempts >= maxAttempts) {
    job.status = "Failed";
    job.nextRetryAt = null;
    await job.save();
    await releaseDedupeKey(job);
    return { retrying: false, permanent };
  }

  // Bounded exponential backoff: 2 min, 4 min, 8 min…
  const backoffMs = Math.min(MAX_BACKOFF_MS, Math.pow(2, attempts) * 60 * 1000);
  const retryAt = new Date(Date.now() + backoffMs);
  job.status = "Scheduled";
  job.scheduledAt = retryAt;
  job.nextRetryAt = retryAt;
  await job.save();
  return { retrying: true, retryAt, permanent: false };
}

async function processClaimed(job) {
  try {
    const result = await sendScheduledEmail(job);
    return { processed: true, sent: true, job, ...result };
  } catch (err) {
    const failure = await finishFailure(job, err);
    console.error(
      `[scheduler] email ${job._id} failed (attempt ${job.attempts}/${job.maxAttempts}):`,
      summarizeError(err)
    );
    return { processed: true, sent: false, job, error: summarizeError(err), ...failure };
  }
}

/** Atomically claim one due job. The status flip guarantees single execution. */
async function claimNextDue() {
  const now = new Date();
  return ScheduledEmail.findOneAndUpdate(
    {
      status: { $in: ["Pending", "Scheduled"] },
      scheduledAt: { $lte: now },
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
    },
    {
      $set: { status: "Processing", processingStartedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { scheduledAt: 1 }, new: true }
  );
}

/** Process all due emails. Safe to call from multiple instances at once. */
export async function processDueScheduledEmails({ limit = 25, budgetMs = 0 } = {}) {
  const deadline = budgetMs > 0 ? Date.now() + budgetMs : Infinity;

  try {
    await recoverStuckJobs();
    await recoverFalselyFailedJobs();
  } catch (err) {
    console.error("[scheduler] recovery failed:", err.message);
  }

  const results = [];
  for (let i = 0; i < limit; i += 1) {
    if (Date.now() >= deadline) break;
    const job = await claimNextDue();
    if (!job) break;
    results.push(await processClaimed(job));
  }

  return {
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    results,
    ranAt: new Date().toISOString(),
  };
}

/**
 * Claim + send a specific job (Send Now / Retry).
 * Returns processed:false when the job is already Sent/Processing/Cancelled.
 */
export async function processScheduledEmailById({ id, ownerId }) {
  const now = new Date();
  const job = await ScheduledEmail.findOneAndUpdate(
    {
      _id: id,
      owner: ownerId,
      status: { $in: ["Pending", "Scheduled", "Failed"] },
    },
    {
      $set: { status: "Processing", processingStartedAt: now },
      $inc: { attempts: 1 },
    },
    { new: true }
  );

  if (!job) return { processed: false, reason: "not_claimable" };
  return processClaimed(job);
}

export async function startScheduler() {
  if (process.env.VERCEL) return null; // Vercel uses the cron endpoint instead
  if (process.env.DISABLE_SCHEDULER === "true") return null;
  if (timer) return timer;

  const intervalMs = Math.max(15000, Number(process.env.SCHEDULER_INTERVAL_MS) || 30000);

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await processDueScheduledEmails({ limit: 10 });
    } catch (err) {
      console.error("[scheduler] tick failed:", err.message);
    } finally {
      ticking = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(tick, 5000);
  console.log(`[scheduler] started (every ${Math.round(intervalMs / 1000)}s)`);
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function schedulerRunning() {
  return !!timer;
}

let lastOpportunisticTick = 0;

/**
 * Serverless-friendly fallback: Vercel has no long-running worker, so due
 * emails are processed inline while the API is in use (max once a minute).
 *
 * IMPORTANT: this must be awaited by the caller. Vercel freezes the function
 * as soon as the response is written, so a fire-and-forget tick would claim a
 * job ("Processing") and then be killed — leaving it stuck and later marked
 * Failed even though nothing was sent. Awaiting keeps the invocation alive
 * until the send finishes (bounded by `budgetMs`).
 */
export async function opportunisticSchedulerTick({ budgetMs = OPPORTUNISTIC_BUDGET_MS } = {}) {
  if (process.env.DISABLE_SCHEDULER === "true") return { skipped: true, reason: "disabled" };
  if (timer) return { skipped: true, reason: "worker_running" }; // in-process worker handles it

  const now = Date.now();
  if (now - lastOpportunisticTick < 60 * 1000) return { skipped: true, reason: "throttled" };
  lastOpportunisticTick = now;

  try {
    const due = await ScheduledEmail.exists({
      status: { $in: ["Pending", "Scheduled"] },
      scheduledAt: { $lte: new Date(now) },
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: new Date(now) } }],
    });
    if (!due) return { processed: 0 };

    return await processDueScheduledEmails({ limit: 2, budgetMs });
  } catch (err) {
    console.error("[scheduler] opportunistic tick failed:", err.message);
    return { processed: 0, error: err.message };
  }
}
