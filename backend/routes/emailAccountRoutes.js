import express from "express";
import User from "../models/User.js";
import ScheduledEmail from "../models/ScheduledEmail.js";
import authMiddleware from "../middleware/auth.js";
import { decrypt } from "../utils/crypto.js";
import {
  AccountError,
  encryptAppPassword,
  listAccounts,
  normalizeAddress,
  syncLegacyGmail,
  toPublicAccount,
  verifyAccountCredentials,
} from "../utils/emailAccounts.js";
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  QUICK_SCHEDULE_SLOTS,
  SCHEDULE_ACTIONS,
  isValidTimeSlot,
  isValidTimezone,
} from "../utils/scheduling.js";

const router = express.Router();
router.use(authMiddleware);

const ACTIVE_JOB_STATUSES = ["Pending", "Scheduled", "Processing"];

const sendError = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error("Email account error:", err.message);
  res.status(status).json({
    message: err.message || "Something went wrong",
    ...(err.code ? { code: err.code } : {}),
  });
};

const publicPayload = (user) => ({
  accounts: (user.emailAccounts || []).map(toPublicAccount),
});

/**
 * Validate optional per-account scheduling preferences from a request body.
 * Returns only the fields that were provided.
 */
function readSchedulePreferences(body = {}) {
  const prefs = {};

  if (body.scheduleAction !== undefined) {
    if (!SCHEDULE_ACTIONS.includes(body.scheduleAction)) {
      throw new AccountError(400, "scheduleAction must be 'now' or 'schedule'", "INVALID_SCHEDULE_ACTION");
    }
    prefs.scheduleAction = body.scheduleAction;
  }

  if (body.scheduleTime !== undefined) {
    if (!isValidTimeSlot(body.scheduleTime)) {
      throw new AccountError(400, "scheduleTime must be a 24-hour HH:mm value, e.g. 11:00", "INVALID_SCHEDULE_TIME");
    }
    prefs.scheduleTime = body.scheduleTime;
  }

  if (body.scheduleTimezone !== undefined) {
    if (!isValidTimezone(body.scheduleTimezone)) {
      throw new AccountError(400, "Unknown timezone", "INVALID_SCHEDULE_TIMEZONE");
    }
    prefs.scheduleTimezone = body.scheduleTimezone;
  }

  return prefs;
}

// GET /api/email-accounts — list sender accounts (passwords never returned)
router.get("/", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    await listAccounts(user); // migrates the legacy single account if needed
    res.json(publicPayload(user));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/email-accounts — add a sender account
router.post("/", async (req, res) => {
  try {
    const { address, appPassword, label, isDefault } = req.body;
    const email = normalizeAddress(address);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AccountError(400, "A valid Gmail address is required", "INVALID_ADDRESS");
    }
    if (!appPassword) throw new AccountError(400, "App Password is required", "MISSING_PASSWORD");

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!Array.isArray(user.emailAccounts)) user.emailAccounts = [];

    if (user.emailAccounts.some((a) => normalizeAddress(a.address) === email)) {
      throw new AccountError(409, "This Gmail address is already added", "DUPLICATE_ACCOUNT");
    }

    const makeDefault = user.emailAccounts.length === 0 || !!isDefault;
    if (makeDefault) user.emailAccounts.forEach((a) => { a.isDefault = false; });

    const schedulePrefs = readSchedulePreferences(req.body);

    user.emailAccounts.push({
      address: email,
      label: String(label || "").trim(),
      appPasswordEnc: encryptAppPassword(appPassword),
      enabled: true,
      isDefault: makeDefault,
      scheduleAction: schedulePrefs.scheduleAction || "schedule",
      scheduleTime: schedulePrefs.scheduleTime || QUICK_SCHEDULE_SLOTS[0],
      scheduleTimezone: schedulePrefs.scheduleTimezone || DEFAULT_SCHEDULE_TIMEZONE,
    });

    syncLegacyGmail(user);
    await user.save();

    const created = user.emailAccounts[user.emailAccounts.length - 1];
    res.status(201).json({
      message: "Gmail account added",
      account: toPublicAccount(created),
      ...publicPayload(user),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/email-accounts/:id — edit address/label/password/enabled/default
router.put("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const account = (user.emailAccounts || []).find((a) => String(a._id) === String(req.params.id));
    if (!account) return res.status(404).json({ message: "Gmail account not found" });

    const { address, appPassword, label, enabled, isDefault } = req.body;

    if (address !== undefined) {
      const email = normalizeAddress(address);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AccountError(400, "A valid Gmail address is required", "INVALID_ADDRESS");
      }
      const duplicate = user.emailAccounts.some(
        (a) => String(a._id) !== String(account._id) && normalizeAddress(a.address) === email
      );
      if (duplicate) throw new AccountError(409, "This Gmail address is already added", "DUPLICATE_ACCOUNT");
      if (normalizeAddress(account.address) !== email) {
        // A different address needs (re)verification.
        account.lastTestedAt = null;
        account.lastTestOk = null;
        account.lastError = "";
      }
      account.address = email;
    }

    if (appPassword !== undefined && String(appPassword).trim()) {
      account.appPasswordEnc = encryptAppPassword(appPassword);
      account.lastTestedAt = null;
      account.lastTestOk = null;
      account.lastError = "";
    }

    if (label !== undefined) account.label = String(label).trim();

    // Independent scheduling preference for this sender account.
    Object.assign(account, readSchedulePreferences(req.body));

    if (typeof enabled === "boolean") {
      account.enabled = enabled;
      if (!enabled && account.isDefault) {
        account.isDefault = false;
        const next = user.emailAccounts.find((a) => a.enabled !== false);
        if (next) next.isDefault = true;
      }
    }

    if (isDefault === true) {
      user.emailAccounts.forEach((a) => { a.isDefault = false; });
      account.isDefault = true;
      account.enabled = true;
    }

    // Always keep exactly one default when at least one enabled account exists.
    const enabledAccounts = user.emailAccounts.filter((a) => a.enabled !== false);
    if (enabledAccounts.length && !enabledAccounts.some((a) => a.isDefault)) {
      enabledAccounts[0].isDefault = true;
    }

    syncLegacyGmail(user);
    await user.save();

    res.json({ message: "Gmail account updated", account: toPublicAccount(account), ...publicPayload(user) });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/email-accounts/:id/default — set the default sender
router.post("/:id/default", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const account = (user.emailAccounts || []).find((a) => String(a._id) === String(req.params.id));
    if (!account) return res.status(404).json({ message: "Gmail account not found" });

    user.emailAccounts.forEach((a) => { a.isDefault = String(a._id) === String(account._id); });
    account.enabled = true;
    syncLegacyGmail(user);
    await user.save();

    res.json({ message: "Default sender updated", ...publicPayload(user) });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/email-accounts/:id/test — verify stored credentials with Gmail
router.post("/:id/test", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const account = (user.emailAccounts || []).find((a) => String(a._id) === String(req.params.id));
    if (!account) return res.status(404).json({ message: "Gmail account not found" });

    account.lastTestedAt = new Date();
    try {
      const appPassword = decrypt(account.appPasswordEnc);
      await verifyAccountCredentials({ address: account.address, appPassword });
      account.lastTestOk = true;
      account.lastError = "";
      await user.save();
      res.json({ message: "Connection successful", account: toPublicAccount(account) });
    } catch (err) {
      account.lastTestOk = false;
      account.lastError = String(err.message || "Test failed").slice(0, 300);
      await user.save();
      res.status(err.status || 400).json({ message: account.lastError, account: toPublicAccount(account) });
    }
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/email-accounts/test — verify credentials without saving them
router.post("/test", async (req, res) => {
  try {
    const { address, appPassword } = req.body;
    await verifyAccountCredentials({ address, appPassword });
    res.json({ message: "Connection successful" });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/email-accounts/:id
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const account = (user.emailAccounts || []).find((a) => String(a._id) === String(req.params.id));
    if (!account) return res.status(404).json({ message: "Gmail account not found" });

    const activeJobs = await ScheduledEmail.countDocuments({
      owner: req.userId,
      accountId: account._id,
      status: { $in: ACTIVE_JOB_STATUSES },
    });
    if (activeJobs > 0) {
      throw new AccountError(
        409,
        `This account has ${activeJobs} pending/scheduled email(s). Cancel or move them before deleting the account.`,
        "ACCOUNT_IN_USE"
      );
    }

    const wasDefault = account.isDefault;
    user.emailAccounts = user.emailAccounts.filter((a) => String(a._id) !== String(account._id));

    if (wasDefault) {
      const next = user.emailAccounts.find((a) => a.enabled !== false);
      if (next) next.isDefault = true;
    }
    if (user.emailAccounts.length && !user.emailAccounts.some((a) => a.isDefault)) {
      user.emailAccounts[0].isDefault = true;
    }

    syncLegacyGmail(user);
    await user.save();

    res.json({ message: "Gmail account removed", ...publicPayload(user) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/debug", async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const accounts = user.emailAccounts || [];
    res.json({
      totalAccounts: accounts.length,
      accounts: accounts.map((a) => ({
        address: a.address,
        enabled: a.enabled,
        hasPassword: !!a.appPasswordEnc,
        scheduleAction: a.scheduleAction,
        scheduleTime: a.scheduleTime,
        scheduleTimezone: a.scheduleTimezone,
        isDefault: a.isDefault,
        _id: String(a._id),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
