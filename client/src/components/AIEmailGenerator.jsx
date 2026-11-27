import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getResumeMatch } from "../api/applications.js";
import { autoSendApplicationEmail, autoSendMultiAccount, draftApplicationEmail } from "../api/emails.js";
import { createScheduledEmail } from "../api/scheduledEmails.js";
import { listEmailAccounts } from "../api/emailAccounts.js";
import {
  DEFAULT_TIMEZONE,
  QUICK_SCHEDULE_SLOTS,
  formatInTimezone,
  slotLabel,
  upcomingSlotInputs,
  zonedTimeToUtc,
} from "../utils/datetime.js";
import ScheduleTimePicker from "./ScheduleTimePicker.jsx";
import { useGmailGuard } from "../context/GmailContext.jsx";

const noMatchMessage = (match) => {
  if (!match) return "Could not check your resumes.";
  switch (match.reason) {
    case "no_resumes":
      return "You have not uploaded any resume yet. Upload a resume and add role notes first.";
    case "no_resume_notes":
      return "None of your resumes has role notes, so no resume can be matched to this job.";
    case "missing_job_title":
      return "This application has no job title, so a resume cannot be matched.";
    case "no_matching_resume":
    default:
      return `No resume note matches the job title “${match.jobTitle || ""}”.`;
  }
};

export default function AIEmailGenerator({ application, onSent, onScheduled }) {
  const { requireGmail } = useGmailGuard();
  const [match, setMatch] = useState(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [draft, setDraft] = useState(null); // { subject, body, resume, recipient, recipientName }
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("now"); // now | schedule
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [schedule, setSchedule] = useState(() =>
    upcomingSlotInputs(QUICK_SCHEDULE_SLOTS[0].value, DEFAULT_TIMEZONE)
  );
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showResumePicker, setShowResumePicker] = useState(false);
  const [manualResumeId, setManualResumeId] = useState("");
  const appliedAccountRef = useRef(null);

  const loadMatch = useCallback(async () => {
    setMatchLoading(true);
    try {
      const data = await getResumeMatch(application._id);
      setMatch(data);
    } catch {
      setMatch(null);
    } finally {
      setMatchLoading(false);
    }
  }, [application._id]);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await listEmailAccounts();
      const list = data.accounts || [];
      setAccounts(list);
      console.log("[AIEmailGenerator] Loaded accounts:", list.map((a) => `${a.address} (enabled=${a.enabled}, connected=${a.connected})`).join(", "));
      setAccountId((prev) => {
        // Always hold the id string — never the account object.
        const prevId = typeof prev === "string" ? prev : prev?._id || "";
        if (prevId && list.some((a) => a._id === prevId)) return prevId;
        const pick =
          list.find((a) => a.isDefault && a.enabled) ||
          list.find((a) => a.enabled) ||
          list[0];
        return pick?._id || "";
      });
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatch();
    loadAccounts();
  }, [loadMatch, loadAccounts]);

  const matched = !!match?.matched;
  const alreadySent = !!(match?.emailAlreadySent || draft?.emailAlreadySent);
  const hasRecipient = draft
    ? draft.hasRecipient !== false && (!!draft.recipient || !!draft.recipientName || match?.hasRecipient !== false)
    : match
      ? match.hasRecipient !== false
      : true;
  // Only accounts that are enabled and have an App Password can send.
  const enabledAccounts = useMemo(
    () => accounts.filter((a) => a.enabled !== false && a.connected),
    [accounts]
  );
  const selectedAccount = enabledAccounts.find((a) => a._id === accountId) || null;

  // Debug: log account status
  useEffect(() => {
    if (accounts.length > 0) {
      console.log("[AIEmailGenerator] Accounts:", accounts.map((a) => `${a.address} enabled=${a.enabled} connected=${a.connected}`).join(", "));
      console.log("[AIEmailGenerator] Enabled accounts:", enabledAccounts.length);
    }
  }, [accounts, enabledAccounts]);

  // Explain any account that was not scheduled (disabled / no App Password /
  // set to Send Now) so the outcome is never silent.
  const reportScheduleOutcome = (data) => {
    if (!data) return;
    const blocked = (data.scheduleSkipped || []).filter((s) =>
      /disabled|password/i.test(s.reason || "")
    );
    if (blocked.length) {
      toast(
        `Not scheduled: ${blocked
          .map((s) => `${s.accountEmail} (${s.reason})`)
          .join(", ")}`,
        { icon: "⚠️" }
      );
    }
    if (data.scheduleErrors?.length) {
      toast(
        `Could not schedule from ${data.scheduleErrors
          .map((e) => e.accountEmail)
          .join(", ")}: ${data.scheduleErrors[0].message}`,
        { icon: "⚠️" }
      );
    }
  };

  // Each Gmail account can carry its own scheduling preference. Apply it when
  // the user switches sender — not on first load, so the composer keeps its
  // previous Send Now default for existing accounts.
  useEffect(() => {
    if (!selectedAccount) return;
    if (appliedAccountRef.current === null) {
      appliedAccountRef.current = selectedAccount._id;
      return;
    }
    if (appliedAccountRef.current === selectedAccount._id) return;
    appliedAccountRef.current = selectedAccount._id;

    setMode(selectedAccount.scheduleAction === "now" ? "now" : "schedule");
    const accountTimezone = selectedAccount.scheduleTimezone || DEFAULT_TIMEZONE;
    const accountTime = selectedAccount.scheduleTime || QUICK_SCHEDULE_SLOTS[0].value;
    setTimezone(accountTimezone);
    setSchedule(upcomingSlotInputs(accountTime, accountTimezone));
  }, [selectedAccount]);

  const resetPreview = () => {
    setDraft(null);
    setError(null);
    setResult(null);
  };

  const generate = async () => {
    if (generating) return;
    if (match && !match.matched && !manualResumeId) {
      setShowResumePicker(true);
      return;
    }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const data = await draftApplicationEmail(application._id, {
        ...(manualResumeId ? { manualResumeId } : {}),
      });
      setDraft({
        subject: data.draft?.subject || "",
        body: data.draft?.body || "",
        resume: data.resume,
        recipient: data.recipient,
        recipientName: data.recipientName,
        contactId: data.contactId || null,
        hasRecipient: data.hasRecipient,
        emailAlreadySent: data.emailAlreadySent,
        experienceMatch: data.experienceMatch,
      });
      toast.success("AI draft ready — review and edit before sending");
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data || {};
      setError(data.message || "Failed to generate the draft");
      if (status === 422) {
        setMatch((prev) => ({
          ...(prev || {}),
          matched: false,
          reason: data.reason,
          jobTitle: data.jobTitle || prev?.jobTitle,
          resumes: data.resumes || prev?.resumes || [],
        }));
      }
      toast.error(data.message || "Failed to generate the draft");
    } finally {
      setGenerating(false);
    }
  };

  const buildScheduleIso = () => {
    const utcDate = zonedTimeToUtc(schedule.date, schedule.time, timezone);
    if (!utcDate) {
      toast.error("Choose a valid date and time");
      return null;
    }
    if (utcDate.getTime() < Date.now() - 60 * 1000) {
      toast.error("Scheduled time must be in the future");
      return null;
    }
    return utcDate.toISOString();
  };

  const sendNow = async () => {
    if (!draft || sending) return;
    if (!requireGmail()) return;
    if (!draft.subject.trim() || !draft.body.trim()) {
      return toast.error("Subject and message are required");
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const data = await autoSendApplicationEmail(application._id, {
        subject: draft.subject,
        body: draft.body,
        accountId: accountId || undefined,
        mode: "send",
        scheduleOtherAccounts: enabledAccounts.length > 1,
        ...(manualResumeId ? { manualResumeId } : {}),
      });
      const sent = (data.results || []).find((r) => r.status === "sent");
      if (sent) {
        setResult({ type: "sent", subject: draft.subject, recipient: sent.email, sender: selectedAccount?.address });
        const extra = data.scheduledOther?.length
          ? ` + ${data.scheduledOther.length} scheduled from other account(s)`
          : "";
        toast.success(`Email sent successfully${extra}`);
        reportScheduleOutcome(data);
        onSent?.();
        loadMatch();
      } else {
        const failed = (data.results || []).find((r) => r.status === "failed");
        setError(failed?.error || "Email could not be sent. Check Email History for details.");
        toast.error("Send failed — check Email History for details");
      }
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.message || "Failed to send email");
      toast.error(data.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const scheduleEmail = async () => {
    if (!draft || sending) return;
    if (!draft.subject.trim() || !draft.body.trim()) {
      return toast.error("Subject and message are required");
    }
    if (!accountId) return toast.error("Add and select a Gmail account first");
    const scheduledAt = buildScheduleIso();
    if (!scheduledAt) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const data = await createScheduledEmail({
        applicationId: application._id,
        accountId,
        recipientEmail: draft.recipient,
        recipientName: draft.recipientName,
        subject: draft.subject,
        body: draft.body,
        resumeId: draft.resume?._id,
        scheduledAt,
        timezone,
        emailType: "Job Application",
        isAiGenerated: true,
      });
      setResult({
        type: "scheduled",
        subject: draft.subject,
        recipient: data.email?.recipient,
        sender: data.email?.senderAccount,
        scheduledAt: data.email?.scheduledAt,
        timezone: data.email?.timezone,
      });
      toast.success("Email scheduled");
      onScheduled?.();
      loadMatch();
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.message || "Failed to schedule email");
      toast.error(data.message || "Failed to schedule email");
    } finally {
      setSending(false);
    }
  };

  // Legacy one-click flow is preserved for users who do not want the preview.
  const quickSend = async () => {
    if (sending) return;
    if (match && !match.hasRecipient) {
      return toast.error("Add an HR email or link a contact on this application first.");
    }
    if (!requireGmail()) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const data = await autoSendApplicationEmail(application._id, {
        accountId: accountId || undefined,
        scheduleOtherAccounts: enabledAccounts.length > 1,
        ...(manualResumeId ? { manualResumeId } : {}),
      });
      const sent = (data.results || []).find((r) => r.status === "sent");
      if (sent) {
        setResult({ type: "sent", subject: data.draft?.subject, recipient: sent.email, sender: selectedAccount?.address });
        const extra = data.scheduledOther?.length
          ? ` ${data.scheduledOther.length} more scheduled from your other account(s).`
          : "";
        toast.success(
          data.aiFallback
            ? `Email sent (standard template used because AI was slow).${extra}`
            : `Email sent successfully.${extra}`
        );
        reportScheduleOutcome(data);
        onSent?.();
        loadMatch();
      } else {
        const failed = (data.results || []).find((r) => r.status === "failed");
        setError(failed?.error || "Email could not be sent. Check Email History for details.");
        toast.error("Send failed — check Email History for details");
      }
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.message || "Failed to send email");
      toast.error(data.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  // Multi-account: primary sends now, others schedule per their prefs
  const sendFromAllAccounts = async () => {
    if (sending) return;
    if (match && !match.hasRecipient) {
      return toast.error("Add an HR email or link a contact on this application first.");
    }
    if (!requireGmail()) return;
    if (!enabledAccounts.length || enabledAccounts.length < 2) {
      return toast.error("Add at least 2 enabled Gmail accounts to use multi-account send");
    }
    if (!draft) {
      return toast.error("Generate a draft first");
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const data = await autoSendMultiAccount(application._id, {
        ...(manualResumeId ? { manualResumeId } : {}),
      });
      if (data.sentNow) {
        let msg = `Email sent from ${data.defaultAccount}`;
        if (data.scheduled?.length) {
          msg += ` + ${data.scheduled.length} scheduled for other account(s)`;
        }
        if (data.aiFallback) {
          msg += " (AI was slow, template used)";
        }
        setResult({ type: "sent", subject: data.draft?.subject, recipient: draft.recipient, sender: data.defaultAccount });
        toast.success(msg);
        if (!data.scheduled?.length && data.scheduleSkipped?.length) {
          toast(
            `${data.scheduleSkipped.map((s) => s.accountEmail).join(", ")} set to Send Now, so no scheduled copy was created for them.`,
            { icon: "⏱️" }
          );
        }
        reportScheduleOutcome(data);
        onSent?.();
        loadMatch();
      } else if (data.scheduled?.length) {
        toast.success(`${data.scheduled.length} email(s) scheduled for other accounts.`);
      } else {
        toast.error("No emails sent or scheduled");
      }
    } catch (err) {
      const data = err.response?.data || {};
      setError(data.message || "Failed to send from all accounts");
      toast.error(data.message || "Failed to send from all accounts");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a1.117 1.117 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          AI Email Assistant
        </h2>
        {alreadySent && <span className="badge badge-primary text-xs">Email sent</span>}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Matches this job title + experience against your resumes, drafts the email with AI, then lets you
        choose a sender account and send now or schedule it.
      </p>

      {/* Resume match preview */}
      {matchLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="inline-block animate-spin w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full" />
          Checking your resumes…
        </div>
      ) : matched ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-3">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Matched resume
          </p>
          <p className="text-sm text-emerald-900 dark:text-emerald-200 mt-0.5 break-words">
            {match.resume?.originalName || "Resume"}
          </p>
          {match.resume?.notes && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Notes: {match.resume.notes}</p>
          )}
          {(match.resume?.experienceMin != null || match.resume?.experienceMax != null) && (
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-500 mt-0.5">
              Resume experience: {match.resume.experienceMin ?? "?"}–{match.resume.experienceMax ?? "?"} yrs
              {application.experienceRequired ? ` · Job requires: ${application.experienceRequired}` : ""}
            </p>
          )}
          {!!match.matchedTerms?.length && (
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-500 mt-0.5">
              Matched on: {match.matchedTerms.join(", ")}
            </p>
          )}
        </div>
      ) : match ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No resume matched — email will not be sent</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-400">{noMatchMessage(match)}</p>
          {!!match?.resumes?.length && (
            <ul className="text-xs text-amber-800/80 dark:text-amber-500 space-y-0.5">
              {match.resumes.map((r) => (
                <li key={r._id} className="break-words">
                  • {r.originalName}: {r.notes ? r.notes : "no role notes"}
                  {r.experienceMatch === "match" ? " ✓ experience" : ""}
                </li>
              ))}
            </ul>
          )}
          <Link to="/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 dark:text-amber-300 underline underline-offset-2">
            Update resume notes & experience
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-gray-600 dark:text-gray-400">
          Could not check resume notes right now. You can still try sending; the server will validate the match.
        </div>
      )}

      {!matchLoading && match && !hasRecipient && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400">
          This application has no recruiter email. Add an HR email first.
        </div>
      )}

      {alreadySent && !result && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-gray-600 dark:text-gray-400">
          An email was already sent for this application
          {match?.alreadySentAt ? ` on ${new Date(match.alreadySentAt).toLocaleString()}` : ""}. Duplicate sends are blocked.
        </div>
      )}

      {/* Sender account */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 block mb-1">Send from</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input w-full text-sm"
            disabled={!enabledAccounts.length}
          >
            {enabledAccounts.length === 0 && <option value="">No enabled Gmail account</option>}
            {enabledAccounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.address}{a.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
          {!enabledAccounts.length && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              <Link to="/ai-settings" className="underline">Add a Gmail account</Link> to send emails.
            </p>
          )}
          {selectedAccount && (
            <p className="text-[11px] text-muted mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="badge text-[10px]">Account preference</span>
              {selectedAccount.scheduleAction === "now"
                ? "Send now"
                : `Schedule at ${slotLabel(selectedAccount.scheduleTime)}`}
              <span className="opacity-70">· {selectedAccount.scheduleTimezone || DEFAULT_TIMEZONE}</span>
            </p>
          )}
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 block mb-1">Send option</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("now")}
              aria-pressed={mode === "now"}
              className={`rounded-xl border px-2 py-2 text-left transition ${
                mode === "now"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-sm"
                  : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-emerald-300"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send now
              </span>
              <span className="block text-[10px] opacity-70 mt-0.5">Immediately</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("schedule")}
              aria-pressed={mode === "schedule"}
              className={`rounded-xl border px-2 py-2 text-left transition ${
                mode === "schedule"
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm"
                  : "border-color bg-white dark:bg-gray-900 text-secondary hover:border-brand-300"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule
              </span>
              <span className="block text-[10px] opacity-70 mt-0.5">Pick date & time</span>
            </button>
          </div>
        </div>
      </div>

      {mode === "schedule" && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-900/60 bg-brand-50/40 dark:bg-brand-950/20 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-brand-800 dark:text-brand-300">When should it go out?</p>
            <span className="badge badge-primary text-[10px]">Defaults to IST</span>
          </div>
          <ScheduleTimePicker
            date={schedule.date}
            time={schedule.time}
            timezone={timezone}
            onChange={(next) => {
              setSchedule({ date: next.date, time: next.time });
              setTimezone(next.timezone);
            }}
          />
        </div>
      )}

      {/* Preview / edit */}
      {draft ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Preview & edit</p>
            <button type="button" onClick={resetPreview} className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline">
              Discard
            </button>
          </div>
          <input
            className="input w-full text-sm"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            placeholder="Subject"
          />
          <textarea
            rows={9}
            className="input w-full text-sm font-normal"
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="Email body"
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            To: {draft.recipient || "—"} · Resume: {draft.resume?.originalName || "none"}
            {draft.experienceMatch === "match" ? " · experience matches" : ""}
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating || matchLoading || (match ? !matched || !hasRecipient : false)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
          >
            {generating ? (
              <>
                <span className="inline-block animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                Generating draft…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a1.117 1.117 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Generate AI Draft
              </>
            )}
          </button>
          <button
            type="button"
            onClick={quickSend}
            disabled={sending || matchLoading || accountsLoading || !enabledAccounts.length || (match ? !matched || alreadySent || !hasRecipient : false)}
            className="px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={accountsLoading ? "Loading Gmail accounts..." : !enabledAccounts.length ? "No enabled Gmail account" : "Skip the preview and send immediately"}
          >
            {sending ? "Sending…" : accountsLoading ? "Loading…" : "Quick send"}
          </button>
        </div>
      )}

      {draft && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={mode === "schedule" ? scheduleEmail : sendNow}
            disabled={sending || accountsLoading || !enabledAccounts.length || alreadySent || !hasRecipient || !selectedAccount || !!result}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all ${
              mode === "schedule" ? "bg-brand-600 hover:bg-brand-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {sending ? (
              <>
                <span className="inline-block animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                {mode === "schedule" ? "Scheduling…" : "Sending…"}
              </>
            ) : mode === "schedule" ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Schedule Email
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send Now
              </>
            )}
          </button>
          <button type="button" onClick={generate} disabled={generating || sending} className="btn btn-secondary text-sm px-4">
            {generating ? "Regenerating…" : "Regenerate"}
          </button>
          {enabledAccounts.length >= 2 && (
            <button
              type="button"
              onClick={sendFromAllAccounts}
              disabled={sending || alreadySent || !hasRecipient || !draft}
              className="btn btn-warning text-sm px-4"
              title="Primary sends now, others schedule per their preferences"
            >
              {sending ? (
                <>
                  <span className="inline-block animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2" />
                  Sending from all…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Send from all accounts
                </>
              )}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result?.type === "sent" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Email sent successfully</p>
          {result.subject && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">Subject: {result.subject}</p>}
          {result.recipient && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">To: {result.recipient}</p>}
          {result.sender && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">From: {result.sender}</p>}
        </div>
      )}

      {result?.type === "scheduled" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Email scheduled</p>
          {result.recipient && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">To: {result.recipient}</p>}
          {result.sender && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">From: {result.sender}</p>}
          {result.scheduledAt && (
            <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">
              At: {formatInTimezone(result.scheduledAt, result.timezone || timezone)}
            </p>
          )}
          <Link to="/scheduled" className="inline-block text-xs font-semibold text-emerald-900 dark:text-emerald-300 underline underline-offset-2">
            Open Scheduled Emails →
          </Link>
        </div>
      )}
      {showResumePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-primary mb-4">Select a Resume</h3>
            <p className="text-sm text-muted mb-4">
              No resume automatically matched this job title. Choose a resume to use for this email.
            </p>
            <div className="space-y-2 mb-4">
              {(match?.resumes || []).map((r) => (
                <label key={r._id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  manualResumeId === r._id
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                    : "border-color hover:border-brand-300"
                }`}>
                  <input
                    type="radio"
                    name="manualResume"
                    value={r._id}
                    checked={manualResumeId === r._id}
                    onChange={() => setManualResumeId(r._id)}
                    className="accent-brand-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{r.originalName}</p>
                    {r.notes && (
                      <p className="text-xs text-muted truncate">Notes: {r.notes}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResumePicker(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (manualResumeId) {
                    setShowResumePicker(false);
                    generate();
                  } else {
                    toast.error("Please select a resume");
                  }
                }}
                className="btn btn-primary btn-sm"
              >
                Use this resume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
