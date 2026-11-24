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
 * Next occurrence of HH:mm in the given timezone, skipping the weekdays listed
 * in `skipDays` (0=Sunday … 6=Saturday). Application emails skip the whole
 * weekend; follow-ups only skip Sunday.
 */
export function nextWeekdaySlot({
  time = QUICK_SCHEDULE_SLOTS[0],
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  now = new Date(),
  skipDays = [0, 6],
  cascadeSlots = false,
} = {}) {
  const slot = isValidTimeSlot(time) ? time : QUICK_SCHEDULE_SLOTS[0];
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const today = zonedParts(now, zone);
  const cutoff = now.getTime() + 60 * 1000; // small grace for clock skew
  const blocked = new Set(Array.isArray(skipDays) ? skipDays : []);

  // Build the list of candidate slot times to try. When cascading, start with
  // the preferred slot and include every later quick slot (11 → 12 → 16) so a
  // missed 11:00 can still land at 12:00 or 16:00 today instead of tomorrow.
  const preferredIndex = QUICK_SCHEDULE_SLOTS.indexOf(slot);
  const candidateTimes = cascadeSlots
    ? (preferredIndex >= 0 ? QUICK_SCHEDULE_SLOTS.slice(preferredIndex) : QUICK_SCHEDULE_SLOTS)
    : [slot];

  for (let offset = 0; offset < 14; offset += 1) {
    // Walk calendar days in UTC arithmetic, then convert the wall clock back.
    const dayCursor = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const weekday = dayCursor.getUTCDay();
    if (blocked.has(weekday)) continue;

    for (const tryTime of candidateTimes) {
      if (!isValidTimeSlot(tryTime)) continue;
      const [hour, minute] = tryTime.split(":").map(Number);

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
  }

  // Fallback: a week from now at the same slot (keeps the caller alive).
  const fallbackDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 7));
  const [fh, fm] = slot.split(":").map(Number);
  return zonedTimeToUtc(
    {
      year: fallbackDay.getUTCFullYear(),
      month: fallbackDay.getUTCMonth() + 1,
      day: fallbackDay.getUTCDate(),
      hour: fh,
      minute: fm,
    },
    zone
  );
}

// ── Follow-up day helpers ───────────────────────────────────────────────────
// Follow-ups are due on a calendar day, not at a raw UTC instant. Storing
// "18 Nov" as 00:00 local can look like 17 Nov in UTC, so due checks always
// compare calendar keys in the user's own timezone.

/** "YYYY-MM-DD" for `date` in `timeZone`. */
export function zonedDateKey(date, timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const p = zonedParts(date, zone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Timezone used for a user's scheduling (their default account, else IST). */
export function userScheduleTimezone(user) {
  const accounts = Array.isArray(user?.emailAccounts) ? user.emailAccounts : [];
  const primary =
    accounts.find((a) => a.isDefault && a.enabled !== false) ||
    accounts.find((a) => a.enabled !== false) ||
    accounts[0];
  return isValidTimezone(primary?.scheduleTimezone)
    ? primary.scheduleTimezone
    : DEFAULT_SCHEDULE_TIMEZONE;
}

/** 0=Sunday … 6=Saturday for `date` in `timeZone`. */
export function zonedWeekday(date, timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const [year, month, day] = zonedDateKey(date, timeZone).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * A follow-up is due only on/after its calendar day in the user's timezone,
 * and never before `earliestHour` local time on that day. This stops an email
 * dated 18 Nov from going out on the evening of 17 Nov (UTC shift).
 * Sundays are never sent — the follow-up goes out on the next working day.
 */
export function isFollowUpDue({
  date,
  now = new Date(),
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  earliestHour = 9,
} = {}) {
  if (!date) return false;
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  if (zonedWeekday(now, zone) === 0) return false; // no follow-ups on Sunday
  const dueKey = zonedDateKey(date, zone);
  const todayKey = zonedDateKey(now, zone);

  if (dueKey > todayKey) return false; // scheduled for a later day
  if (dueKey < todayKey) return true; // overdue — send on the next run
  return zonedParts(now, zone).hour >= earliestHour;
}

/**
 * Build a follow-up timestamp `days` from now at HH:mm in the user's timezone.
 * Replaces `setHours(11)` which used the server clock (UTC on Vercel).
 * Never lands on a Sunday.
 */
export function followUpSlotAfter({
  from = new Date(),
  days = 3,
  time = "11:00",
  timeZone = DEFAULT_SCHEDULE_TIMEZONE,
} = {}) {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const slot = isValidTimeSlot(time) ? time : QUICK_SCHEDULE_SLOTS[0];
  const [hour, minute] = slot.split(":").map(Number);
  const target = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  const p = zonedParts(target, zone);
  let at = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour, minute }, zone);
  while (zonedWeekday(at, zone) === 0) {
    at = new Date(at.getTime() + 24 * 60 * 60 * 1000);
  }
  return at;
}

/** UTC instants for the start/end of "today" in the user's timezone. */
export function zonedDayBounds(now = new Date(), timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const p = zonedParts(now, zone);
  const start = zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, zone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse a value coming from a browser <input type="date"> / datetime-local.
 *
 * Those inputs have no timezone, so `new Date("2026-11-18T23:30")` would be
 * read on the server's UTC clock and could move the value to another day.
 * Date-only values become 11:00 in the user's timezone (a sane send hour);
 * naive datetimes are treated as wall-clock time in the user's timezone.
 */
export function parseUserDateTime(value, timeZone = DEFAULT_SCHEDULE_TIMEZONE) {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;
  const raw = String(value ?? "").trim();

  if (DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return zonedTimeToUtc({ year, month, day, hour: 11, minute: 0 }, zone);
  }

  const naive = raw.match(NAIVE_DATETIME_RE);
  if (naive) {
    const [, year, month, day, hour, minute, second] = naive;
    return zonedTimeToUtc(
      { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) },
      zone
    );
  }

  return new Date(raw);
}

