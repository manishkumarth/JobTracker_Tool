import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listFollowUps, completeFollowUp, cancelFollowUp } from "../api/followups.js";
import { exportCalendarICS } from "../api/calendar.js";
import EmptyState from "../components/EmptyState.jsx";

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

export default function FollowUps() {
  const [tab, setTab] = useState("today");
  const [followUps, setFollowUps] = useState([]);
  const [allFollowUps, setAllFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listFollowUps({ scope: "all" })
      .then((data) => {
        setAllFollowUps(data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load follow-ups");
        setLoading(false);
      });
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (tab === "all") return allFollowUps;
    return allFollowUps.filter((f) => getDueCategory(f.date) === tab);
  }, [allFollowUps, tab]);

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, upcoming: 0, all: allFollowUps.length };
    allFollowUps.forEach((f) => { c[getDueCategory(f.date)]++; });
    return c;
  }, [allFollowUps]);

  const complete = async (id) => {
    try {
      await completeFollowUp(id);
      setAllFollowUps((prev) => prev.filter((f) => f._id !== id));
      toast.success("Marked complete");
    } catch {
      toast.error("Failed to update");
    }
  };

  const cancel = async (id) => {
    try {
      await cancelFollowUp(id);
      setAllFollowUps((prev) => prev.filter((f) => f._id !== id));
      toast.success("Cancelled");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleExportICS = async () => {
    try {
      const blob = await exportCalendarICS("followups");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "followups.ics";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Follow-ups exported to calendar");
    } catch {
      toast.error("Failed to export calendar");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">Track your application follow-ups and never miss a deadline</p>
        </div>
        <button onClick={handleExportICS} className="btn btn-secondary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Export to Calendar (.ics)
        </button>
      </div>

      <div className="flex gap-2">
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
              return (
                <div key={f._id} className="flex items-center gap-4 p-4 hover-bg transition-colors">
                  <div className={`status-dot ${dotClass} shrink-0 mt-1`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`badge ${TYPE_BADGE[f.type] || "badge-neutral"}`}>
                        {f.type}
                      </span>
                      <span className={`text-xs font-medium ${
                        category === "overdue" ? "text-danger" :
                        category === "today" ? "text-warning" :
                        "text-info"
                      }`}>
                        {new Date(f.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    {f.note && <p className="text-xs text-muted mt-1 truncate">{f.note}</p>}
                  </div>

                  <div className="flex gap-2 shrink-0">
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
    </div>
  );
}
