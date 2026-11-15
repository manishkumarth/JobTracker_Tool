import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-accounts";

const { encrypt } = await import("../utils/crypto.js");
const { resolveEmailAccount } = await import("../utils/emailAccounts.js");

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
