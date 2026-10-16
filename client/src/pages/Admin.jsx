import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  listUsers,
  disableUser,
  enableUser,
  deleteUser,
  setUserFeature,
  disableAllFeatures,
  enableAllFeatures,
  getAppVideo,
  saveAppVideo,
  getUserLogs,
} from "../api/admin.js";
import { useAuth } from "../context/AuthContext.jsx";
import { isAdminUser } from "../constants.js";

const FEATURES = [
  { key: "sendEmail", label: "Send Email" },
  { key: "aiEmail", label: "AI Email" },
  { key: "autoFollowUp", label: "Auto Follow-up" },
  { key: "resumeUpload", label: "Resume Upload" },
  { key: "quickFill", label: "Quick Fill" },
];

function VideoSetting() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppVideo()
      .then((d) => setUrl(d.url || ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const d = await saveAppVideo(url);
      setUrl(d.url);
      toast.success(d.url ? "Video saved" : "Video removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save video URL");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary">Gmail setup video</h2>
          <p className="text-xs text-muted">
            YouTube video shown to users in the &quot;Connect Gmail&quot; popup — how to create a Gmail App Password.
            Leave empty to remove it.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button onClick={save} disabled={busy || loading} className="btn btn-primary btn-sm shrink-0">
          {busy ? "Saving..." : "Save video"}
        </button>
      </div>

      {url && (
        <div className="rounded-xl overflow-hidden border border-color bg-black aspect-video max-w-md">
          <iframe
            className="w-full h-full"
            src={url}
            title="Gmail App Password guide"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

const LOG_TYPE_BADGE = {
  login: "badge badge-success",
  logout: "badge badge-neutral",
  activity: "badge badge-primary",
};

const LOG_TYPES = [
  { key: "all", label: "All" },
  { key: "login", label: "Logins" },
  { key: "logout", label: "Logouts" },
  { key: "activity", label: "Activities" },
];

function UserLogsSection() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      getUserLogs({ type, search, page, limit: 50 })
        .then((d) => {
          setLogs(d.logs || []);
          setTotal(d.total || 0);
          setPages(d.pages || 1);
        })
        .catch(() => toast.error("Failed to load user logs"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [type, search, page]);

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-color flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {LOG_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setType(t.key);
                setPage(1);
              }}
              className={`btn btn-sm ${type === t.key ? "btn-primary" : "btn-secondary"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="input sm:ml-auto sm:w-64"
          placeholder="Search user or action..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted">No logs found.</div>
      ) : (
        <>
          <div className="divide-y divide-color">
            {logs.map((l) => (
              <div key={l._id} className="px-4 py-3 flex items-start gap-3">
                <span className={`${LOG_TYPE_BADGE[l.type] || "badge badge-neutral"} text-[10px] mt-0.5 capitalize shrink-0`}>
                  {l.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary break-words">{l.action || l.type}</p>
                  <p className="text-[11px] text-muted truncate mt-0.5">
                    {l.name || "Unnamed"} &middot; {l.email}
                    {l.ip ? ` \u00b7 ${l.ip}` : ""}
                    {l.location ? ` \u00b7 ${[l.location.city, l.location.region, l.location.country].filter(Boolean).join(", ")}` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-muted whitespace-nowrap shrink-0">
                  {new Date(l.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 px-4 border-t border-color flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              {total} entr{total === 1 ? "y" : "ies"} &middot; page {page} of {pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="btn btn-secondary btn-sm"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, pages))}
                disabled={page >= pages}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const load = () => {
    setLoading(true);
    listUsers()
      .then((d) => setUsers(d.users))
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const patchUser = (id, patch) =>
    setUsers((prev) => prev.map((u) => (u._id === id ? { ...u, ...patch } : u)));

  const handleDisable = async (u) => {
    const reason = window.prompt("Reason for disabling this account?") || "";
    setBusyId(u._id);
    try {
      await disableUser(u._id, reason);
      toast.success("User disabled");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to disable");
    } finally {
      setBusyId("");
    }
  };

  const handleEnable = async (u) => {
    setBusyId(u._id);
    try {
      await enableUser(u._id);
      toast.success("User enabled");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to enable");
    } finally {
      setBusyId("");
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Permanently delete ${u.email} and ALL their data? This cannot be undone.`)) return;
    setBusyId(u._id);
    try {
      await deleteUser(u._id);
      toast.success("User deleted");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete");
    } finally {
      setBusyId("");
    }
  };

  const handleFeature = async (u, feature, value) => {
    setBusyId(u._id);
    try {
      const d = await setUserFeature(u._id, feature, value);
      patchUser(u._id, { features: d.user.features, isDisabled: d.user.isDisabled });
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update feature");
    } finally {
      setBusyId("");
    }
  };

  const handleAllFeatures = async (u, enable) => {
    if (!enable && !window.confirm(`Turn OFF every feature for ${u.email}?`)) return;
    setBusyId(u._id);
    try {
      const d = enable ? await enableAllFeatures(u._id) : await disableAllFeatures(u._id);
      patchUser(u._id, { features: d.user.features, isDisabled: d.user.isDisabled });
      toast.success(enable ? "All features enabled" : "All features disabled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update features");
    } finally {
      setBusyId("");
    }
  };

  if (!isAdminUser(user)) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">You do not have admin access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Access</h1>
          <p className="page-subtitle">Manage users, their features and app settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("users")}
            className={`btn btn-sm ${tab === "users" ? "btn-primary" : "btn-secondary"}`}
          >
            Users
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`btn btn-sm ${tab === "logs" ? "btn-primary" : "btn-secondary"}`}
          >
            User Logs
          </button>
        </div>
      </div>

      {tab === "logs" ? (
        <UserLogsSection />
      ) : (
        <>
          <VideoSetting />

          <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">No users found.</div>
        ) : (
          <div className="divide-y divide-color">
            {users.map((u) => {
              const offCount = FEATURES.filter((f) => u.features?.[f.key] === false).length;
              return (
                <div key={u._id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-primary truncate">{u.name || "Unnamed"}</p>
                        {u.isAdmin && <span className="badge badge-primary text-[10px]">Admin</span>}
                        {u.isDisabled && <span className="badge badge-danger text-[10px]">Disabled</span>}
                        {!u.isDisabled && offCount > 0 && (
                          <span className="badge badge-warning text-[10px]">{offCount} feature{offCount > 1 ? "s" : ""} off</span>
                        )}
                        {u.gmailConnected && <span className="badge badge-success text-[10px]">Gmail</span>}
                      </div>
                      <p className="text-xs text-muted truncate">{u.email}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {u.applications} applications &middot; {u.resumes} resumes &middot; joined{" "}
                        {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {!u.isAdmin && (
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          onClick={() => setExpandedId(expandedId === u._id ? "" : u._id)}
                          className={`btn btn-sm ${expandedId === u._id ? "btn-primary" : "btn-secondary"}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                          </svg>
                          Features
                        </button>
                        {u.isDisabled ? (
                          <button
                            onClick={() => handleEnable(u)}
                            disabled={busyId === u._id}
                            className="btn btn-secondary btn-sm"
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDisable(u)}
                            disabled={busyId === u._id}
                            className="btn btn-warning btn-sm"
                          >
                            Disable
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={busyId === u._id}
                          className="btn btn-ghost btn-sm text-danger"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {!u.isAdmin && expandedId === u._id && (
                    <div className="mt-4 pt-4 border-t border-color space-y-4 animate-fade-in">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {FEATURES.map((f) => (
                          <label
                            key={f.key}
                            className="flex items-center gap-2 text-sm text-secondary cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded accent-brand-600"
                              checked={u.features?.[f.key] !== false}
                              disabled={busyId === u._id}
                              onChange={(e) => handleFeature(u, f.key, e.target.checked)}
                            />
                            {f.label}
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAllFeatures(u, false)}
                          disabled={busyId === u._id}
                          className="btn btn-warning btn-sm"
                        >
                          Disable all features
                        </button>
                        <button
                          onClick={() => handleAllFeatures(u, true)}
                          disabled={busyId === u._id}
                          className="btn btn-secondary btn-sm"
                        >
                          Enable all features
                        </button>
                      </div>
                      <p className="text-[11px] text-muted">
                        Disabling a feature blocks it instantly with a &quot;contact support&quot; popup for the user.
                        Everything stays available for the admin account.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </div>
        </>
      )}
    </div>
  );
}
