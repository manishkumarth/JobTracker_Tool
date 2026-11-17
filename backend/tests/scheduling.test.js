import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_SCHEDULE_SLOTS,
  DEFAULT_SCHEDULE_TIMEZONE,
  isValidTimeSlot,
  isValidTimezone,
  parseFutureSchedule,
  normalizeSchedulePreferences,
  zonedTimeToUtc,
  nextWeekdaySlot,
} from "../utils/scheduling.js";

test("quick slots are the Indian corporate defaults", () => {
  assert.deepEqual(QUICK_SCHEDULE_SLOTS, ["11:00", "12:00", "16:00"]);
  assert.equal(DEFAULT_SCHEDULE_TIMEZONE, "Asia/Kolkata");
});

test("time slots accept 24-hour HH:mm only", () => {
  assert.equal(isValidTimeSlot("11:00"), true);
  assert.equal(isValidTimeSlot("16:30"), true);
  assert.equal(isValidTimeSlot("00:00"), true);
  assert.equal(isValidTimeSlot("9:00"), false);
  assert.equal(isValidTimeSlot("24:00"), false);
  assert.equal(isValidTimeSlot("11:60"), false);
  assert.equal(isValidTimeSlot(""), false);
});

test("timezone validation rejects unknown IANA names", () => {
  assert.equal(isValidTimezone("Asia/Kolkata"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Not/AZone"), false);
  assert.equal(isValidTimezone(""), false);
});

test("past schedule times are rejected, future ones accepted", () => {
  const now = Date.parse("2026-05-01T10:00:00.000Z");

  assert.equal(parseFutureSchedule("2026-05-01T09:00:00.000Z", { now }).error, "Scheduled time must be in the future");
  assert.equal(parseFutureSchedule("2026-05-01T11:00:00.000Z", { now }).error, null);

  // A job created seconds ago is still accepted (grace window).
  assert.equal(parseFutureSchedule("2026-05-01T09:59:30.000Z", { now }).error, null);
  // Invalid values never become a Date.
  assert.equal(parseFutureSchedule("not-a-date", { now }).error, "A valid scheduled date/time is required");
  assert.equal(parseFutureSchedule("", { now }).error, "A valid scheduled date/time is required");
});

test("account scheduling preferences are normalized with safe defaults", () => {
  const defaults = normalizeSchedulePreferences({});
  assert.deepEqual(defaults, {
    scheduleAction: "schedule",
    scheduleTime: "11:00",
    scheduleTimezone: "Asia/Kolkata",
  });

  const custom = normalizeSchedulePreferences({
    scheduleAction: "now",
    scheduleTime: "16:00",
    scheduleTimezone: "Asia/Dubai",
  });
  assert.deepEqual(custom, {
    scheduleAction: "now",
    scheduleTime: "16:00",
    scheduleTimezone: "Asia/Dubai",
  });

  const invalid = normalizeSchedulePreferences({
    scheduleAction: "later",
    scheduleTime: "25:00",
    scheduleTimezone: "Mars/Olympus",
  });
  assert.deepEqual(invalid, defaults);
});

test("zoned wall-clock time converts to the correct UTC instant", () => {
  // 11:00 IST (UTC+5:30) is 05:30 UTC.
  const ist = zonedTimeToUtc({ year: 2026, month: 5, day: 4, hour: 11, minute: 0 }, "Asia/Kolkata");
  assert.equal(ist.toISOString(), "2026-05-04T05:30:00.000Z");

  // 16:00 in UTC stays 16:00 UTC.
  const utc = zonedTimeToUtc({ year: 2026, month: 5, day: 4, hour: 16, minute: 0 }, "UTC");
  assert.equal(utc.toISOString(), "2026-05-04T16:00:00.000Z");
});

test("next weekday slot respects the account timezone and skips weekends", () => {
  // Friday 2026-05-01 12:00 IST → next 11:00 slot is Monday 2026-05-04 11:00 IST.
  const now = new Date("2026-05-01T06:30:00.000Z");
  const next = nextWeekdaySlot({ time: "11:00", timeZone: "Asia/Kolkata", now });
  assert.equal(next.toISOString(), "2026-05-04T05:30:00.000Z");
  assert.equal(next.getUTCDay(), 1, "Monday");

  // Later the same day but before the slot → today's slot, not tomorrow.
  const morning = nextWeekdaySlot({
    time: "16:00",
    timeZone: "Asia/Kolkata",
    now: new Date("2026-05-04T04:00:00.000Z"), // Monday 09:30 IST
  });
  assert.equal(morning.toISOString(), "2026-05-04T10:30:00.000Z");
});

test("next weekday slot never returns a weekend timestamp", () => {
  const now = new Date("2026-05-02T04:00:00.000Z"); // Saturday
  for (const time of QUICK_SCHEDULE_SLOTS) {
    const next = nextWeekdaySlot({ time, timeZone: "Asia/Kolkata", now });
    const weekday = next.getUTCDay();
    assert.notEqual(weekday, 0, `Sunday produced for ${time}`);
    assert.notEqual(weekday, 6, `Saturday produced for ${time}`);
    assert.ok(next.getTime() > now.getTime());
  }
});
