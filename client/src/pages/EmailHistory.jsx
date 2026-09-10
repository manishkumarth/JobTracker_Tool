import { useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  listEmails,
  getEmailTrackingStats,
  getEmailThread,
  replyToEmail,
} from "../api/emails.js";
import EmptyState from "../components/EmptyState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const STATUSES = ["Draft", "Pending", "Sent", "Failed"];
const TYPES = [
  "Job Application",
  "Follow-up",
  "Thank You",
  "Interview",
  "Referral",
  "Cold Outreach",
  "Recruiter Response",
  "Other",
];

const EyeIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const ClickIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

const MailIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

export default function EmailHistory() {
  const [data, setData] = useState({ emails: [], pages: 1 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [emailType, setEmailType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [trackingStats, setTrackingStats] = useState({});
  const [thread, setThread] = useState(null);

  const [replyState, setReplyState] = useState(null);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      listEmails({ search, status, emailType, page, limit: 20 })
        .then(setData)
        .catch(() => toast.error("Failed to load emails"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, status, emailType, page]);

  const summaryStats = useMemo(() => {
    const emails = data.emails || [];
    let totalOpens = 0;
    let totalClicks = 0;
    for (const e of emails) {
      totalOpens += e.openCount || 0;
      totalClicks += e.clickCount || 0;
    }
    return { total: emails.length, totalOpens, totalClicks };
  }, [data.emails]);

  const loadTrackingStats = async (emailId) => {
    try {
      const stats = await getEmailTrackingStats(emailId);
      setTrackingStats((prev) => ({ ...prev, [emailId]: stats }));
    } catch {
      // ignore
    }
  };

  const loadThread = async (emailId) => {
    try {
      const threadData = await getEmailThread(emailId);
      setThread(threadData);
    } catch {
      toast.error("Failed to load thread");
    }
  };

  const handleReply = (email) => {
    setReplyState({
      parentEmailId: email._id,
      contactIds: [email.contact?._id || ""],
      subject: `Re: ${email.subject}`,
      message: "",
      attachmentFilename: "",
    });
    setSelected(null);
  };

  const sendReply = async () => {
    if (!replyState || !replyState.message.trim() || !replyState.contactIds.length) {
      return toast.error("Please fill in all required fields");
    }
    try {
      await replyToEmail(replyState);
      toast.success("Reply sent");
      setReplyState(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send reply");
    }
  };

  const openDetail = (email) => {
    setSelected(email);
    loadTrackingStats(email._id);
    loadThread(email._id);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Email History</h1>
          <p className="page-subtitle">Track and manage all sent emails</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 stat-gradient-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <MailIcon />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {summaryStats.total}
              </p>
              <p className="text-xs text-muted">Total Emails</p>
            </div>
          </div>
        </div>
        <div className="card p-4 stat-gradient-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <EyeIcon />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {summaryStats.totalOpens}
              </p>
              <p className="text-xs text-muted">Total Opens</p>
            </div>
          </div>
        </div>
        <div className="card p-4 stat-gradient-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <ClickIcon />
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {summaryStats.totalClicks}
              </p>
              <p className="text-xs text-muted">Total Clicks</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            placeholder="Search subject or recipient..."
            className="input pl-9"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <select
          className="input sm:w-44"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input sm:w-48"
          value={emailType}
          onChange={(e) => {
            setPage(1);
            setEmailType(e.target.value);
          }}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Email List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : data.emails.length === 0 ? (
          <EmptyState title="No email history yet." />
        ) : (
          <div className="divide-y divide-color">
            {data.emails.map((e) => {
              const stats = trackingStats[e._id] || e;
              const openCount = stats.openCount || 0;
              const clickCount = stats.clickCount || 0;
              const hasReplies =
                e.isReply || (e.threadId && e._id !== e.threadId);
              return (
                <button
                  key={e._id}
                  onClick={() => openDetail(e)}
                  className="w-full text-left p-4 hover-bg transition-colors group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-primary truncate group-hover:text-accent transition-colors">
                          {e.subject}
                        </h3>
                        {e.isAiGenerated && (
                          <span className="badge badge-primary text-[10px] px-1.5 py-0.5">
                            AI
                          </span>
                        )}
                        {hasReplies && (
                          <span className="badge badge-info text-[10px] px-1.5 py-0.5">
                            Thread
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate">
                        {e.recipient} &middot;{" "}
                        {e.application?.jobTitle ||
                          e.company?.name ||
                          e.emailType}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {openCount > 0 && (
                          <span className="flex items-center gap-1">
                            <EyeIcon />
                            {openCount}
                          </span>
                        )}
                        {clickCount > 0 && (
                          <span className="flex items-center gap-1">
                            <ClickIcon />
                            {clickCount}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={e.status} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary btn-sm disabled:opacity-40"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Prev
          </button>
          <span className="px-3 py-1 text-muted text-sm">
            {page} / {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary btn-sm disabled:opacity-40"
          >
            Next
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="modal-overlay"
          onClick={() => {
            setSelected(null);
            setThread(null);
          }}
        >
          <div
            className="modal-content p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-primary">
                  {selected.subject}
                </h2>
                <p className="text-xs text-muted mt-1">
                  To: {selected.recipient} &middot;{" "}
                  {selected.status} &middot;{" "}
                  {selected.sentAt
                    ? new Date(selected.sentAt).toLocaleString()
                    : "not sent"}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setThread(null);
                }}
                className="btn-icon shrink-0"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tracking Stats */}
            {trackingStats[selected._id] && (
              <div className="bg-tertiary rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-secondary uppercase tracking-wide">
                  Tracking
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-card rounded-lg p-3 border border-color">
                    <div className="flex items-center gap-2 mb-1">
                      <EyeIcon />
                      <span className="text-xs text-muted">Opens</span>
                    </div>
                    <p className="text-xl font-bold text-primary">
                      {trackingStats[selected._id].openCount || 0}
                    </p>
                    {trackingStats[selected._id].lastOpenedAt && (
                      <p className="text-[10px] text-muted mt-1">
                        Last:{" "}
                        {new Date(
                          trackingStats[selected._id].lastOpenedAt
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="bg-card rounded-lg p-3 border border-color">
                    <div className="flex items-center gap-2 mb-1">
                      <ClickIcon />
                      <span className="text-xs text-muted">Clicks</span>
                    </div>
                    <p className="text-xl font-bold text-primary">
                      {trackingStats[selected._id].clickCount || 0}
                    </p>
                    {trackingStats[selected._id].lastClickedAt && (
                      <p className="text-[10px] text-muted mt-1">
                        Last:{" "}
                        {new Date(
                          trackingStats[selected._id].lastClickedAt
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Thread Timeline */}
            {thread && thread.thread && thread.thread.length > 1 && (
              <div className="bg-info-light dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-3 uppercase tracking-wide">
                  Thread ({thread.thread.length} emails)
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {thread.thread.map((t) => (
                    <div
                      key={t._id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white/60 dark:bg-gray-800/40 text-xs"
                    >
                      <StatusBadge status={t.status} />
                      <span className="text-secondary truncate flex-1">
                        {t.subject}
                      </span>
                      <span className="text-muted whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString()}
                      </span>
                      {t.isReply && (
                        <span className="text-info text-[10px] font-medium">
                          Reply
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email Body */}
            <div className="bg-tertiary rounded-xl p-4">
              <p className="text-sm whitespace-pre-wrap text-secondary max-h-64 overflow-y-auto leading-relaxed">
                {selected.body}
              </p>
            </div>

            {selected.errorMessage && (
              <div className="bg-danger-light dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-xs text-danger">
                  Error: {selected.errorMessage}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-color">
              <button
                onClick={() => handleReply(selected)}
                className="btn-primary btn-sm"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Reply
              </button>
              <button
                onClick={() => {
                  setSelected(null);
                  setThread(null);
                }}
                className="btn-ghost btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {replyState && (
        <div
          className="modal-overlay"
          onClick={() => setReplyState(null)}
        >
          <div
            className="modal-content p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-primary">Reply to email</h2>
            <p className="text-xs text-muted">To: {selected?.recipient}</p>
            <input
              value={replyState.subject}
              onChange={(e) =>
                setReplyState({ ...replyState, subject: e.target.value })
              }
              className="input"
              placeholder="Subject"
            />
            <textarea
              value={replyState.message}
              onChange={(e) =>
                setReplyState({ ...replyState, message: e.target.value })
              }
              className="input"
              rows={6}
              placeholder="Your reply..."
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-color">
              <button
                onClick={() => setReplyState(null)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button onClick={sendReply} className="btn-primary btn-sm">
                Send Reply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
