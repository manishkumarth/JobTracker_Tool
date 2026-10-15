import { useEffect, useState } from "react";
import { getAppVideo } from "../api/admin.js";

const STEPS = [
  {
    title: "Turn on 2-Step Verification",
    text: "Open your Google Account → Security. Under \"Signing in to Google\" enable 2-Step Verification. This is required — the App Password option will not appear until 2FA is on.",
  },
  {
    title: "Go to App passwords",
    text: "Still under Security → Signing in to Google, click \"App passwords\". You may be asked to sign in again.",
  },
  {
    title: "Create a password for \"Mail\"",
    text: "In \"App name\" type something like \"JobTrackr\" and click Create. Google shows a 16-character password (it may include spaces).",
  },
  {
    title: "Copy it here",
    text: "Copy that 16-character password into the form on this page and click Connect Gmail. Do not use your normal Gmail password — it will be rejected.",
  },
];

/**
 * Modal shown when the user tries to send an email or follow-up but Gmail
 * isn't connected. Explains how to create a Gmail App Password and can embed
 * an admin-configured YouTube video.
 */
export default function GmailSetupPopup({ onClose, onConnected }) {
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    getAppVideo()
      .then((d) => setVideoUrl(d.url || ""))
      .catch(() => {});
  }, []);

  const goToConfig = () => {
    onClose?.();
    onConnected?.();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-6 space-y-5 max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-primary">Connect Gmail to send</h2>
              <p className="text-xs text-muted mt-0.5">You need a Gmail App Password before you can send emails.</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-tertiary/40 rounded-xl p-4 text-sm text-secondary leading-relaxed">
          To send email you need to connect a <strong>Gmail App Password</strong>{" "}
          (Google Account → Security → 2-Step Verification → App passwords).
        </div>

        {videoUrl && (
          <div className="rounded-xl overflow-hidden border border-color bg-black aspect-video">
            <iframe
              className="w-full h-full"
              src={videoUrl}
              title="How to create a Gmail App Password"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <ol className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
          {STEPS.map((s) => (
            <li key={s.title} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
                {STEPS.indexOf(s) + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-primary">{s.title}</p>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2 pt-2 border-t border-color">
          <button onClick={goToConfig} className="btn btn-primary btn-sm flex-1">
            Open Config to connect Gmail
          </button>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
