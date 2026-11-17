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

// ── Timezone-aware slot helpers ─────────────────────────────────────────────
// Serverless hosts run in UTC, so "11:00 in Asia/Kolkata" must be converted
// explicitly instead of relying on the server's local clock.

const partsFormatterCache = new Map();
function partsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  }
  return partsFormatterCache.get(timeZone);
}

/** Wall-clock parts of `date` inside `timeZone`. */
export function zonedParts(date, timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const parts = partsFormatter(timeZone)
    .formatToParts(date)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - date.getTime()) / 60000;
}

/** Convert a wall-clock time in `timeZone` to the equivalent UTC Date. */
export function zonedTimeToUtc({ year, month, day, hour, minute = 0 }, timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = offsetMinutes(new Date(guess), timeZone);
  let ts = guess - firstOffset * 60000;
  const secondOffset = offsetMinutes(new Date(ts), timeZone);
  if (secondOffset !== firstOffset) ts = guess - secondOffset * 60000;
  return new Date(ts);
}

/**
 * Next weekday occurrence of HH:mm in the given timezone.
 * Weekends are skipped so a scheduled application email never lands on a
 * Saturday/Sunday slot.
 */
export function nextWeekdaySlot({
  time = QUICK_SCHEDULE_SLOTS[0],
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  now = new Date(),
} = {}) {
  const slot = isValidTimeSlot(time) ? time : QUICK_SCHEDULE_SLOTS[0];
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const [hour, minute] = slot.split(":").map(Number);
  const today = zonedParts(now, zone);
  const cutoff = now.getTime() + 60 * 1000; // small grace for clock skew

  for (let offset = 0; offset < 10; offset += 1) {
    // Walk calendar days in UTC arithmetic, then convert the wall clock back.
    const dayCursor = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = dayCursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const candidate = zonedTimeToUtc(
      {
        year: dayCursor.getUTCFullYear(),
        month: dayCursor.getUTCMonth() + 1,
        day: dayCursor.getUTCDate(),
        hour,
        minute,
      },
      zone
    );
    if (candidate.getTime() > cutoff) return candidate;
  }

  // Fallback: a week from now at the same slot (keeps the caller alive).
  const fallbackDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 7));
  return zonedTimeToUtc(
    {
      year: fallbackDay.getUTCFullYear(),
      month: fallbackDay.getUTCMonth() + 1,
      day: fallbackDay.getUTCDate(),
      hour,
      minute,
    },
    zone
  );
}

