import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Guards the "write the follow-up once, reuse it for every Gmail account" rule.
// If someone ever moves an LLM call into the scheduled-send path, these tests
// fail instead of silently burning tokens (or sending different text from each
// account) in production.

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (relative) => readFile(path.join(backendRoot, relative), "utf8");

const LLM_PATTERN = /callLLM|generateApplicationEmail|emailWriter|llmClient|gemini|openai|anthropic/i;

test("a follow-up makes exactly one AI call, no matter how many accounts are configured", async () => {
  const source = await read("utils/followUpSender.js");
  const calls = source.match(/\bcallLLM\s*\(/g) || [];
  assert.equal(calls.length, 1, "the follow-up body must be generated once and reused");
});

test("the follow-up copies are scheduled with the generated text, after the AI call", async () => {
  const source = await read("utils/followUpSender.js");
  const aiIndex = source.indexOf("await callLLM(");
  const scheduleIndex = source.indexOf("scheduleForOtherAccounts({");
  const draftIndex = source.indexOf("draft: { subject, body");

  assert.ok(aiIndex > -1);
  assert.ok(scheduleIndex > aiIndex, "copies are scheduled after the single AI call");
  assert.ok(draftIndex > -1, "the scheduled copies receive the already-generated subject/body");
});

test("the scheduled sender never calls an LLM", async () => {
  for (const file of [
    "services/multiAccountScheduler.js",
    "services/scheduledMailer.js",
    "services/scheduler.js",
    "services/scheduledEmailService.js",
  ]) {
    const source = await read(file);
    assert.equal(LLM_PATTERN.test(source), false, `${file} must stay AI-free`);
  }
});

test("every scheduled follow-up copy counts as AI-generated but is not regenerated", async () => {
  const source = await read("utils/followUpSender.js");
  // The copy inherits the draft, and the draft is flagged so the UI can label it.
  assert.match(source, /draft:\s*\{\s*subject,\s*body,\s*generated:\s*true\s*\}/);
});
