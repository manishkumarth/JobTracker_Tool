import { useEffect, useState } from "react";

const MOBILE_RE = /Android|iPhone|iPad|iPod|Mobile/i;
const DISMISS_KEY = "jt-apk-banner-dismissed";

export default function MobileAppBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!MOBILE_RE.test(navigator.userAgent)) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    // Only show once the APK is actually hosted (avoids a broken download
    // link - the SPA fallback answers with HTML before the APK exists).
    fetch("/jobtrackr.apk", { method: "HEAD" })
      .then((r) => {
        const ct = r.headers.get("content-type") || "";
        if (r.ok && !ct.includes("text/html")) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-brand-600 text-white shadow-lg border-t border-white/20">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67c-.19-.29-.58-.38-.87-.2-.28.18-.37.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">JobTrackr for Android</p>
          <p className="text-[11px] text-white/80 leading-tight truncate">
            Track applications &amp; auto-save LinkedIn posts on your phone
          </p>
        </div>
        <a
          href="/jobtrackr.apk"
          download
          className="shrink-0 bg-white text-brand-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
        >
          Download APK
        </a>
        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setShow(false);
          }}
          aria-label="Dismiss"
          className="shrink-0 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
