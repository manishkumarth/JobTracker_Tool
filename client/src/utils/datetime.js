export const DEFAULT_TIMEZONE = "Asia/Kolkata";

// Predefined slots based on typical Indian corporate working hours.
export const QUICK_SCHEDULE_SLOTS = [
  { value: "11:00", label: "11:00 AM", hint: "Late morning" },
  { value: "12:00", label: "12:00 PM", hint: "Midday" },
  { value: "16:00", label: "4:00 PM", hint: "Afternoon" },
];

export const slotLabel = (value) =>
  QUICK_SCHEDULE_SLOTS.find((slot) => slot.value === value)?.label || value || "";

const pad2 = (n) => String(n).padStart(2, "0");

/** yyyy-mm-dd for a Date in the given timezone. */
export function formatDateInput(date, timeZone = DEFAULT_TIMEZONE) {
  const p = zonedParts(date instanceof Date ? date : new Date(date), timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Weekday (0=Sun … 6=Sat) for a yyyy-mm-dd calendar date. */
export function weekdayOfInput(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-").map(Number);
  if ([year, month, day].some((n) => Number.isNaN(n))) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekendDate(dateStr) {
  const weekday = weekdayOfInput(dateStr);
  return weekday === 0 || weekday === 6;
}

export function addDaysToInput(dateStr, days) {
  const [year, month, day] = String(dateStr || "").split("-").map(Number);
  if ([year, month, day].some((n) => Number.isNaN(n))) return dateStr;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

/** First working day on/after the given date (weekends are skipped). */
export function nextWorkingDayFrom(dateStr) {
  let cursor = dateStr;
  for (let i = 0; i < 8 && isWeekendDate(cursor); i += 1) {
    cursor = addDaysToInput(cursor, 1);
  }
  return cursor;
}

/**
 * The next usable occurrence of a time slot, skipping past times today and
 * weekends. Used for the initial value and for "use next available" suggestions.
 */
export function upcomingSlotInputs(timeStr, timeZone = DEFAULT_TIMEZONE, { from = new Date() } = {}) {
  const time = String(timeStr || "11:00");
  const today = formatDateInput(from, timeZone);

  if (!isWeekendDate(today)) {
    const candidate = zonedTimeToUtc(today, time, timeZone);
    if (candidate && candidate.getTime() > from.getTime() + 60 * 1000) {
      return { date: today, time };
    }
  }

  // Strictly after today, skipping Saturday/Sunday.
  let date = addDaysToInput(today, 1);
  while (isWeekendDate(date)) date = addDaysToInput(date, 1);
  return { date, time };
}

/** Human summary of the chosen wall-clock date/time in its timezone. */
export function formatScheduleSummary(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  const utc = zonedTimeToUtc(dateStr, timeStr, timeZone);
  if (!utc) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(utc);
  } catch {
    return utc.toLocaleString();
  }
}

/** Validation + hints for the smart picker. */
export function describeScheduleChoice(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  const utc = zonedTimeToUtc(dateStr, timeStr, timeZone);
  if (!utc) return { utc: null, isPast: false, isWeekend: false, isValid: false, summary: "" };

  return {
    utc,
    isPast: utc.getTime() < Date.now() - 60 * 1000,
    isWeekend: isWeekendDate(dateStr),
    isToday: dateStr === formatDateInput(new Date(), timeZone),
    isValid: true,
    summary: formatScheduleSummary(dateStr, timeStr, timeZone),
  };
}

export const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (Asia/Kolkata)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Asia/Dubai)" },
  { value: "Asia/Singapore", label: "Singapore (Asia/Singapore)" },
  { value: "Asia/Tokyo", label: "Japan (Asia/Tokyo)" },
  { value: "Europe/London", label: "London (Europe/London)" },
  { value: "Europe/Berlin", label: "Berlin (Europe/Berlin)" },
  { value: "America/New_York", label: "New York (America/New_York)" },
  { value: "America/Chicago", label: "Chicago (America/Chicago)" },
  { value: "America/Denver", label: "Denver (America/Denver)" },
  { value: "America/Los_Angeles", label: "Los Angeles (America/Los_Angeles)" },
  { value: "Australia/Sydney", label: "Sydney (Australia/Sydney)" },
];

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Convert a wall-clock date + time in an IANA timezone to a real UTC Date.
 * e.g. ("2026-05-01", "09:30", "Asia/Kolkata") -> 2026-05-01T04:00:00.000Z
 */
export function zonedTimeToUtc(dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr || "00:00").split(":").map(Number);
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null;

  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;

  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(utc), timeZone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = desired - actual;
    utc += diff;
    if (Math.abs(diff) < 1000) break;
  }

  return new Date(utc);
}

/** Format a stored UTC timestamp in the email's timezone. */
export function formatInTimezone(value, timeZone = DEFAULT_TIMEZONE) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function timezoneAbbreviation(timeZone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || timeZone;
  } catch {
    return timeZone;
  }
}

/** Sensible defaults for the schedule picker: 5 minutes from now. */
export function defaultScheduleInputs(timeZone = DEFAULT_TIMEZONE) {
  const target = new Date(Date.now() + 5 * 60 * 1000);
  const p = zonedParts(target, timeZone);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Split a stored UTC timestamp into date/time strings in a timezone (for edit forms). */
export function utcToZonedInputs(value, timeZone = DEFAULT_TIMEZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return defaultScheduleInputs(timeZone);
  const p = zonedParts(date, timeZone);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}
