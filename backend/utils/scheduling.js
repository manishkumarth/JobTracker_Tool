// Shared scheduling rules for smart email scheduling.
//
// The same slots are offered in the UI (client/src/utils/datetime.js). Keep the
// values in sync: 11:00, 12:00 and 16:00 in the user's timezone.

export const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Kolkata";

export const QUICK_SCHEDULE_SLOTS = ["11:00", "12:00", "16:00"];

export const SCHEDULE_ACTIONS = ["now", "schedule"];

/** HH:mm in 24-hour form, e.g. "11:00", "16:30". */
export const isValidTimeSlot = (value) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));

/** True when Intl accepts the IANA timezone. */
export function isValidTimezone(value) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a schedule timestamp and reject times in the past.
 * A 60s grace window avoids failing requests that were created just before a
 * minute boundary (or a "send in a few seconds" flow).
 */
export function parseFutureSchedule(value, { now = Date.now(), graceMs = 60 * 1000 } = {}) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return { date: null, error: "A valid scheduled date/time is required" };
  }
  if (date.getTime() < now - graceMs) {
    return { date: null, error: "Scheduled time must be in the future" };
  }
  return { date, error: null };
}

/** Normalize a stored/half-configured account into concrete scheduling prefs. */
export function normalizeSchedulePreferences(account = {}) {
  return {
    scheduleAction: SCHEDULE_ACTIONS.includes(account.scheduleAction) ? account.scheduleAction : "schedule",
    scheduleTime: isValidTimeSlot(account.scheduleTime) ? account.scheduleTime : QUICK_SCHEDULE_SLOTS[0],
    scheduleTimezone: isValidTimezone(account.scheduleTimezone)
      ? account.scheduleTimezone
      : DEFAULT_SCHEDULE_TIMEZONE,
  };
}
