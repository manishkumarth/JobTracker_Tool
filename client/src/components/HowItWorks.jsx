import { useState, useEffect } from "react";

const ICONS = {
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
  doc: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  ),
  plug: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  ),
  send: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  ),
  clock: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  chart: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ),
};

const STEPS = [
  {
    title: "1. Set up your identity",
    text: "Add your Candidate Profile (skills, experience, projects) so the AI only ever claims what's true about you.",
    icon: "user",
  },
  {
    title: "2. Upload resumes",
    text: "Upload multiple resumes and tag each with the roles it fits (e.g. React Developer, Fullstack). The AI picks the right one automatically.",
    icon: "doc",
  },
  {
    title: "3. Connect Gmail + an AI provider",
    text: "Connect your Gmail app password and add any AI API key in Settings. Emails are sent from your own address.",
    icon: "plug",
  },
  {
    title: "4. Add an application",
    text: "Paste a LinkedIn job post and hit 'Extract with AI'. Optionally tick 'Auto' to generate, save and send in one click.",
    icon: "send",
  },
  {
    title: "5. Auto follow-ups",
    text: "After 3 days the app automatically sends a polite AI follow-up for applications awaiting a response.",
    icon: "clock",
  },
  {
    title: "6. Track everything",
    text: "Open rates, clicks, replies and follow-ups are all tracked in Email History.",
    icon: "chart",
  },
];

export default function HowItWorks({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const Trigger = ({ className = "btn btn-secondary btn-sm" }) => (
    <button onClick={() => setOpen(true)} className={className} title="How this app works">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="hidden sm:inline">How it works</span>
    </button>
  );

  return (
    <>
      <Trigger />
      {open && (
      <div className="modal-overlay" onClick={() => setOpen(false)}>
        <div className="modal-content p-6 space-y-4 max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-primary">How this app works</h2>
              <p className="text-xs text-muted mt-1">Everything you need to start landing interviews.</p>
            </div>
            <button onClick={() => setOpen(false)} className="btn-icon shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {STEPS.map((s) => (
              <div key={s.title} className="flex gap-3 p-3 rounded-xl bg-tertiary/40">
                <span className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0 text-brand-600 dark:text-brand-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{ICONS[s.icon]}</svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-primary">{s.title}</p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.text}</p>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setOpen(false)} className="btn btn-primary w-full">
            Got it
          </button>
        </div>
      </div>
      )}
    </>
  );
}
