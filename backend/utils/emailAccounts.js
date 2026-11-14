import { decrypt, encrypt } from "./crypto.js";
import { createTransporter } from "./mailer.js";
import { normalizeSchedulePreferences } from "./scheduling.js";

class AccountError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeAddress = (value) => String(value || "").trim().toLowerCase();

/** Convert a subdocument/stored account into a safe object (no secrets). */
export function toPublicAccount(account) {
  if (!account) return null;
  const prefs = normalizeSchedulePreferences(account);
  return {
    _id: String(account._id || account.id || ""),
    address: account.address || "",
    label: account.label || "",
    enabled: account.enabled !== false,
    isDefault: !!account.isDefault,
    connected: !!account.appPasswordEnc,
    lastTestedAt: account.lastTestedAt || null,
    lastTestOk: account.lastTestOk ?? null,
    lastError: account.lastError || "",
    scheduleAction: prefs.scheduleAction,
    scheduleTime: prefs.scheduleTime,
    scheduleTimezone: prefs.scheduleTimezone,
    createdAt: account.createdAt || null,
  };
}

/**
 * Backward compatibility: if a user connected Gmail before multi-account
 * support existed, turn the legacy single account into the first entry.
 */
export async function ensureLegacyAccount(user) {
  if (!user) return false;
  if (!Array.isArray(user.emailAccounts)) user.emailAccounts = [];
  if (user.emailAccounts.length > 0) return false;
  if (!user.gmailConnected || !user.gmailAppPasswordEnc || !user.gmailAddress) return false;

  user.emailAccounts.push({
    address: normalizeAddress(user.gmailAddress),
    label: "Primary",
    appPasswordEnc: user.gmailAppPasswordEnc, // already encrypted
    enabled: true,
    isDefault: true,
  });
  await user.save();
  return true;
}

/** Keep the legacy gmail* fields pointed at the default account. */
export function syncLegacyGmail(user) {
  const accounts = Array.isArray(user.emailAccounts) ? user.emailAccounts : [];
  const primary =
    accounts.find((a) => a.isDefault && a.enabled !== false) ||
    accounts.find((a) => a.enabled !== false) ||
    null;

  if (primary) {
    user.gmailAddress = primary.address;
    user.gmailAppPasswordEnc = primary.appPasswordEnc;
    user.gmailConnected = true;
  } else {
    user.gmailAddress = "";
    user.gmailAppPasswordEnc = "";
    user.gmailConnected = false;
  }
}

/** List safe account objects, migrating the legacy account if needed. */
export async function listAccounts(user) {
  await ensureLegacyAccount(user);
  const accounts = Array.isArray(user.emailAccounts) ? user.emailAccounts : [];
  return accounts.map(toPublicAccount);
}

/**
 * Resolve the sender account to use.
 * @param {Object} user - full User document
 * @param {string|null} accountId - optional subdocument id
 * @returns {{_id, address, label, appPassword}}
 */
export async function resolveEmailAccount(user, accountId = null) {
  if (!user) throw new AccountError(401, "Not authenticated");
  await ensureLegacyAccount(user);

  const accounts = Array.isArray(user.emailAccounts) ? user.emailAccounts : [];
  if (!accounts.length) {
    throw new AccountError(400, "No Gmail account configured. Add one in Settings → Gmail Accounts.", "NO_ACCOUNT");
  }

  let account = null;
  if (accountId) {
    account = accounts.find((a) => String(a._id) === String(accountId));
    if (!account) throw new AccountError(404, "Gmail account not found", "ACCOUNT_NOT_FOUND");
  } else {
    account =
      accounts.find((a) => a.isDefault && a.enabled !== false) ||
      accounts.find((a) => a.enabled !== false) ||
      null;
    if (!account) {
      throw new AccountError(400, "No enabled Gmail account. Enable or add one in Settings.", "NO_ENABLED_ACCOUNT");
    }
  }

  if (account.enabled === false) {
    throw new AccountError(400, `Gmail account ${account.address} is disabled. Enable it in Settings first.`, "ACCOUNT_DISABLED");
  }
  if (!account.appPasswordEnc) {
    throw new AccountError(400, `Gmail account ${account.address} has no App Password saved.`, "ACCOUNT_NO_PASSWORD");
  }

  let appPassword;
  try {
    appPassword = decrypt(account.appPasswordEnc);
  } catch {
    throw new AccountError(400, "Stored App Password could not be decrypted. Re-save the account.", "ACCOUNT_DECRYPT_FAILED");
  }

  return {
    _id: account._id,
    address: account.address,
    label: account.label || "",
    appPassword,
  };
}

/** Verify credentials against Gmail without saving them. */
export async function verifyAccountCredentials({ address, appPassword }) {
  const email = normalizeAddress(address);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountError(400, "A valid email address is required", "INVALID_ADDRESS");
  }
  const password = String(appPassword || "").replace(/\s+/g, "");
  if (!password) throw new AccountError(400, "App Password is required", "MISSING_PASSWORD");

  const transporter = createTransporter(email, password);
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    const message = String(err?.message || "");
    // Never echo credentials back to the client.
    throw new AccountError(
      400,
      `Gmail rejected the credentials. Check the App Password (2-Step Verification must be on). ${message.slice(0, 120)}`.trim(),
      "GMAIL_AUTH_FAILED"
    );
  }
}

export function encryptAppPassword(appPassword) {
  const password = String(appPassword || "").replace(/\s+/g, "");
  if (!password) throw new AccountError(400, "App Password is required", "MISSING_PASSWORD");
  return encrypt(password);
}

export { AccountError, normalizeAddress };
