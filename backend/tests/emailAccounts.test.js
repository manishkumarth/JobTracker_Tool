import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-accounts";

const { encrypt } = await import("../utils/crypto.js");
const { resolveEmailAccount } = await import("../utils/emailAccounts.js");
const {
  isAccountUsable,
  usableEmailAccounts,
  planScheduledAccounts,
  ACCOUNT_SKIP_REASONS,
} = await import("../utils/emailAccounts.js");

const makeUser = () => ({
  gmailConnected: false,
  emailAccounts: [
    {
      _id: "65f000000000000000000001",
      address: "primary@example.com",
      label: "Primary",
      enabled: true,
      isDefault: true,
      appPasswordEnc: encrypt("primary-pass"),
    },
    {
      _id: "65f000000000000000000002",
      address: "second@example.com",
      label: "Second",
      enabled: true,
      isDefault: false,
      appPasswordEnc: encrypt("second-pass"),
    },
  ],
});

test("resolves an account by its id", async () => {
  const account = await resolveEmailAccount(makeUser(), "65f000000000000000000002");
  assert.equal(account.address, "second@example.com");
  assert.equal(account.appPassword, "second-pass");
});

test("resolves an account by lowercase id (case-insensitive)", async () => {
  const account = await resolveEmailAccount(makeUser(), "65F000000000000000000002");
  assert.equal(account.address, "second@example.com");
});

test("resolves an account by email address", async () => {
  const account = await resolveEmailAccount(makeUser(), "SECOND@example.com");
  assert.equal(account.address, "second@example.com");
});

test("resolves an account when the client sends an object instead of an id", async () => {
  const account = await resolveEmailAccount(makeUser(), { _id: "65f000000000000000000002" });
  assert.equal(account.address, "second@example.com");
});

test("falls back to the default account when no id is supplied", async () => {
  const account = await resolveEmailAccount(makeUser(), null);
  assert.equal(account.address, "primary@example.com");
});

test("still rejects a genuinely unknown account", async () => {
  await assert.rejects(
    () => resolveEmailAccount(makeUser(), "65f00000000000000000ffff"),
    (err) => err.status === 404 && err.code === "ACCOUNT_NOT_FOUND"
  );
});

test("only enabled accounts with an App Password are usable", () => {
  const user = {
    emailAccounts: [
      { _id: "a1", address: "ok@example.com", enabled: true, appPasswordEnc: encrypt("x") },
      { _id: "a2", address: "disabled@example.com", enabled: false, appPasswordEnc: encrypt("x") },
      { _id: "a3", address: "nopass@example.com", enabled: true },
    ],
  };
  assert.equal(isAccountUsable(user.emailAccounts[0]), true);
  assert.equal(isAccountUsable(user.emailAccounts[1]), false);
  assert.equal(isAccountUsable(user.emailAccounts[2]), false);

  const usable = usableEmailAccounts(user);
  assert.deepEqual(usable.map((a) => a.address), ["ok@example.com"]);
});

test("planScheduledAccounts skips disabled, password-less and Send Now accounts", () => {
  const user = {
    emailAccounts: [
      { _id: "sender", address: "primary@example.com", enabled: true, appPasswordEnc: encrypt("x"), isDefault: true },
      { _id: "later", address: "later@example.com", enabled: true, appPasswordEnc: encrypt("x"), scheduleAction: "schedule", scheduleTime: "16:00" },
      { _id: "now", address: "now@example.com", enabled: true, appPasswordEnc: encrypt("x"), scheduleAction: "now" },
      { _id: "off", address: "off@example.com", enabled: false, appPasswordEnc: encrypt("x") },
      { _id: "nopass", address: "nopass@example.com", enabled: true },
    ],
  };

  const { schedule, skipped } = planScheduledAccounts(user, "sender");
  assert.deepEqual(schedule.map((s) => s.account.address), ["later@example.com"]);
  assert.equal(schedule[0].prefs.scheduleTime, "16:00");

  const reasons = Object.fromEntries(skipped.map((s) => [s.accountEmail, s.reason]));
  assert.equal(reasons["now@example.com"], ACCOUNT_SKIP_REASONS.SEND_NOW);
  assert.equal(reasons["off@example.com"], ACCOUNT_SKIP_REASONS.DISABLED);
  assert.equal(reasons["nopass@example.com"], ACCOUNT_SKIP_REASONS.NO_PASSWORD);
  assert.equal(reasons["primary@example.com"], undefined, "the sending account is not skipped");
});
