import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getResumeMatch } from "../api/applications.js";
import { autoSendApplicationEmail } from "../api/emails.js";
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

export default function AIEmailGenerator({ application, onSent }) {
  const { requireGmail } = useGmailGuard();
  const [match, setMatch] = useState(null);
  const [matchLoading, setMatchLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  const autoSend = async () => {
    if (sending) return;
    if (match && !match.hasRecipient) {
      return toast.error("Add an HR email or link a contact on this application first.");
    }
    if (!requireGmail()) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const data = await autoSendApplicationEmail(application._id);
      const sent = (data.results || []).filter((r) => r.status === "sent").length;
      if (sent > 0) {
        setResult({
          subject: data.draft?.subject,
          recipient: data.results.find((r) => r.status === "sent")?.email,
          resume: data.resume,
        });
        toast.success(
          data.resume?.originalName
            ? `Email sent with ${data.resume.originalName}`
            : "Email sent successfully"
        );
        onSent?.();
        loadMatch();
      } else {
        const failed = (data.results || []).find((r) => r.status === "failed");
        setError(failed?.error || "Email could not be sent. Check Email History for details.");
        toast.error("Send failed — check Email History for details");
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data || {};
      setError(data.message || "Failed to send email");
      if (status === 422) {
        setMatch((prev) => ({
          ...(prev || {}),
          matched: false,
          reason: data.reason,
          jobTitle: data.jobTitle || prev?.jobTitle,
          resumes: data.resumes || prev?.resumes || [],
        }));
      }
      toast.error(data.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const matched = !!match?.matched;
  const alreadySent = !!match?.emailAlreadySent;
  const hasRecipient = match ? match.hasRecipient !== false : true;
  const disabled = sending || matchLoading || (match ? !matched || alreadySent || !hasRecipient : false);

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
        Matches this job title against your resume role notes, generates the email with AI and sends it
        with the matching resume attached.
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
                </li>
              ))}
            </ul>
          )}
          <Link to="/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 dark:text-amber-300 underline underline-offset-2">
            Update resume notes
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

      {alreadySent && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 text-xs text-gray-600 dark:text-gray-400">
          An email was already sent for this application
          {match?.alreadySentAt ? ` on ${new Date(match.alreadySentAt).toLocaleString()}` : ""}. Duplicate sends are blocked.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Email sent successfully</p>
          {result.subject && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">Subject: {result.subject}</p>}
          {result.recipient && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">To: {result.recipient}</p>}
          {result.resume?.originalName && <p className="text-xs text-emerald-800/90 dark:text-emerald-400 break-words">Attached: {result.resume.originalName}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={autoSend}
        disabled={disabled}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all"
      >
        {sending ? (
          <>
            <span className="inline-block animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            Matching resume, drafting &amp; sending…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Auto Draft &amp; Send Email
          </>
        )}
      </button>
    </div>
  );
}
