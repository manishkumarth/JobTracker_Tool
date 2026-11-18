import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Regression guards for the "scheduled email stuck in Processing, then marked
// Failed even though nothing was sent" bug:
//  1. Vercel freezes the function after the response, so the heartbeat must be
//     awaited instead of fire-and-forget.
//  2. The EmailLog reference must be persisted BEFORE the SMTP call so a killed
//     invocation leaves evidence instead of an orphaned Processing row.
//  3. Recovery must inspect that log: Sent → finish, Pending/missing → retry.

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");

const read = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("the serverless heartbeat is awaited so a claimed job cannot be orphaned", async () => {
  const source = await read("api/index.js");
  assert.match(source, /await\s+opportunisticSchedulerTick\(\)/);
});

test("the email log reference is saved before the SMTP call", async () => {
  const source = await read("backend/services/scheduledMailer.js");
  const logRefIndex = source.indexOf("ScheduledEmail.updateOne");
  const sendIndex = source.indexOf("transporter.sendMail(");
  assert.ok(logRefIndex > -1, "log reference is persisted");
  assert.ok(sendIndex > logRefIndex, "persisted before sending");
});

test("recovery trusts a Sent log instead of failing the job", async () => {
  const source = await read("backend/services/scheduler.js");
  assert.match(source, /log\?\.status === "Sent"/);
  assert.match(source, /log\?\.status === "Failed"/);
  assert.doesNotMatch(
    source,
    /Send was interrupted\. Check Email History before retrying to avoid a duplicate application email\./
  );
});

test("recovery requeues jobs with no evidence of a completed send", async () => {
  const source = await read("backend/services/scheduler.js");
  const interruptedBranch = source.slice(source.indexOf("// No evidence of a delivered mail"));
  assert.match(interruptedBranch, /job\.status = "Scheduled"/);
});

test("the daily cron also flushes the scheduled-email queue", async () => {
  const source = await read("backend/routes/cronRoutes.js");
  assert.match(source, /processDueScheduledEmails\(\{ limit: 10/);
});
