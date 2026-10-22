import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  listFollowUps,
  completeFollowUp,
  cancelFollowUp,
  sendFollowUpEmail,
  setFollowUpAutoSend,
} from "../api/followups.js";
import EmptyState from "../components/EmptyState.jsx";
import { useGmailGuard } from "../context/GmailContext.jsx";

const TABS = [
  { key: "overdue", label: "Overdue", badgeClass: "badge-danger" },
  { key: "today", label: "Today", badgeClass: "badge-warning" },
  { key: "upcoming", label: "Upcoming", badgeClass: "badge-info" },
  { key: "all", label: "All", badgeClass: "badge-neutral" },
];

const TYPE_BADGE = {
  email: "badge-primary",
  call: "badge-success",
  other: "badge-neutral",
};

function getDueCategory(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  if (d < todayStart) return "overdue";
  if (d >= todayStart && d < todayEnd) return "today";
  return "upcoming";
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const toLocalInput = (value) => {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function FollowUps() {
  const { requireGmail } = useGmailGuard();
  const [tab, setTab] = useState("today");
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [autoSend, setAutoSend] = useState(false);
  const [sendingIds, setSendingIds] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [autoDays, setAutoDays] = useState(3);
  const [autoTime, setAutoTime] = useState("09:00");
  const [schedulingAuto, setSchedulingAuto] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    listFollowUps({ scope: "all" })
      .then((data) => setFollowUps(data))
      .catch(() => toast.error("Failed to load follow-ups"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return followUps;
    return followUps.filter((f) => getDueCategory(f.date) === tab);
  }, [followUps, tab]);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, upcoming: 0, all: followUps.length };
    followUps.forEach((f) => { c[getDueCategory(f.date)]++; });
    return c;
  }, [followUps]);

  const pendingItems = followUps.filter((f) => !f.emailSent && f.status !== "Cancelled");
  const selectedCount = selected.length;

  const complete = async (id) => {
    try {
      await completeFollowUp(id);
      setFollowUps((prev) => prev.filter((f) => f._id !== id));
      setSelected((prev) => prev.filter((i) => i !== id));
      toast.success("Marked complete");
    } catch {
      toast.error("Failed to update");
    }
  };

  const cancel = async (id) => {
    try {
      await cancelFollowUp(id);
      setFollowUps((prev) => prev.filter((f) => f._id !== id));
      setSelected((prev) => prev.filter((i) => i !== id));
      toast.success("Cancelled");
    } catch {
      toast.error("Failed to update");
    }
  };

  const sendOne = async (id) => {
    if (!requireGmail()) return;
    setSendingIds((prev) => [...prev, id]);
    try {
      await sendFollowUpEmail(id);
      setFollowUps((prev) =>
        prev.map((f) =>
          f._id === id ? { ...f, emailSent: true, emailSentAt: new Date().toISOString(), status: "Completed" } : f
        )
      );
      setSelected((prev) => prev.filter((i) => i !== id));
      toast.success("Follow-up email sent");
    } catch (err) {
      if (err.response?.status === 409) {
        setFollowUps((prev) =>
          prev.map((f) => (f._id === id ? { ...f, emailSent: true, status: "Completed" } : f))
        );
      }
      toast.error(err.response?.data?.message || "Failed to send follow-up");
    } finally {
      setSendingIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const sendSelected = async () => {
    const targets = autoSend ? pendingItems.map((f) => f._id) : selected;
    if (!targets.length) {
      return toast.error(autoSend ? "No unsent follow-ups" : "Select at least one follow-up");
    }
    if (!requireGmail()) return;
    setBulkSending(true);
    let ok = 0;
    for (const id of targets) {
      try {
        await sendFollowUpEmail(id);
        setFollowUps((prev) =>
          prev.map((f) =>
            f._id === id ? { ...f, emailSent: true, emailSentAt: new Date().toISOString(), status: "Completed" } : f
          )
        );
        ok++;
      } catch {
        /* already sent or failed */
      }
    }
    setBulkSending(false);
    setSelected([]);
    if (ok > 0) toast.success(`${ok} follow-up email${ok > 1 ? "s" : ""} sent`);
    else toast.error("No follow-ups could be sent");
  };

  const applyAutoSchedule = async () => {
    const targets = selected.filter((id) => {
      const f = followUps.find((x) => x._id === id);
      return f && !f.emailSent && f.status !== "Cancelled";
    });
    if (!targets.length) return toast.error("Select at least one pending follow-up");

    const days = Number(autoDays);
    const [hours, minutes] = autoTime.split(":").map(Number);
    const when = new Date();
    when.setDate(when.getDate() + (Number.isFinite(days) ? days : 0));
    when.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    if (when <= new Date()) return toast.error("Pick a future day/time");

    setSchedulingAuto(true);
    let ok = 0;
    for (const id of targets) {
      try {
        const updated = await setFollowUpAutoSend(id, { autoSend: true, date: when.toISOString() });
        setFollowUps((prev) =>
          prev.map((f) => (f._id === id ? { ...f, autoSend: true, date: updated.date } : f))
        );
        ok++;
      } catch {
        /* skip */
      }
    }
    setSchedulingAuto(false);
    setSelected([]);
    if (ok > 0) toast.success(`Auto-send scheduled for ${ok} follow-up${ok > 1 ? "s" : ""}`);
    else toast.error("Could not schedule auto-send");
  };

  const saveEditing = async () => {
    if (!editing) return;
    const when = new Date(editing.date);
    if (Number.isNaN(when.getTime())) return toast.error("Pick a date and time");
    try {
      const updated = await setFollowUpAutoSend(editing.id, {
        autoSend: editing.autoSend,
        date: when.toISOString(),
        hrRequest: editing.hrRequest,
      });
      setFollowUps((prev) =>
        prev.map((f) =>
          f._id === editing.id
            ? { ...f, autoSend: updated.autoSend, date: updated.date, hrRequest: updated.hrRequest }
            : f
        )
      );
      setEditing(null);
      toast.success("Follow-up updated");
    } catch {
      toast.error("Failed to update follow-up");
    }
  };

  const toggleAuto = async (followUp) => {
    const next = !followUp.autoSend;
    try {
      const updated = await setFollowUpAutoSend(followUp._id, { autoSend: next });
      setFollowUps((prev) =>
        prev.map((f) => (f._id === followUp._id ? { ...f, autoSend: updated.autoSend } : f))
      );
      toast.success(next ? "Auto-send enabled" : "Auto-send disabled");
    } catch {
      toast.error("Failed to update auto-send");
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((f) => selected.includes(f._id));

  const toggleSelectAllPending = () => {
    if (allPendingSelected) setSelected([]);
    else setSelected(pendingItems.map((f) => f._id));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">Track and send your application follow-ups</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-brand-600 text-white shadow-md"
                : "bg-white border border-color text-secondary hover:bg-tertiary"
            }`}
          >
            {t.label}
            <span className={`badge text-xs ${tab === t.key ? "bg-white/20 text-white" : t.badgeClass}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
              className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent"
            />
            <span className="text-sm text-primary">Auto send to everyone not sent yet</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={toggleSelectAllPending}
              disabled={pendingItems.length === 0}
              className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent disabled:opacity-40"
            />
            <span className="text-sm text-muted">
              Select all unsent ({pendingItems.length})
            </span>
          </label>

          <div className="sm:ml-auto flex items-center gap-2">
            {selectedCount > 0 && !autoSend && (
              <span className="text-xs text-muted">{selectedCount} selected</span>
            )}
            <button onClick={sendSelected} disabled={bulkSending} className="btn btn-primary btn-sm">
              {bulkSending ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  {autoSend ? "Send all unsent" : "Send selected"}
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-t border-color pt-3">
          <span className="text-xs font-medium text-muted">Auto-send selected after</span>
          <input
            type="number"
            min="0"
            max="60"
            value={autoDays}
            onChange={(e) => setAutoDays(e.target.value)}
            className="input w-16 text-xs"
          />
          <span className="text-xs text-muted">day(s) at</span>
          <input
            type="time"
            value={autoTime}
            onChange={(e) => setAutoTime(e.target.value)}
            className="input w-28 text-xs"
          />
          <button
            type="button"
            onClick={applyAutoSchedule}
            disabled={schedulingAuto || selectedCount === 0}
            className="btn btn-sm btn-warning sm:ml-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {schedulingAuto ? "Scheduling..." : "Schedule auto-send"}
          </button>
          <span className="text-xs text-muted sm:ml-auto">
            Follow-ups without auto-send are highlighted for manual sending.
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="skeleton h-8 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              tab === "overdue" ? "No overdue follow-ups" :
              tab === "today" ? "Nothing due today" :
              tab === "upcoming" ? "No upcoming follow-ups" :
              "No follow-ups yet"
            }
            description={
              tab === "all"
                ? "Follow-ups will appear here as you add them to applications."
                : undefined
            }
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        ) : (
          <div className="divide-y divide-color">
            {filtered.map((f) => {
              const category = getDueCategory(f.date);
              const dotClass =
                category === "overdue" ? "status-dot-red" :
                category === "today" ? "status-dot-yellow" :
                "status-dot-blue";
              const isSending = sendingIds.includes(f._id);
              const sendable = !f.emailSent && f.status !== "Cancelled";
              const needsManual = sendable && !f.autoSend;
              return (
                <div
                  key={f._id}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 transition-colors ${
                    needsManual ? "bg-amber-50 dark:bg-amber-500/5 hover:bg-amber-100/70 dark:hover:bg-amber-500/10" : "hover-bg"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`status-dot ${dotClass} shrink-0 mt-1.5`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/applications/${f.application?._id}`}
                          className="font-medium text-sm text-primary hover:text-accent truncate"
                        >
                          {f.application?.jobTitle || "—"}
                        </Link>
                        {f.application?.company?.name && (
                          <span className="text-xs text-muted">at {f.application.company.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`badge ${TYPE_BADGE[f.type] || "badge-neutral"}`}>
                          {f.type}
                        </span>
                        <span className={`text-xs font-medium ${
                          category === "overdue" ? "text-danger" :
                          category === "today" ? "text-warning" :
                          "text-info"
                        }`}>
                          {formatDateTime(f.date)}
                        </span>
                        {f.emailSent && (
                          <span className="badge badge-success text-[10px]">Email sent</span>
                        )}
                        {f.autoSend && !f.emailSent && (
                          <span className="badge badge-info text-[10px]">Auto-send</span>
                        )}
                        {needsManual && (
                          <span className="badge badge-warning text-[10px]">Manual send</span>
                        )}
                      </div>
                      {f.hrRequest && (
                        <p className="text-xs text-secondary mt-1 truncate">HR: {f.hrRequest}</p>
                      )}
                      {f.note && !f.hrRequest && (
                        <p className="text-xs text-muted mt-1 truncate">{f.note}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                    {sendable && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              id: f._id,
                              date: toLocalInput(f.date),
                              hrRequest: f.hrRequest || "",
                              autoSend: Boolean(f.autoSend),
                            })
                          }
                          className="btn btn-sm btn-ghost text-muted"
                          title="Edit HR request, date/time and auto-send"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAuto(f)}
                          className={`btn btn-sm ${f.autoSend ? "btn-info" : "btn-ghost text-muted"}`}
                          title={f.autoSend ? "Disable auto-send" : "Enable auto-send for this follow-up"}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Auto
                        </button>
                      </>
                    )}

                    <label className="flex items-center gap-1.5 cursor-pointer" title={f.emailSent ? "Already sent" : "Select to send"}>
                      <input
                        type="checkbox"
                        checked={selected.includes(f._id)}
                        disabled={!sendable}
                        onChange={() => toggleSelect(f._id)}
                        className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent disabled:opacity-40"
                      />
                      <span className="text-xs text-muted">Send</span>
                    </label>

                    {sendable && (
                      <button
                        onClick={() => sendOne(f._id)}
                        disabled={isSending}
                        className="btn btn-sm btn-primary"
                        title="Send follow-up email now"
                      >
                        {isSending ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => complete(f._id)}
                      className="btn btn-sm btn-success"
                      title="Mark as complete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Done
                    </button>
                    <button
                      onClick={() => cancel(f._id)}
                      className="btn btn-sm btn-ghost text-muted"
                      title="Cancel follow-up"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Edit follow-up</h2>
              <button onClick={() => setEditing(null)} className="btn btn-sm btn-ghost text-muted">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Send at</label>
              <input
                type="datetime-local"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">HR requirement</label>
              <textarea
                rows={3}
                value={editing.hrRequest}
                onChange={(e) => setEditing({ ...editing, hrRequest: e.target.value })}
                placeholder="e.g. CTC, notice period, total experience"
                className="input w-full"
              />
              <p className="text-[11px] text-muted mt-1">
                Only these details are included. Resume and portfolio/LinkedIn/GitHub links are always sent.
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={editing.autoSend}
                onChange={(e) => setEditing({ ...editing, autoSend: e.target.checked })}
                className="mt-0.5 rounded"
              />
              <span>Auto-send this follow-up at the selected time</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn btn-sm btn-secondary">
                Cancel
              </button>
              <button onClick={saveEditing} className="btn btn-sm btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
