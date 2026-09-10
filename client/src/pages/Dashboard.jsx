import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getDashboardStats } from "../api/dashboard.js";
import StatusBadge from "../components/StatusBadge.jsx";
import GmailConnect from "../components/GmailConnect.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    getDashboardStats()
      .then((d) => {
        // Backend wraps counts in `stats`, flatten to top-level
        setData({
          totalApplications: d.stats?.totalApplications ?? 0,
          pendingCount: d.stats?.emailsPending ?? 0,
          interviewCount: d.stats?.interviewsScheduled ?? 0,
          offerCount: d.stats?.offers ?? 0,
          recentApplications: d.recentApplications ?? [],
          upcomingInterviews: d.upcomingInterviews ?? [],
          upcomingFollowUps: [...(d.followUpsDueToday ?? []), ...(d.overdueFollowUpsList ?? [])],
        });
      })
      .catch(() => toast.error("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-20 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const displayName = user?.name || user?.email?.split("@")[0] || "there";

  const stats = [
    { label: "Total Applications", value: data.totalApplications, gradient: "stat-gradient-1", icon: "briefcase" },
    { label: "Pending", value: data.pendingCount, gradient: "stat-gradient-2", icon: "clock" },
    { label: "Interviews", value: data.interviewCount, gradient: "stat-gradient-3", icon: "calendar" },
    { label: "Offers", value: data.offerCount, gradient: "stat-gradient-4", icon: "check-circle" },
  ];

  const statIcons = {
    briefcase: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-current opacity-40">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
    clock: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-current opacity-40">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    calendar: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-current opacity-40">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    "check-circle": (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-current opacity-40">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {displayName}</h1>
          <p className="page-subtitle">{today}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.gradient} rounded-2xl p-5 relative overflow-hidden animate-slide-up`}
          >
            <div className="absolute top-4 right-4 text-current">
              {statIcons[stat.icon]}
            </div>
            <p className="text-3xl font-bold text-primary">{stat.value}</p>
            <p className="text-sm text-muted mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Main Content: Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Applications (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-color">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-primary">Recent Applications</h2>
                <Link
                  to="/applications"
                  className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  View all →
                </Link>
              </div>
            </div>
            <div className="p-2">
              {data.recentApplications.length === 0 ? (
                <div className="empty-state py-8">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted mb-3 opacity-50">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  </svg>
                  <p className="text-sm text-muted">No applications yet</p>
                  <p className="text-xs text-muted mt-1">Start tracking your job applications</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {data.recentApplications.map((app) => (
                    <Link
                      key={app._id}
                      to={`/applications/${app._id}`}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-tertiary transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-tertiary flex items-center justify-center text-sm font-semibold text-accent shrink-0">
                          {(app.companyName || "C").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-primary truncate group-hover:text-accent transition-colors">
                            {app.jobTitle}
                          </p>
                          <p className="text-xs text-muted truncate">
                            {app.companyName || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={app.status} />
                        <span className="text-xs text-muted hidden sm:block">
                          {formatDate(app.createdAt)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interviews + Follow-ups (1/3 width) */}
        <div className="space-y-4">
          {/* Gmail Connection */}
          <GmailConnect />

          {/* Upcoming Interviews */}
          <div className="card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-color">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-primary">Upcoming Interviews</h2>
                <Link
                  to="/interviews"
                  className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                >
                  View all →
                </Link>
              </div>
            </div>
            <div className="p-2">
              {data.upcomingInterviews.length === 0 ? (
                <div className="empty-state py-8">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted mb-3 opacity-50">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <p className="text-sm text-muted">No interviews scheduled</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {data.upcomingInterviews.map((interview) => (
                    <div
                      key={interview._id}
                      className="p-3 rounded-xl hover:bg-tertiary transition-colors"
                    >
                      <p className="font-medium text-primary text-sm truncate">
                        {interview.jobTitle}
                      </p>
                      <p className="text-xs text-muted truncate">{interview.companyName}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="badge badge-info text-[10px] py-0.5 px-2">
                          {formatDate(interview.date)}
                        </span>
                        {interview.time && (
                          <span className="text-xs text-muted">{interview.time}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Follow-ups */}
          <div className="card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-color">
              <h2 className="font-semibold text-primary">Follow-ups Due</h2>
            </div>
            <div className="p-2">
              {data.upcomingFollowUps.length === 0 ? (
                <div className="empty-state py-8">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted mb-3 opacity-50">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  <p className="text-sm text-muted">All caught up</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {data.upcomingFollowUps.map((followUp) => (
                    <div
                      key={followUp._id}
                      className="p-3 rounded-xl hover:bg-tertiary transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-primary text-sm truncate">
                            {followUp.jobTitle}
                          </p>
                          <p className="text-xs text-muted truncate">{followUp.companyName}</p>
                        </div>
                        <span className="badge badge-warning text-[10px] py-0.5 px-2 shrink-0">
                          {followUp.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-1.5">
                        Due {formatDate(followUp.dueDate)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
