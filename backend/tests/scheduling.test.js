import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_SCHEDULE_SLOTS,
  DEFAULT_SCHEDULE_TIMEZONE,
  isValidTimeSlot,
  isValidTimezone,
  parseFutureSchedule,
  normalizeSchedulePreferences,
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
