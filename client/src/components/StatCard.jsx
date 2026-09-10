const TONE_MAP = {
  default: "stat-gradient-1",
  info: "stat-gradient-2",
  warn: "stat-gradient-3",
  danger: "stat-gradient-4",
  good: "stat-gradient-1",
};

export default function StatCard({ label, value, tone = "default", icon }) {
  const gradient = TONE_MAP[tone] || "stat-gradient-1";

  return (
    <div className={`${gradient} rounded-2xl p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 relative overflow-hidden`}>
      {icon && (
        <div className="absolute top-4 right-4 text-white/30">
          {icon}
        </div>
      )}
      <p className="text-sm text-white/80 font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1 text-white">{value ?? "—"}</p>
    </div>
  );
}
