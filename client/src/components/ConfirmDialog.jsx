export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  confirmLabel,
  variant,
  danger,
  onConfirm,
  onCancel,
  onClose,
  busy = false,
}) {
  const isVisible = open !== undefined ? open : true;
  const handleCancel = onCancel || onClose || (() => {});
  const isDanger = danger || variant === "danger";
  const label = confirmLabel || confirmText || "Confirm";

  if (!isVisible) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div
        className="modal-content animate-[scale-in_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center mb-4">
          {isDanger ? (
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
            </div>
          )}
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <p className="text-sm text-muted mt-1">{message}</p>
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`btn disabled:opacity-60 ${
              isDanger
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "btn-primary"
            }`}
          >
            {busy ? "Please wait..." : label}
          </button>
        </div>
      </div>
    </div>
  );
}
