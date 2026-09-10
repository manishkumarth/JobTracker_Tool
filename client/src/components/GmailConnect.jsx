import { useState } from "react";
import toast from "react-hot-toast";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function GmailConnect() {
  const { user, refreshUser } = useAuth();
  const [gmailAddress, setGmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await api.post("/auth/disconnect-gmail");
      toast.success("Gmail disconnected");
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to disconnect Gmail");
    } finally {
      setBusy(false);
    }
  };

  if (user?.gmailConnected) {
    return (
      <div className="card p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">Gmail Connected</p>
            <p className="text-xs text-muted mt-0.5 truncate">Sending from <strong>{user.gmailAddress}</strong></p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="btn btn-secondary text-xs px-3 py-1.5 shrink-0"
          >
            {busy ? "..." : "Disconnect"}
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/connect-gmail", { gmailAddress, appPassword });
      toast.success("Gmail connected");
      await refreshUser();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to connect Gmail");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-primary">Connect Gmail</p>
          <p className="text-xs text-muted">Send emails from your own address</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted">
          Use a Gmail <strong>App Password</strong> (Google Account → Security → 2‑Step Verification → App passwords). Your normal password will not work.
        </p>
        <input
          type="email"
          required
          placeholder="you@gmail.com"
          className="input w-full"
          value={gmailAddress}
          onChange={(e) => setGmailAddress(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="16-character app password"
          className="input w-full"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
        />
        <button
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "Connecting..." : "Connect Gmail"}
        </button>
      </form>
    </div>
  );
}
