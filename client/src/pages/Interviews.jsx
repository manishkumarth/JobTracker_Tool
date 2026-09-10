import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listInterviews, updateInterview } from "../api/interviews.js";
import { exportCalendarICS } from "../api/calendar.js";
import EmptyState from "../components/EmptyState.jsx";

const RESULTS = ["Scheduled", "Completed", "Passed", "Failed", "Rescheduled", "Cancelled"];

const RESULT_STYLE = {
  Scheduled: "badge-info",
  Completed: "badge-neutral",
  Passed: "badge-success",
  Failed: "badge-danger",
  Rescheduled: "badge-warning",
  Cancelled: "badge-neutral",
};

export default function Interviews() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listInterviews()
      .then((data) => { setInterviews(data); setLoading(false); })
      .catch(() => { toast.error("Failed to load interviews"); setLoading(false); });
  };
  useEffect(load, []);

  const setResult = async (id, result) => {
    try {
      const updated = await updateInterview(id, { result });
      setInterviews((prev) => prev.map((i) => (i._id === id ? updated : i)));
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleExportICS = async () => {
    try {
      const blob = await exportCalendarICS("interviews");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "interviews.ics";
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Interviews exported to calendar");
    } catch {
      toast.error("Failed to export calendar");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Interviews</h1>
          <p className="page-subtitle">Manage and track your interview schedule</p>
        </div>
        <button onClick={handleExportICS} className="btn btn-secondary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Export to Calendar (.ics)
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48 rounded" />
                  <div className="skeleton h-3 w-40 rounded" />
                </div>
                <div className="skeleton h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ) : interviews.length === 0 ? (
          <EmptyState
            title="No interviews scheduled"
            description="Interviews will appear here as you add them to applications."
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
        ) : (
          <div className="divide-y divide-color">
            {interviews.map((i) => (
              <div key={i._id} className="flex items-center gap-4 p-4 hover-bg transition-colors">
                <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/applications/${i.application?._id}`}
                      className="font-medium text-sm text-primary hover:text-accent truncate"
                    >
                      {i.application?.jobTitle || "—"}
                    </Link>
                    {i.application?.company?.name && (
                      <span className="text-xs text-muted">at {i.application.company.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-secondary">
                      <svg className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {new Date(i.date).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {i.interviewType && (
                      <span className="badge badge-neutral">{i.interviewType}</span>
                    )}
                    {i.round && (
                      <span className="text-xs text-muted">{i.round}</span>
                    )}
                  </div>
                  {i.interviewer && (
                    <p className="text-xs text-muted mt-1">Interviewer: {i.interviewer}</p>
                  )}
                  {i.meetingUrl && (
                    <a
                      href={i.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-1"
                    >
                      Join meeting
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  )}
                </div>

                <div className="shrink-0">
                  <select
                    value={i.result}
                    onChange={(e) => setResult(i._id, e.target.value)}
                    className={`input w-auto text-xs font-medium ${RESULT_STYLE[i.result] || ""}`}
                  >
                    {RESULTS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
