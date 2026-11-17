import test from "node:test";
import assert from "node:assert/strict";
import {
  isFollowUpDue,
  followUpSlotAfter,
  zonedDayBounds,
  zonedDateKey,
  zonedWeekday,
  userScheduleTimezone,
  parseUserDateTime,
  nextWeekdaySlot,
} from "../utils/scheduling.js";

const IST = "Asia/Kolkata";

test("a follow-up dated 18 Nov is never due on 17 Nov (UTC shift)", () => {
  // Stored as 18 Nov 00:00 IST = 17 Nov 18:30 UTC.
  const date = new Date("2026-11-17T18:30:00.000Z");
  assert.equal(zonedDateKey(date, IST), "2026-11-18");

  // 17 Nov 23:00 IST — still the 17th locally.
  assert.equal(
    isFollowUpDue({ date, now: new Date("2026-11-17T17:30:00.000Z"), timeZone: IST }),
    false
  );

  // 18 Nov 08:00 IST — right day, but before the 09:00 local send window.
  assert.equal(
    isFollowUpDue({ date, now: new Date("2026-11-18T02:30:00.000Z"), timeZone: IST }),
    false
  );

  // 18 Nov 10:00 IST — due.
  assert.equal(
    isFollowUpDue({ date, now: new Date("2026-11-18T04:30:00.000Z"), timeZone: IST }),
    true
  );
});

test("overdue follow-ups stay due regardless of the hour", () => {
  const date = new Date("2026-11-15T05:30:00.000Z"); // 15 Nov 11:00 IST
  assert.equal(
    isFollowUpDue({ date, now: new Date("2026-11-18T01:00:00.000Z"), timeZone: IST }),
    true
  );
});

test("future-dated follow-ups are not due yet", () => {
  const date = new Date("2026-11-20T05:30:00.000Z"); // 20 Nov 11:00 IST
  assert.equal(
    isFollowUpDue({ date, now: new Date("2026-11-18T04:30:00.000Z"), timeZone: IST }),
    false
  );
});

test("followUpSlotAfter schedules 3 days ahead at 11:00 local time", () => {
  // From 17 Nov 10:00 IST → 20 Nov 11:00 IST = 20 Nov 05:30 UTC.
  const from = new Date("2026-11-17T04:30:00.000Z");
  const next = followUpSlotAfter({ from, days: 3, time: "11:00", timeZone: IST });
  assert.equal(next.toISOString(), "2026-11-20T05:30:00.000Z");
});

test("followUpSlotAfter uses the account timezone, not the server clock", () => {
  const from = new Date("2026-11-17T04:30:00.000Z"); // 17 Nov 10:00 IST
  const dubai = followUpSlotAfter({ from, days: 3, time: "11:00", timeZone: "Asia/Dubai" });
  // 20 Nov 11:00 GST (UTC+4).
  assert.equal(dubai.toISOString(), "2026-11-20T07:00:00.000Z");
});

test("zonedDayBounds returns the local calendar day as UTC instants", () => {
  // 18 Nov 02:00 IST (17 Nov 20:30 UTC) → day starts 17 Nov 18:30 UTC.
  const { start, end } = zonedDayBounds(new Date("2026-11-17T20:30:00.000Z"), IST);
  assert.equal(start.toISOString(), "2026-11-17T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-11-18T18:29:59.999Z");
});

test("date-only input becomes 11:00 in the user's timezone", () => {
  const due = parseUserDateTime("2026-11-18", IST);
  assert.equal(due.toISOString(), "2026-11-18T05:30:00.000Z");
  assert.equal(zonedDateKey(due, IST), "2026-11-18");
});

test("naive datetime-local input is read as local wall-clock, not UTC", () => {
  // 23:30 local on 18 Nov must stay on 18 Nov (UTC would push it to 17 Nov).
  const due = parseUserDateTime("2026-11-18T23:30", IST);
  assert.equal(due.toISOString(), "2026-11-18T18:00:00.000Z");
  assert.equal(zonedDateKey(due, IST), "2026-11-18");
});

test("full ISO values with a zone are passed through untouched", () => {
  const iso = "2026-11-18T05:30:00.000Z";
  assert.equal(parseUserDateTime(iso, IST).toISOString(), iso);
});

test("no follow-up is ever due on a Sunday", () => {
  // Sunday 22 Nov 2026, 10:00 IST — even an overdue follow-up waits for Monday.
  const sunday = new Date("2026-11-22T04:30:00.000Z");
  const overdue = new Date("2026-11-15T05:30:00.000Z");
  assert.equal(isFollowUpDue({ date: overdue, now: sunday, timeZone: IST }), false);
  assert.equal(
    isFollowUpDue({ date: sunday, now: sunday, timeZone: IST }),
    false
  );

  // Monday 23 Nov — the same overdue follow-up is due.
  assert.equal(
    isFollowUpDue({ date: overdue, now: new Date("2026-11-23T04:30:00.000Z"), timeZone: IST }),
    true
  );
});

test("the next follow-up slot never lands on a Sunday", () => {
  // Friday 20 Nov 2026 10:00 IST + 3 days = Monday 23 Nov (Sunday would be 22nd).
  const from = new Date("2026-11-20T04:30:00.000Z");
  const next = followUpSlotAfter({ from, days: 3, time: "11:00", timeZone: IST });
  assert.equal(zonedDateKey(next, IST), "2026-11-23");
  assert.equal(zonedWeekday(next, IST), 1);
});

test("application slots skip the weekend, follow-up slots only skip Sunday", () => {
  const saturday = new Date("2026-11-21T04:30:00.000Z"); // Sat 10:00 IST

  const appSlot = nextWeekdaySlot({ time: "16:00", timeZone: IST, now: saturday });
  assert.equal(zonedWeekday(appSlot, IST), 1, "application email waits for Monday");

  const followUpSlot = nextWeekdaySlot({ time: "16:00", timeZone: IST, now: saturday, skipDays: [0] });
  assert.equal(zonedDateKey(followUpSlot, IST), "2026-11-21", "follow-ups may go out on Saturday");
});

test("userScheduleTimezone follows the default account", () => {
  assert.equal(
    userScheduleTimezone({
      emailAccounts: [
        { address: "a@x.com", isDefault: false, scheduleTimezone: "Asia/Dubai" },
        { address: "b@x.com", isDefault: true, scheduleTimezone: "Asia/Kolkata" },
      ],
    }),
    "Asia/Kolkata"
  );
  assert.equal(userScheduleTimezone({ emailAccounts: [] }), "Asia/Kolkata");
});
