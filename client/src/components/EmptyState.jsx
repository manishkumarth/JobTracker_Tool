export default function EmptyState({ title, description, icon, children }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 text-muted opacity-40">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-muted max-w-xs">{description}</p>
      )}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
