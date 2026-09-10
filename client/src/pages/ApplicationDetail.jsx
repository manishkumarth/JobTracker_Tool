import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getApplication, changeStatus, addNote, deleteApplication, APPLICATION_STATUSES } from "../api/applications.js";
import { createFollowUp } from "../api/followups.js";
import { createInterview } from "../api/interviews.js";
import { createCall } from "../api/calls.js";
import { generateFollowUpEmail } from "../api/ai.js";
import StatusBadge from "../components/StatusBadge.jsx";
import AIEmailGenerator from "../components/AIEmailGenerator.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const CALL_RESULTS = ["Connected", "No Answer", "Busy", "Callback Requested", "Wrong Number", "Not Interested", "Interested", "Asked to Email", "Interview Discussion", "Other"];
const INTERVIEW_TYPES = ["Phone", "Video", "Technical", "HR", "Managerial", "Assessment", "On-site"];
const ROUNDS = ["Round 1", "Round 2", "Round 3", "Final"];

const STATUS_DOT_COLORS = {
  saved: "bg-gray-400",
  applied: "bg-blue-500",
  screening: "bg-indigo-500",
  interview_scheduled: "bg-yellow-500",
  interview_completed: "bg-orange-500",
  offer: "bg-green-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  withdrawn: "bg-gray-500",
  ghosted: "bg-gray-400",
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({ date: "", type: "Email Follow-up", note: "" });
  const [interviewForm, setInterviewForm] = useState({ date: "", round: "Round 1", interviewType: "Video", meetingUrl: "", interviewer: "" });
  const [callForm, setCallForm] = useState({ result: "Connected", notes: "", durationMinutes: "" });
  const [genFollowUp, setGenFollowUp] = useState(null);
  const [genBusy, setGenBusy] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);

  const load = () => {
    getApplication(id).then(setApp).catch(() => toast.error("Failed to load application")).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">Loading application...</span>
        </div>
      </div>
    );
  }
  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Application not found.</p>
          <Link to="/applications" className="text-brand-600 hover:text-brand-700 text-sm font-medium">Back to applications</Link>
        </div>
      </div>
    );
  }

  const doStatusChange = async (status) => {
    try {
      const updated = await changeStatus(id, status);
      setApp(updated);
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const submitNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      const updated = await addNote(id, noteText.trim());
      setApp(updated);
      setNoteText("");
    } catch {
      toast.error("Failed to add note");
    }
  };

  const submitFollowUp = async (e) => {
    e.preventDefault();
    if (!followUpForm.date) return toast.error("Pick a date");
    try {
      await createFollowUp({ application: id, ...followUpForm });
      toast.success("Follow-up scheduled");
      setFollowUpForm({ date: "", type: "Email Follow-up", note: "" });
      load();
    } catch {
      toast.error("Failed to schedule follow-up");
    }
  };

  const submitInterview = async (e) => {
    e.preventDefault();
    if (!interviewForm.date) return toast.error("Pick a date/time");
    try {
      await createInterview({ application: id, ...interviewForm });
      toast.success("Interview scheduled");
      setInterviewForm({ date: "", round: "Round 1", interviewType: "Video", meetingUrl: "", interviewer: "" });
      load();
    } catch {
      toast.error("Failed to schedule interview");
    }
  };

  const submitCall = async (e) => {
    e.preventDefault();
    try {
      await createCall({
        application: id, contact: app.contact?._id, company: app.company?._id,
        callDate: new Date(), ...callForm, durationMinutes: Number(callForm.durationMinutes) || 0,
      });
      toast.success("Call logged");
      setCallForm({ result: "Connected", notes: "", durationMinutes: "" });
      load();
    } catch {
      toast.error("Failed to log call");
    }
  };

  const generateFollowUp = async () => {
    setGenBusy(true);
    try {
      const result = await generateFollowUpEmail(id);
      setGenFollowUp(result);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to generate follow-up");
    } finally {
      setGenBusy(false);
    }
  };

  const doDelete = async () => {
    try {
      await deleteApplication(id);
      toast.success("Application deleted");
      navigate("/applications");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/applications"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </Link>
            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700"></div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">{app.jobTitle}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{app.company?.name || app.companyName || "—"} · {app.location || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${STATUS_DOT_COLORS[app.status] || "bg-gray-400"}`}></span>
              <select
                value={app.status}
                onChange={(e) => doStatusChange(e.target.value)}
                className="appearance-none bg-gray-100 dark:bg-gray-800 border-0 rounded-xl pl-8 pr-8 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand-500/40 cursor-pointer"
              >
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                ))}
              </select>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-2 rounded-xl transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
            {/* Job Details Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Job Details
                </h2>
                {app.matchScore != null && (
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                    app.matchScore >= 80 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    app.matchScore >= 60 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {app.matchScore}% match
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "Source", value: app.jobSource },
                  { label: "Mode", value: app.workMode },
                  { label: "Type", value: app.employmentType },
                  { label: "Salary", value: app.salary },
                  { label: "Experience", value: app.experienceRequired },
                  { label: "Priority", value: app.priority },
                ].filter(f => f.value).map((field) => (
                  <div key={field.label}>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{field.label}</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{field.value}</p>
                  </div>
                ))}
              </div>

              {app.requiredSkills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {app.requiredSkills.map((s) => (
                    <span key={s} className="text-xs font-medium bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-lg">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {app.jobUrl && (
                <a
                  href={app.jobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-4 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Open job posting
                </a>
              )}

              {app.jobDescription && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    <svg className={`w-4 h-4 transition-transform ${descExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    {descExpanded ? "Hide" : "View"} job description
                  </button>
                  {descExpanded && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-3 leading-relaxed">{app.jobDescription}</p>
                  )}
                </div>
              )}
            </div>

            {/* HR / Recruiter Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                HR / Recruiter
              </h2>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">{app.hrName || "—"}</p>
              <div className="flex flex-wrap gap-2">
                {app.hrEmail && (
                  <a
                    href={`mailto:${app.hrEmail}`}
                    className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {app.hrEmail}
                  </a>
                )}
                {app.hrPhone && (
                  <a
                    href={`tel:${app.hrPhone}`}
                    className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {app.hrPhone}
                  </a>
                )}
                {app.hrEmail && (
                  <button
                    onClick={() => navigator.clipboard.writeText(app.hrEmail).then(() => toast.success("Email copied"))}
                    className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Copy email
                  </button>
                )}
                {app.hrPhone && (
                  <button
                    onClick={() => navigator.clipboard.writeText(app.hrPhone).then(() => toast.success("Phone copied"))}
                    className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Copy phone
                  </button>
                )}
              </div>
            </div>

            {/* Timeline Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Timeline
              </h2>
              {app.activity?.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No activity yet.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-800"></div>
                  <div className="space-y-4">
                    {[...app.activity].reverse().map((a, idx) => (
                      <div key={idx} className="relative flex gap-4">
                        <div className={`relative z-10 w-3.5 h-3.5 rounded-full mt-1 shrink-0 border-2 border-white dark:border-gray-900 ${
                          idx === 0 ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                        }`}></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white">{a.message}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(a.at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                onClick={() => setNotesExpanded(!notesExpanded)}
                className="w-full flex items-center justify-between p-6 text-left"
              >
                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Notes
                  {app.notes?.length > 0 && (
                    <span className="text-xs font-normal bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{app.notes.length}</span>
                  )}
                </h2>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${notesExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {notesExpanded && (
                <div className="px-6 pb-6 space-y-3">
                  {app.notes?.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No notes yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...app.notes].reverse().map((n) => (
                        <div key={n._id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{n.text}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={submitNote} className="flex gap-2 pt-2">
                    <input
                      placeholder="Add a note..."
                      className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <button className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all">
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* AI Follow-up Email Card */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Follow-up Email (AI)
                </h2>
                <button
                  onClick={generateFollowUp}
                  disabled={genBusy}
                  className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                >
                  {genBusy ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Generate
                    </>
                  )}
                </button>
              </div>
              {genFollowUp && (
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2">
                  <p className="font-medium text-sm text-gray-900 dark:text-white">{genFollowUp.subject}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{genFollowUp.body}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${genFollowUp.subject}\n\n${genFollowUp.body}`).then(() => toast.success("Copied — paste it into the AI email box above to send"))}
                    className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mt-2 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Copy text
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            <AIEmailGenerator application={app} onSent={load} />

            {/* Schedule Follow-up */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Schedule Follow-up
              </h2>
              <form onSubmit={submitFollowUp} className="space-y-3">
                <input
                  type="date"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={followUpForm.date}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, date: e.target.value })}
                />
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={followUpForm.type}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, type: e.target.value })}
                >
                  {["Email Follow-up", "Call Follow-up", "LinkedIn Follow-up", "Recruiter Follow-up", "Interview Follow-up", "General"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input
                  placeholder="Note (optional)"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={followUpForm.note}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, note: e.target.value })}
                />
                <button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  Schedule Follow-up
                </button>
              </form>
            </div>

            {/* Schedule Interview */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                Schedule Interview
              </h2>
              <form onSubmit={submitInterview} className="space-y-3">
                <input
                  type="datetime-local"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={interviewForm.date}
                  onChange={(e) => setInterviewForm({ ...interviewForm, date: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                    value={interviewForm.round}
                    onChange={(e) => setInterviewForm({ ...interviewForm, round: e.target.value })}
                  >
                    {ROUNDS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <select
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                    value={interviewForm.interviewType}
                    onChange={(e) => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
                  >
                    {INTERVIEW_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <input
                  placeholder="Meeting URL"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={interviewForm.meetingUrl}
                  onChange={(e) => setInterviewForm({ ...interviewForm, meetingUrl: e.target.value })}
                />
                <input
                  placeholder="Interviewer"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={interviewForm.interviewer}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interviewer: e.target.value })}
                />
                <button className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  Schedule Interview
                </button>
              </form>
            </div>

            {/* Log Call */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Log a Call
              </h2>
              <form onSubmit={submitCall} className="space-y-3">
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={callForm.result}
                  onChange={(e) => setCallForm({ ...callForm, result: e.target.value })}
                >
                  {CALL_RESULTS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="Duration (minutes)"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  value={callForm.durationMinutes}
                  onChange={(e) => setCallForm({ ...callForm, durationMinutes: e.target.value })}
                />
                <textarea
                  placeholder="Notes"
                  rows={2}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all resize-none"
                  value={callForm.notes}
                  onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                />
                <button className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  Log Call
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showDelete && (
        <ConfirmDialog
          title="Delete this application?"
          message="This cannot be undone. Related follow-ups, interviews and calls will remain but lose their link to this application."
          danger
          confirmLabel="Delete"
          onCancel={() => setShowDelete(false)}
          onConfirm={doDelete}
        />
      )}
    </div>
  );
}
