import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  cancelScheduledEmail,
  deleteScheduledEmail,
  getScheduledEmailCounts,
  listScheduledEmails,
  retryScheduledEmail,
  runDueScheduledEmails,
  sendScheduledEmailNow,
  updateScheduledEmail,
} from "../api/scheduledEmails.js";
import { listEmailAccounts } from "../api/emailAccounts.js";
import {
  DEFAULT_TIMEZONE,
  formatInTimezone,
  utcToZonedInputs,
  zonedTimeToUtc,
} from "../utils/datetime.js";
import ScheduleTimePicker from "../components/ScheduleTimePicker.jsx";

const STATUSES = ["All", "Pending", "Scheduled", "Processing", "Sent", "Failed", "Cancelled"];

const STATUS_STYLES = {
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Processing: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  Cancelled: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.Cancelled}`}>
      {status}
    </span>
  );
}

function EditModal({ email, accounts, onClose, onSaved }) {
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
      onSaved();
      onClose();
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

export default function ScheduledEmails() {
  const [status, setStatus] = useState("All");
  const [emails, setEmails] = useState([]);
  const [counts, setCounts] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [list, countData] = await Promise.all([
        listScheduledEmails({ status, search: search.trim() || undefined, limit: 100 }),
        getScheduledEmailCounts(),
      ]);
      setEmails(list.emails || []);
      setCounts(countData.counts || {});
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || "Failed to load scheduled emails");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listEmailAccounts()
      .then((data) => setAccounts((data.accounts || []).filter((a) => a.enabled)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const runAction = async (id, action, successMessage) => {
    setBusyId(id);
    try {
      await action();
      toast.success(successMessage);
      await load({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.message || "Action failed");
      await load({ silent: true });
    } finally {
      setBusyId("");
    }
  };

  const handleCancel = (email) => {
    if (!window.confirm(`Cancel the scheduled email to ${email.recipient}?`)) return;
    runAction(email._id, () => cancelScheduledEmail(email._id), "Scheduled email cancelled");
  };

  const handleSendNow = (email) => {
    if (!window.confirm(`Send this email to ${email.recipient} right now?`)) return;
    runAction(email._id, () => sendScheduledEmailNow(email._id), "Email sent");
  };

  const handleRetry = (email) => {
    runAction(email._id, () => retryScheduledEmail(email._id), "Retry attempted");
  };

  const handleDelete = (email) => {
    if (!window.confirm("Delete this scheduled email record?")) return;
    runAction(email._id, () => deleteScheduledEmail(email._id), "Record deleted");
  };

  const handleRunDue = async () => {
    try {
      const result = await runDueScheduledEmails(20);
      toast.success(`Processed ${result.processed || 0} due email(s)`);
      await load({ silent: true });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to process due emails");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="page-title">Scheduled Emails</h1>
          <p className="page-subtitle">Send now, schedule, retry and track every application email.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="btn btn-secondary btn-sm">Refresh</button>
          <button onClick={handleRunDue} className="btn btn-primary btn-sm">Process due</button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              status === s
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white dark:bg-gray-900 text-secondary border-color hover:border-brand-400"
            }`}
          >
            {s}
            <span className={`ml-1.5 text-[10px] ${status === s ? "text-white/80" : "text-muted"}`}>
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search recipient, subject or sender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-24 w-full rounded-2xl" />)}
        </div>
      ) : emails.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-primary">No scheduled emails{status !== "All" ? ` in ${status}` : ""}</p>
          <p className="text-xs text-muted">Schedule an email from any application’s AI Email Assistant.</p>
          <Link to="/applications" className="btn btn-primary btn-sm inline-flex mt-2">Go to Applications</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map((email) => {
            const isBusy = busyId === email._id;
            const canEdit = ["Pending", "Scheduled"].includes(email.status);
            return (
              <div key={email._id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{email.subject}</p>
                    <p className="text-xs text-muted break-all">To: {email.recipient}</p>
                  </div>
                  <StatusBadge status={email.status} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">From</span>
                    <span className="text-secondary break-all">{email.senderAccount || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Scheduled</span>
                    <span className="text-secondary">{formatInTimezone(email.scheduledAt, email.timezone || DEFAULT_TIMEZONE)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Type</span>
                    <span className="text-secondary">{email.emailType}{email.isAiGenerated ? " · AI" : ""}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide">Attempts</span>
                    <span className="text-secondary">{email.attempts || 0}/{email.maxAttempts || 3}</span>
                  </div>
                </div>

                {email.application?.jobTitle && (
                  <p className="text-[11px] text-muted">
                    Application: <Link to={`/applications/${email.application._id}`} className="underline text-accent">{email.application.jobTitle}</Link>
                    {email.resumeName ? ` · Resume: ${email.resumeName}` : ""}
                  </p>
                )}

                {email.lastError && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 break-words">Error: {email.lastError}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {canEdit && (
                    <button onClick={() => setEditing(email)} disabled={isBusy} className="btn btn-secondary text-xs px-3 py-1.5">Edit</button>
                  )}
                  {["Pending", "Scheduled", "Failed"].includes(email.status) && (
                    <button onClick={() => handleSendNow(email)} disabled={isBusy} className="btn btn-primary text-xs px-3 py-1.5">
                      {isBusy ? "…" : "Send now"}
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => handleCancel(email)} disabled={isBusy} className="btn btn-ghost text-xs px-3 py-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                      Cancel
                    </button>
                  )}
                  {email.status === "Failed" && (
                    <button onClick={() => handleRetry(email)} disabled={isBusy} className="btn btn-secondary text-xs px-3 py-1.5">Retry</button>
                  )}
                  {["Cancelled", "Failed"].includes(email.status) && (
                    <button onClick={() => handleDelete(email)} disabled={isBusy} className="btn btn-ghost text-xs px-3 py-1.5 text-danger hover:bg-danger-light">Delete</button>
                  )}
                  {email.status === "Sent" && email.emailLogId && (
                    <Link to="/emails" className="btn btn-ghost text-xs px-3 py-1.5 text-accent">View in history</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditModal
          email={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => load({ silent: true })}
        />
      )}
    </div>
  );
}
