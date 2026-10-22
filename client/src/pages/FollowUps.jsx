import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listFollowUps, sendFollowUpEmail, updateFollowUp } from "../api/followups.js";
import EmptyState from "../components/EmptyState.jsx";
import { useGmailGuard } from "../context/GmailContext.jsx";

const TABS = [
  { key: "overdue", label: "Overdue", badgeClass: "badge-danger" },
  { key: "today", label: "Today", badgeClass: "badge-warning" },
  { key: "upcoming", label: "Upcoming", badgeClass: "badge-info" },
  { key: "all", label: "All", badgeClass: "badge-neutral" },
];

const TYPE_BADGE = {
  "Email Follow-up": "badge-primary",
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

/** Format Date → value for <input type="datetime-local"> */
function toLocalInputValue(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FollowUps() {
  const { requireGmail } = useGmailGuard();
  const [tab, setTab] = useState("today");
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [autoSend, setAutoSend] = useState(false);
  const [sendingIds, setSendingIds] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ date: "", note: "", type: "Email Follow-up" });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    listFollowUps({ scope: "all" })
      .then((data) => setFollowUps(data))
      .catch(() => toast.error("Failed to load follow-ups"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (tab === "all") return followUps;
    return followUps.filter((f) => getDueCategory(f.date) === tab);
  }, [followUps, tab]);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, upcoming: 0, all: followUps.length };
    followUps.forEach((f) => {
      c[getDueCategory(f.date)]++;
    });
    return c;
  }, [followUps]);

  const pendingItems = followUps.filter((f) => !f.emailSent);
  const selectedCount = selected.length;

  const openEdit = (f) => {
    setEditingId(f._id);
    setEditForm({
      date: toLocalInputValue(f.date),
      note: f.note || "",
      type: f.type || "Email Follow-up",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ date: "", note: "", type: "Email Follow-up" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editForm.date) {
      toast.error("Pick a date and time");
      return;
    }
    setSavingEdit(true);
    try {
      const due = new Date(editForm.date);
      const updated = await updateFollowUp(editingId, {
        date: due.toISOString(),
        note: editForm.note,
        type: editForm.type,
      });
      setFollowUps((prev) =>
        prev.map((f) =>
          f._id === editingId
            ? { ...f, date: updated.date || due.toISOString(), note: editForm.note, type: editForm.type }
            : f
        )
      );
      toast.success("Follow-up updated");
      cancelEdit();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  };

  const sendOne = async (id) => {
    if (!requireGmail()) return;
    setSendingIds((prev) => [...prev, id]);
    try {
      await sendFollowUpEmail(id);
      setFollowUps((prev) =>
        prev.map((f) => (f._id === id ? { ...f, emailSent: true, status: "Completed" } : f))
      );
      setSelected((prev) => prev.filter((i) => i !== id));
      toast.success("Follow-up email sent");
    } catch (err) {
      if (err.response?.status === 409) {
        setFollowUps((prev) => prev.map((f) => (f._id === id ? { ...f, emailSent: true } : f)));
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
        setFollowUps((prev) => prev.map((f) => (f._id === id ? { ...f, emailSent: true } : f)));
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

      {/* Send controls */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
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
          <span className="text-sm text-muted">Select all pending ({pendingItems.length})</span>
        </label>

        <div className="sm:ml-auto flex items-center gap-2">
          {selectedCount > 0 && !autoSend && (
            <span className="text-xs text-muted">{selectedCount} selected</span>
          )}
          <button onClick={sendSelected} disabled={bulkSending} className="btn btn-primary btn-sm">
            {bulkSending ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                {autoSend ? "Send all unsent" : "Send selected"}
              </>
            )}
          </button>
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
              tab === "overdue"
                ? "No overdue follow-ups"
                : tab === "today"
                  ? "Nothing due today"
                  : tab === "upcoming"
                    ? "No upcoming follow-ups"
                    : "No follow-ups yet"
            }
            description={
              tab === "all"
                ? "Follow-ups will appear here as you add them to applications."
                : undefined
            }
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
        ) : (
          <div className="divide-y divide-color">
            {filtered.map((f) => {
              const category = getDueCategory(f.date);
              const dotClass =
                category === "overdue"
                  ? "status-dot-red"
                  : category === "today"
                    ? "status-dot-yellow"
                    : "status-dot-blue";
              const isSending = sendingIds.includes(f._id);
              const isEditing = editingId === f._id;

              return (
                <div key={f._id} className="p-4 hover-bg transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                          <span className={`badge ${TYPE_BADGE[f.type] || "badge-neutral"}`}>{f.type}</span>
                          <span
                            className={`text-xs font-medium ${
                              category === "overdue"
                                ? "text-danger"
                                : category === "today"
                                  ? "text-warning"
                                  : "text-info"
                            }`}
                          >
                            {new Date(f.date).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          {f.emailSent && (
                            <span className="badge badge-success text-[10px]">Email sent</span>
                          )}
                        </div>
                        {f.note && !isEditing && (
                          <p className="text-xs text-muted mt-1 truncate">{f.note}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                      {/* Edit button — only for unsent */}
                      {!f.emailSent && !isEditing && (
                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          className="btn btn-sm btn-ghost text-muted"
                          title="Edit date / note"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Edit
                        </button>
                      )}

                      <label
                        className="flex items-center gap-1.5 cursor-pointer"
                        title={f.emailSent ? "Already sent" : "Select to send"}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(f._id)}
                          disabled={f.emailSent}
                          onChange={() => toggleSelect(f._id)}
                          className="w-4 h-4 rounded border-border-strong text-accent focus:ring-accent disabled:opacity-40"
                        />
                        <span className="text-xs text-muted">Send</span>
                      </label>

                      {!f.emailSent ? (
                        <button
                          onClick={() => sendOne(f._id)}
                          disabled={isSending}
                          className="btn btn-sm btn-primary"
                          title="Send follow-up email now"
                        >
                          {isSending ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                              />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="badge badge-success text-xs">Sent</span>
                      )}
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {isEditing && (
                    <div className="mt-3 ml-6 sm:ml-8 p-3 rounded-lg bg-tertiary border border-color space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block">
                          <span className="text-xs font-medium text-secondary">Date & time</span>
                          <input
                            type="datetime-local"
                            className="input mt-1 w-full text-sm"
                            value={editForm.date}
                            onChange={(e) => setEditForm((s) => ({ ...s, date: e.target.value }))}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-secondary">Type</span>
                          <select
                            className="input mt-1 w-full text-sm"
                            value={editForm.type}
                            onChange={(e) => setEditForm((s) => ({ ...s, type: e.target.value }))}
                          >
                            <option>Email Follow-up</option>
                            <option>Call Follow-up</option>
                            <option>LinkedIn Follow-up</option>
                            <option>Recruiter Follow-up</option>
                            <option>Interview Follow-up</option>
                            <option>General</option>
                          </select>
                        </label>
                        <label className="block sm:col-span-1">
                          <span className="text-xs font-medium text-secondary">Note</span>
                          <input
                            type="text"
                            className="input mt-1 w-full text-sm"
                            placeholder="Optional note"
                            value={editForm.note}
                            onChange={(e) => setEditForm((s) => ({ ...s, note: e.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit}
                          className="btn btn-primary btn-sm"
                        >
                          {savingEdit ? "Saving..." : "Save changes"}
                        </button>
                        <button type="button" onClick={cancelEdit} className="btn btn-ghost btn-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
