import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDedupeKey,
  toPublicScheduledEmail,
  ACTIVE_STATUSES,
} from "../services/scheduledEmailService.js";

test("dedupe key is scoped per application AND per sender account", () => {
  const base = {
    ownerId: "owner1",
    applicationId: "app1",
    recipient: "Recruiter@Example.com",
    emailType: "Job Application",
  };
  const withoutAccount = buildDedupeKey(base);
  const accountA = buildDedupeKey({ ...base, accountId: "account-a" });
  const accountB = buildDedupeKey({ ...base, accountId: "account-b" });

  assert.equal(withoutAccount, "owner1:app:app1");
  assert.equal(accountA, "owner1:app:app1:acct:account-a");
  assert.notEqual(accountA, accountB, "a second account may schedule the same application");
  assert.equal(
    accountA,
    buildDedupeKey({ ...base, accountId: "account-a" }),
    "the same account cannot schedule the same application twice"
  );
});

test("follow-ups get their own dedupe key so they can coexist with the application", () => {
  const appKey = buildDedupeKey({
    ownerId: "owner1",
    applicationId: "app1",
    recipient: "hr@example.com",
    emailType: "Job Application",
  });
  const followUpKey = buildDedupeKey({
    ownerId: "owner1",
    applicationId: "app1",
    recipient: "hr@example.com",
    emailType: "Follow-up",
  });
  assert.notEqual(appKey, followUpKey);
});

test("recipient-only schedules normalise the email address", () => {
  const key = buildDedupeKey({
    ownerId: "owner1",
    applicationId: null,
    recipient: "  HR@Example.COM ",
    emailType: "Job Application",
  });
  assert.equal(key, "owner1:rcpt:hr@example.com");
});

test("public representation never leaks internal guards or credentials", () => {
  const publicJob = toPublicScheduledEmail({
    _id: "job1",
    owner: "owner1",
    application: { _id: "app1", jobTitle: "Full Stack Developer", companyName: "SYMB" },
    company: { _id: "c1", name: "SYMB Technologies" },
    accountId: "acct1",
    accountEmail: "me@gmail.com",
    recipient: "hr@example.com",
    subject: "Application",
    body: "Hello",
    emailType: "Job Application",
    status: "Scheduled",
    scheduledAt: new Date("2026-05-01T04:00:00.000Z"),
    timezone: "Asia/Kolkata",
    dedupeKey: "owner1:app:app1",
    lastError: "",
  });

  assert.equal(publicJob.dedupeKey, undefined);
  assert.equal(publicJob.appPasswordEnc, undefined);
  assert.equal(publicJob.senderAccount, "me@gmail.com");
  assert.equal(publicJob.application.jobTitle, "Full Stack Developer");
  assert.equal(publicJob.timezone, "Asia/Kolkata");
});

test("active statuses cover everything that can still send", () => {
  assert.deepEqual(ACTIVE_STATUSES, ["Pending", "Scheduled", "Processing"]);
});
