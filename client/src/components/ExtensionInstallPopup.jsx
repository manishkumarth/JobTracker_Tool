const STEPS = [
  {
    title: "Get the extension",
    text: "Click \"Add to Chrome\" below to install the extension from the Chrome Web Store.",
  },
  {
    title: "Open Chrome extensions",
    text: "Type chrome://extensions in the Chrome address bar and press Enter.",
  },
  {
    title: "Enable Developer mode",
    text: "Turn on the \"Developer mode\" switch in the top-right corner of the extensions page.",
  },
  {
    title: "Load the extension",
    text: "Click \"Load unpacked\" and select the unzipped folder that contains manifest.json.",
  },
  {
    title: "Log in inside the extension",
    text: "Pin JobTrackr, open its popup and log in with this same account. Then open linkedin.com/feed — every post gets Save and Hide buttons.",
  },
];

/**
 * Modal that explains how to install the Chrome extension (store link when
 * published, ZIP download otherwise).
 */
export default function ExtensionInstallPopup({ onClose }) {
  const storeUrl = import.meta.env.VITE_CHROME_STORE_URL || "https://chromewebstore.google.com/detail/ohlgnebfcmngomlffmdafhclkmmjgdkf?utm_source=item-share-cb";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-6 space-y-5 max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center shrink-0">
              <svg
                className="w-6 h-6 text-brand-600 dark:text-brand-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <path d="M21.17 8H12" />
                <path d="M3.95 6.06 8.54 14" />
                <path d="M10.88 21.94 15.46 14" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-primary">Get the Chrome extension</h2>
              <p className="text-xs text-muted mt-0.5">
                Save LinkedIn feed jobs in one click — straight into this account.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-tertiary/40 rounded-xl p-4 text-sm text-secondary leading-relaxed">
          While you scroll LinkedIn, each job post gets a <strong>Save</strong> button (creates the
          application here) and a <strong>Hide</strong> button (removes noise). Turn on
          auto-send in the extension popup to email the recruiter instantly.
        </div>

        {storeUrl ? (
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-sm w-full text-center"
          >
            Add to Chrome
          </a>
        ) : (
          <p className="text-xs text-muted text-center">Extension not available yet.</p>
        )}

        <ol className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-primary">{s.title}</p>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2 pt-2 border-t border-color">
          <button onClick={onClose} className="btn btn-primary btn-sm flex-1">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
