import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getProviders, saveProvider, deleteProvider, activateProvider, testProvider } from "../api/settings.js";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/axios.js";

const PROVIDER_ICONS = {
  openrouter: "🔀",
  openai: "🤖",
  anthropic: "🧠",
  gemini: "✨",
  groq: "⚡",
  deepseek: "🔍",
  together: "🤝",
};

function GmailSection() {
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
      toast.error(err.response?.data?.message || "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
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
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary">Gmail Connection</h2>
          <p className="text-xs text-muted">Send emails from your own address</p>
        </div>
      </div>

      {user?.gmailConnected ? (
        <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Connected</p>
              <p className="text-xs text-muted truncate">{user.gmailAddress}</p>
            </div>
          </div>
          <button onClick={handleDisconnect} disabled={busy} className="btn btn-secondary text-xs px-3 py-1.5">
            {busy ? "..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-muted">
            Use a Gmail <strong>App Password</strong> (Google Account → Security → 2‑Step Verification → App passwords).
          </p>
          <input type="email" required placeholder="you@gmail.com" className="input w-full" value={gmailAddress} onChange={(e) => setGmailAddress(e.target.value)} />
          <input type="password" required placeholder="16-character app password" className="input w-full" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} />
          <button disabled={busy} className="btn btn-primary w-full">
            {busy ? "Connecting..." : "Connect Gmail"}
          </button>
        </form>
      )}
    </div>
  );
}

function ProviderCard({ p, onSave, onDelete, onActivate, onTest }) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(p.defaultModel);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim() && !p.connected) return toast.error("Enter an API key first");
    await onSave({ provider: p.provider, apiKey: apiKey.trim(), model });
    setApiKey("");
  };

  const handleTest = async () => {
    if (!apiKey.trim()) return toast.error("Enter an API key to test");
    setTesting(true);
    try {
      await onTest(p.provider, apiKey.trim());
      toast.success(`${p.name} key is valid!`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`card p-5 space-y-4 transition-all ${p.active ? "ring-2 ring-accent" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-tertiary flex items-center justify-center text-xl shrink-0">
            {PROVIDER_ICONS[p.provider] || "🔧"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-primary">{p.name}</h3>
              {p.connected && (
                <span className="badge badge-success text-[10px]">
                  {p.active ? "Active" : "Connected"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              {p.connected ? `Model: ${p.model || p.defaultModel}` : "Not configured"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {p.connected && !p.active && (
            <button onClick={() => onActivate(p.provider)} className="btn btn-secondary text-xs px-2.5 py-1">
              Set active
            </button>
          )}
          {p.connected && (
            <button onClick={() => onDelete(p.provider)} className="btn btn-ghost text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Remove key">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Key input */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            placeholder={p.connected ? "•••••••••••••••• (key saved)" : `Enter ${p.name} API key`}
            className="input pr-10"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
          >
            {showKey ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            )}
          </button>
        </div>

        <select value={model} onChange={(e) => setModel(e.target.value)} className="input text-xs">
          {p.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!apiKey.trim() && !p.connected} className="btn btn-primary text-xs flex-1">
            {p.connected ? "Update Key" : "Save Key"}
          </button>
          <button onClick={handleTest} disabled={testing || !apiKey.trim()} className="btn btn-secondary text-xs">
            {testing ? "Testing..." : "Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiSettings() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getProviders()
      .then((d) => setProviders(d.providers))
      .catch(() => toast.error("Failed to load providers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async ({ provider, apiKey, model }) => {
    try {
      await saveProvider({ provider, apiKey, model });
      toast.success("Provider saved");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    }
  };

  const handleDelete = async (provider) => {
    try {
      await deleteProvider(provider);
      toast.success("Provider removed");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove");
    }
  };

  const handleActivate = async (provider) => {
    try {
      await activateProvider(provider);
      toast.success("Active provider updated");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to activate");
    }
  };

  const handleTest = async (provider, apiKey) => {
    await testProvider(provider, apiKey);
  };

  const activeProvider = providers.find((p) => p.active);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Config</h1>
          <p className="page-subtitle">
            Manage AI providers and Gmail connection
            {activeProvider && (
              <span className="ml-2 badge badge-success text-xs">Active: {activeProvider.name}</span>
            )}
          </p>
        </div>
      </div>

      {/* Gmail Section */}
      <GmailSection />

      {/* AI Providers */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-primary">AI Providers</h2>
          <span className="text-xs text-muted">Keys are encrypted and stored server-side</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-xl" />
                  <div className="space-y-2 flex-1"><div className="skeleton h-4 w-24 rounded" /><div className="skeleton h-3 w-32 rounded" /></div>
                </div>
                <div className="skeleton h-10 w-full rounded-lg" />
                <div className="skeleton h-8 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((p) => (
              <ProviderCard
                key={p.provider}
                p={p}
                onSave={handleSave}
                onDelete={handleDelete}
                onActivate={handleActivate}
                onTest={handleTest}
              />
            ))}
          </div>
        )}

        <div className="card p-4 bg-tertiary/50">
          <p className="text-xs text-muted">
            <strong>How it works:</strong> Add an API key for any provider above. Set one as <em>Active</em> —
            all AI features (email generation, LinkedIn parsing, follow-ups) will use that provider.
            If no key is configured, the app falls back to the server's built-in Gemini key.
            Keys are AES-256-GCM encrypted at rest and never sent to the frontend.
          </p>
        </div>
      </div>
    </div>
  );
}
