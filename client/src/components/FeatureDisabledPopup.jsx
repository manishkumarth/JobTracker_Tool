import { useEffect, useState } from "react";

const FEATURE_LABELS = {
  sendEmail: "Sending emails",
  aiEmail: "AI email generation",
  autoFollowUp: "Auto follow-ups",
  resumeUpload: "Resume upload",
  quickFill: "LinkedIn Quick Fill",
};

/**
 * Global popup shown when the backend rejects a request because the admin
 * disabled that feature on the user's account (403 + featureDisabled).
 * Mirrors DisabledBanner's contact-support card.
 */
export default function FeatureDisabledPopup() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const handler = (e) => setInfo(e.detail || {});
    window.addEventListener("feature-disabled", handler);
    return () => window.removeEventListener("feature-disabled", handler);
  }, []);

  if (!info) return null;

  const label = FEATURE_LABELS[info.feature];

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-secondary rounded-2xl max-w-md w-full p-8 text-center shadow-2xl border border-color space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-primary">{info.disabled ? "Account Disabled" : "Feature Disabled"}</h2>
          <p className="text-sm text-muted mt-2">
            {info.disabled
              ? info.message || "Your account has been disabled. Please contact support."
              : `${label ? `"${label}"` : "This feature"} has been turned off on your account. Please contact support to get it enabled.`}
          </p>
        </div>

        <div className="bg-tertiary rounded-xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Contact support</p>
          <div className="space-y-1.5 text-sm text-secondary">
            <p className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Manish Kumar
            </p>
            <p className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              <a href="tel:9798293519" className="text-accent hover:underline">9798293519</a>
            </p>
            <p className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <a href="mailto:manish12099@gmail.com" className="text-accent hover:underline">manish12099@gmail.com</a>
            </p>
          </div>
        </div>

        <button onClick={() => setInfo(null)} className="btn btn-primary btn-sm w-full">
          Got it
        </button>
      </div>
    </div>
  );
}
