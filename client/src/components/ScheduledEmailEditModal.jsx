import { useState } from "react";
import toast from "react-hot-toast";
import { updateScheduledEmail } from "../api/scheduledEmails.js";
import {
  DEFAULT_TIMEZONE,
  utcToZonedInputs,
  zonedTimeToUtc,
} from "../utils/datetime.js";
import ScheduleTimePicker from "./ScheduleTimePicker.jsx";

/**
 * Edit a Pending/Scheduled email (application or follow-up copy).
 * Shared by the Scheduled Emails page and the Follow-ups page so both sections
 * can view and edit the same rows.
 */
export default function ScheduledEmailEditModal({ email, accounts = [], onClose, onSaved }) {
  const tzDefault = email.timezone || DEFAULT_TIMEZONE;
  const initial = utcToZonedInputs(email.scheduledAt, tzDefault);
  const [subject, setSubject] = useState(email.subject || "");
  const [body, setBody] = useState(email.body || "");
  const [recipient, setRecipient] = useState(email.recipient || "");
  const [accountId, setAccountId] = useState(email.accountId || "");
  const [timezone, setTimezone] = useState(tzDefault);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    const utc = zonedTimeToUtc(date, time, timezone);
    if (!utc) return toast.error("Choose a valid date and time");
    if (utc.getTime() < Date.now() - 60 * 1000) return toast.error("Scheduled time must be in the future");

    setBusy(true);
    try {
      await updateScheduledEmail(email._id, {
        subject,
        body,
        recipient,
        accountId: accountId || null,
        scheduledAt: utc.toISOString(),
        timezone,
      });
      toast.success("Scheduled email updated");
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update scheduled email");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form onSubmit={handleSave} className="modal-content p-5 space-y-3 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-primary">Edit scheduled email</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {email.emailType === "Follow-up" && (
          <p className="text-[11px] text-muted rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
            This is a follow-up copy scheduled for another sender account. Editing it only changes
            this scheduled copy — future follow-ups continue every 3 days and never on Sunday.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted block mb-1">Recipient</label>
            <input type="email" required className="input w-full" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-muted block mb-1">Sender account</label>
            <select className="input w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>{a.address}{a.isDefault ? " (default)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">Subject</label>
          <input required className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">Message</label>
          <textarea rows={8} required className="input w-full" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="rounded-xl border border-color p-3">
          <ScheduleTimePicker
            date={date}
            time={time}
            timezone={timezone}
            disabled={busy}
            onChange={(next) => {
              setDate(next.date);
              setTime(next.time);
              setTimezone(next.timezone);
            }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}
