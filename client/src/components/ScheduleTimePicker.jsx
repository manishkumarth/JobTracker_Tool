import { useEffect, useState } from "react";
import {
  DEFAULT_TIMEZONE,
  QUICK_SCHEDULE_SLOTS,
  TIMEZONES,
  describeScheduleChoice,
  formatDateInput,
  isWeekendDate,
  nextWorkingDayFrom,
  slotLabel,
  timezoneAbbreviation,
  upcomingSlotInputs,
} from "../utils/datetime.js";

/**
 * Smart schedule picker shared by the AI composer and the Scheduled Emails
 * edit modal. Quick slots are one click; anything else is a custom time.
 *
 * Important: this component never silently rewrites a manually chosen date or
 * time. Past/weekend selections are flagged with an explicit one-click fix.
 */
export default function ScheduleTimePicker({
  date,
  time,
  timezone = DEFAULT_TIMEZONE,
  onChange,
  disabled = false,
}) {
  const quickMatch = QUICK_SCHEDULE_SLOTS.some((slot) => slot.value === time);
  const [custom, setCustom] = useState(!quickMatch);

  // Account preferences or another control can switch the time; follow the
  // matching mode without ever normalising the chosen value.
  useEffect(() => {
    setCustom(!quickMatch);
  }, [quickMatch]);

  const info = describeScheduleChoice(date, time, timezone);
  const weekend = isWeekendDate(date);
  const update = (patch) => onChange({ date, time, timezone, ...patch });

  const applySlot = (value) => {
    setCustom(false);
    update({ time: value });
  };

  const openCustom = () => {
    setCustom(true);
    // Do not change the current time; the time input below edits it directly.
  };

  const useNextAvailable = () => update(upcomingSlotInputs(time, timezone));
  const moveOffWeekend = () => update({ date: nextWorkingDayFrom(date) });

  return (
    <div className="space-y-3">
      {/* Quick slots */}
      <div>
        <label className="text-[11px] font-medium text-muted block mb-1.5">
          Quick times <span className="text-muted">(IST working hours)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_SCHEDULE_SLOTS.map((slot) => {
            const active = !custom && time === slot.value;
            return (
              <button
                key={slot.value}
                type="button"
                disabled={disabled}
                onClick={() => applySlot(slot.value)}
                className={`rounded-xl border px-2 py-2 text-center transition ${
                  active
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm"
                    : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className="block text-xs font-bold">{slot.label}</span>
                <span className="block text-[10px] text-muted">{slot.hint}</span>
              </button>
            );
          })}
          <button
            type="button"
            disabled={disabled}
            onClick={openCustom}
            className={`rounded-xl border px-2 py-2 text-center transition ${
              custom
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm"
                : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="block text-xs font-bold">Custom</span>
            <span className="block text-[10px] text-muted">Any time</span>
          </button>
        </div>
      </div>

      {/* Date / time / timezone */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] text-muted block mb-1">Date</label>
          <input
            type="date"
            className="input w-full text-sm"
            value={date}
            min={formatDateInput(new Date(), timezone)}
            disabled={disabled}
            onChange={(e) => update({ date: e.target.value })}
          />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">Time</label>
          {custom || !quickMatch ? (
            <input
              type="time"
              className="input w-full text-sm"
              value={time}
              disabled={disabled}
              onChange={(e) => update({ time: e.target.value })}
            />
          ) : (
            <button
              type="button"
              onClick={openCustom}
              className="input w-full text-sm text-left flex items-center justify-between"
              title="Change to a custom time"
            >
              <span>{slotLabel(time)}</span>
              <span className="text-[10px] text-muted">Change</span>
            </button>
          )}
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">Timezone</label>
          <select
            className="input w-full text-sm"
            value={timezone}
            disabled={disabled}
            onChange={(e) => update({ timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected summary + hints */}
      {info.isValid ? (
        <div
          className={`rounded-xl border p-2.5 text-[11px] ${
            info.isPast
              ? "border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
              : weekend
                ? "border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="font-medium break-words">
              {info.isPast ? "This time has already passed" : "Selected"}:{" "}
              <span className="font-semibold">{info.summary}</span>{" "}
              <span className="opacity-80">({timezoneAbbreviation(timezone)})</span>
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {info.isPast && (
                <button type="button" onClick={useNextAvailable} disabled={disabled} className="btn btn-secondary text-[11px] px-2 py-1">
                  Use next working slot
                </button>
              )}
              {weekend && (
                <button type="button" onClick={moveOffWeekend} disabled={disabled} className="btn btn-secondary text-[11px] px-2 py-1">
                  Move to Monday
                </button>
              )}
            </div>
          </div>
          {!info.isPast && weekend && (
            <p className="mt-1">
              Recruiters usually read email on weekdays — you can still send on the weekend if you prefer.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-red-600 dark:text-red-400">Choose a valid date and time.</p>
      )}
    </div>
  );
}
