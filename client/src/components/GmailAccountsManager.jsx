import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  addEmailAccount,
  deleteEmailAccount,
  listEmailAccounts,
  setDefaultEmailAccount,
  testEmailAccount,
  updateEmailAccount,
} from "../api/emailAccounts.js";
import {
  DEFAULT_TIMEZONE,
  QUICK_SCHEDULE_SLOTS,
  TIMEZONES,
  slotLabel,
  timezoneAbbreviation,
} from "../utils/datetime.js";
import { useAuth } from "../context/AuthContext.jsx";

const emptyForm = { address: "", appPassword: "", label: "" };

const isQuickSlot = (value) => QUICK_SCHEDULE_SLOTS.some((slot) => slot.value === value);

function StatusPill({ account }) {
  if (account.lastTestOk === true) {
    return <span className="badge badge-success text-[10px]">Verified</span>;
  }
  if (account.lastTestOk === false) {
    return <span className="badge badge-danger text-[10px]">Test failed</span>;
  }
  return <span className="badge text-[10px]">Not tested</span>;
}

export default function GmailAccountsManager() {
  const { refreshUser } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // { id, address, label, appPassword, schedule* }
  const [customTime, setCustomTime] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listEmailAccounts();
      setAccounts(data.accounts || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load Gmail accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await refreshUser?.();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setBusy("add");
    try {
      await addEmailAccount(form);
      toast.success("Gmail account added");
      setForm(emptyForm);
      setShowAdd(false);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add account");
    } finally {
      setBusy("");
    }
  };

  const handleTest = async (account) => {
    setBusy(account._id);
    try {
      await testEmailAccount(account._id);
      toast.success(`${account.address} is working`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Gmail test failed");
      await load();
    } finally {
      setBusy("");
    }
  };

  const handleDefault = async (account) => {
    setBusy(account._id);
    try {
      await setDefaultEmailAccount(account._id);
      toast.success("Default sender updated");
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update default sender");
    } finally {
      setBusy("");
    }
  };

  const handleToggle = async (account) => {
    setBusy(account._id);
    try {
      await updateEmailAccount(account._id, { enabled: !account.enabled });
      toast.success(account.enabled ? "Account disabled" : "Account enabled");
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update account");
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Remove ${account.address}? Emails already sent stay in your history.`)) return;
    setBusy(account._id);
    try {
      await deleteEmailAccount(account._id);
      toast.success("Gmail account removed");
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove account");
    } finally {
      setBusy("");
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(editing.id);
    try {
      const payload = {
        address: editing.address,
        label: editing.label,
        scheduleAction: editing.scheduleAction,
        scheduleTime: editing.scheduleTime,
        scheduleTimezone: editing.scheduleTimezone,
      };
      if (editing.appPassword?.trim()) payload.appPassword = editing.appPassword;
      await updateEmailAccount(editing.id, payload);
      toast.success("Account updated");
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update account");
    } finally {
      setBusy("");
    }
  };

  const openEdit = (account) => {
    setEditing({
      id: account._id,
      address: account.address,
      label: account.label,
      appPassword: "",
      scheduleAction: account.scheduleAction || "schedule",
      scheduleTime: account.scheduleTime || QUICK_SCHEDULE_SLOTS[0].value,
      scheduleTimezone: account.scheduleTimezone || DEFAULT_TIMEZONE,
    });
    setCustomTime(!isQuickSlot(account.scheduleTime));
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-primary">Gmail Accounts</h2>
            <p className="text-xs text-muted">
              Send from multiple addresses. App Passwords are encrypted and never shown again.
            </p>
          </div>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn btn-primary btn-sm shrink-0">
          {showAdd ? "Close" : "+ Add account"}
        </button>
      </div>

      <div className="rounded-xl bg-tertiary/60 p-3 text-[11px] text-muted leading-relaxed">
        Create a Gmail <strong>App Password</strong> at{" "}
        <a
          href="https://myaccount.google.com/apppasswords"
          target="_blank"
          rel="noreferrer"
          className="underline text-accent"
        >
          Google Account → Security → App passwords
        </a>
        . 2-Step Verification must be enabled. Never use your normal Gmail password.
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-color p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              required
              className="input"
              placeholder="you@gmail.com"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Label (e.g. Job hunt, Personal)"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          <input
            type="password"
            required
            autoComplete="new-password"
            className="input w-full"
            placeholder="16-character App Password"
            value={form.appPassword}
            onChange={(e) => setForm((f) => ({ ...f, appPassword: e.target.value }))}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy === "add"} className="btn btn-primary btn-sm">
              {busy === "add" ? "Adding…" : "Add Gmail account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setForm(emptyForm);
              }}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-color p-5 text-center text-sm text-muted">
          No Gmail account connected yet. Add one to start sending and scheduling emails.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account._id}
              className="rounded-xl border border-color p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-primary truncate">{account.address}</p>
                  {account.isDefault && <span className="badge badge-success text-[10px]">Default</span>}
                  {!account.enabled && <span className="badge badge-warning text-[10px]">Disabled</span>}
                  <StatusPill account={account} />
                </div>
                <p className="text-[11px] text-muted">
                  {account.label || "No label"}
                  {account.lastError ? ` · ${account.lastError.slice(0, 90)}` : ""}
                </p>
                <p className="text-[11px] text-muted mt-0.5">
                  {account.scheduleAction === "now" ? (
                    <span className="badge text-[10px]">Send now</span>
                  ) : (
                    <span className="badge text-[10px]">Schedules {slotLabel(account.scheduleTime)}</span>
                  )}{" "}
                  <span className="opacity-70">{account.scheduleTimezone || DEFAULT_TIMEZONE}</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <button
                  onClick={() => handleTest(account)}
                  disabled={busy === account._id}
                  className="btn btn-secondary text-xs px-2.5 py-1"
                >
                  {busy === account._id ? "…" : "Test"}
                </button>
                {!account.isDefault && account.enabled && (
                  <button onClick={() => handleDefault(account)} disabled={!!busy} className="btn btn-secondary text-xs px-2.5 py-1">
                    Set default
                  </button>
                )}
                <button onClick={() => handleToggle(account)} disabled={!!busy} className="btn btn-ghost text-xs px-2 py-1">
                  {account.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => openEdit(account)}
                  className="btn btn-ghost text-xs px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(account)}
                  disabled={!!busy}
                  className="btn btn-ghost text-xs px-2 py-1 text-danger hover:bg-danger-light"
                  title="Remove account"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form
            onSubmit={handleSaveEdit}
            className="modal-content p-5 space-y-4 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Edit Gmail account</h2>
              <button type="button" onClick={() => setEditing(null)} className="btn-icon" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="email"
              required
              className="input w-full"
              value={editing.address}
              onChange={(e) => setEditing((v) => ({ ...v, address: e.target.value }))}
            />
            <input
              className="input w-full"
              placeholder="Label"
              value={editing.label}
              onChange={(e) => setEditing((v) => ({ ...v, label: e.target.value }))}
            />
            <input
              type="password"
              autoComplete="new-password"
              className="input w-full"
              placeholder="New App Password (leave blank to keep current)"
              value={editing.appPassword}
              onChange={(e) => setEditing((v) => ({ ...v, appPassword: e.target.value }))}
            />

            {/* Independent scheduling preference for this sender */}
            <div className="rounded-xl border border-color p-3 space-y-2.5">
              <div>
                <p className="text-xs font-semibold text-primary">Scheduling preference</p>
                <p className="text-[11px] text-muted">
                  Applied automatically when this account is selected in the email composer.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditing((v) => ({ ...v, scheduleAction: "now" }))}
                  aria-pressed={editing.scheduleAction === "now"}
                  className={`rounded-xl border px-2 py-2 text-left transition ${
                    editing.scheduleAction === "now"
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                      : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-emerald-300"
                  }`}
                >
                  <span className="block text-xs font-bold">Send now</span>
                  <span className="block text-[10px] opacity-70">No scheduling</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditing((v) => ({ ...v, scheduleAction: "schedule" }))}
                  aria-pressed={editing.scheduleAction === "schedule"}
                  className={`rounded-xl border px-2 py-2 text-left transition ${
                    editing.scheduleAction === "schedule"
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                      : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
                  }`}
                >
                  <span className="block text-xs font-bold">Schedule</span>
                  <span className="block text-[10px] opacity-70">Use a default time</span>
                </button>
              </div>

              {editing.scheduleAction === "schedule" && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {QUICK_SCHEDULE_SLOTS.map((slot) => {
                      const active = !customTime && editing.scheduleTime === slot.value;
                      return (
                        <button
                          key={slot.value}
                          type="button"
                          onClick={() => {
                            setCustomTime(false);
                            setEditing((v) => ({ ...v, scheduleTime: slot.value }));
                          }}
                          className={`rounded-lg border px-1.5 py-1.5 text-[11px] font-semibold transition ${
                            active
                              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                              : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
                          }`}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setCustomTime(true)}
                      className={`rounded-lg border px-1.5 py-1.5 text-[11px] font-semibold transition ${
                        customTime
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                          : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {(customTime || !isQuickSlot(editing.scheduleTime)) && (
                    <input
                      type="time"
                      className="input w-full text-sm"
                      value={editing.scheduleTime}
                      onChange={(e) => setEditing((v) => ({ ...v, scheduleTime: e.target.value }))}
                    />
                  )}

                  <div>
                    <label className="text-[11px] text-muted block mb-1">Timezone</label>
                    <select
                      className="input w-full text-sm"
                      value={editing.scheduleTimezone}
                      onChange={(e) => setEditing((v) => ({ ...v, scheduleTimezone: e.target.value }))}
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[11px] text-muted">
                    Default: <strong>{slotLabel(editing.scheduleTime) || editing.scheduleTime}</strong>{" "}
                    {timezoneAbbreviation(editing.scheduleTimezone)} · {editing.scheduleTimezone}
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button type="submit" disabled={busy === editing.id} className="btn btn-primary btn-sm">
                {busy === editing.id ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
