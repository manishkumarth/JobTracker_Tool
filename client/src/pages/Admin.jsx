import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listUsers, disableUser, enableUser, deleteUser, runAutoFollowUp } from "../api/admin.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [running, setRunning] = useState(false);

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

  const handleRunFollowUps = async () => {
    setRunning(true);
    try {
      const r = await runAutoFollowUp();
      toast.success(`Follow-ups sent: ${r.sent} (skipped ${r.skipped})`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to run");
    } finally {
      setRunning(false);
    }
  };

  if (!user?.isAdmin) {
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
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Admin Access</h1>
          <p className="page-subtitle">Manage users, disable accounts, and run auto follow-ups.</p>
        </div>
        <button onClick={handleRunFollowUps} disabled={running} className="btn btn-primary btn-sm">
          {running ? "Running..." : "Run auto follow-ups now"}
        </button>
      </div>

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
            {users.map((u) => (
              <div key={u._id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-primary truncate">{u.name || "Unnamed"}</p>
                    {u.isAdmin && <span className="badge badge-primary text-[10px]">Admin</span>}
                    {u.isDisabled && <span className="badge badge-danger text-[10px]">Disabled</span>}
                    {u.gmailConnected && <span className="badge badge-success text-[10px]">Gmail</span>}
                  </div>
                  <p className="text-xs text-muted truncate">{u.email}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {u.applications} applications &middot; {u.resumes} resumes &middot; joined{" "}
                    {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {!u.isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
