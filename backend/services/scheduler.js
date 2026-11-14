import ScheduledEmail from "../models/ScheduledEmail.js";
import { sendScheduledEmail, isPermanentError, summarizeError } from "./scheduledMailer.js";
import { releaseDedupeKey } from "./scheduledEmailService.js";

const PROCESSING_STALE_MS = 10 * 60 * 1000; // reclaim jobs stuck after a crash
const MAX_BACKOFF_MS = 60 * 60 * 1000;

let timer = null;
let ticking = false;

/**
 * Worker restart safety: any job left in Processing by a crashed/killed worker
 * is failed (fail-safe), because the SMTP send may already have completed.
 * Set SCHEDULER_RETRY_INTERRUPTED=true to requeue such jobs instead.
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
    if (retryInterrupted && (job.attempts || 0) < (job.maxAttempts || 3)) {
      job.status = "Scheduled";
      job.scheduledAt = new Date();
      job.nextRetryAt = new Date();
      job.lastError = "Send was interrupted before completion. Retrying.";
      job.processingStartedAt = null;
      await job.save();
      recovered += 1;
      continue;
    }

    // Fail-safe default: a crash in the middle of an SMTP send could mean the
    // mail was actually delivered. Mark it Failed instead of auto-resending so
    // duplicate application emails are never sent.
    job.status = "Failed";
    job.lastError =
      "Send was interrupted. Check Email History before retrying to avoid a duplicate application email.";
    job.processingStartedAt = null;
    job.nextRetryAt = null;
    await job.save();
    await releaseDedupeKey(job);
    recovered += 1;
  }
  return recovered;
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
export async function processDueScheduledEmails({ limit = 25 } = {}) {
  await recoverStuckJobs();

  const results = [];
  for (let i = 0; i < limit; i += 1) {
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
 * Serverless-friendly fallback: Vercel has no long-running worker, so pending
 * emails are also processed opportunistically (max once a minute) whenever an
 * authenticated API request comes in. Safe to call on every request.
 */
export function opportunisticSchedulerTick() {
  if (process.env.DISABLE_SCHEDULER === "true") return;
  if (timer) return; // the in-process worker already handles it
  const now = Date.now();
  if (now - lastOpportunisticTick < 60 * 1000) return;
  lastOpportunisticTick = now;
  setImmediate(() => {
    processDueScheduledEmails({ limit: 3 }).catch((err) => {
      console.error("[scheduler] opportunistic tick failed:", err.message);
    });
  });
}
