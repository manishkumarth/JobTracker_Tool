import { useAuth } from "../context/AuthContext.jsx";

export default function DisabledBanner() {
  const { user } = useAuth();

  if (!user?.isDisabled) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-secondary rounded-2xl max-w-md w-full p-8 text-center shadow-2xl border border-color space-y-5">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold text-primary">Account Disabled</h2>
          <p className="text-sm text-muted mt-2">
            Your account has been disabled. You can no longer send emails or use AI features.
            {user.disabledReason && (
              <span className="block mt-1 text-xs text-danger">Reason: {user.disabledReason}</span>
            )}
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
      </div>
    </div>
  );
}
