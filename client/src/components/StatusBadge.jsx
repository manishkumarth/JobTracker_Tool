const BADGE_CLASSES = {
  NEW: "badge-neutral",
  SAVED: "badge-neutral",
  APPLYING: "badge-info",
  APPLIED: "badge-info",
  EMAIL_SENT: "badge-primary",
  FOLLOW_UP_REQUIRED: "badge-warning",
  FOLLOW_UP_SENT: "badge-warning",
  RECRUITER_REPLIED: "badge-success",
  SCREENING: "badge-success",
  PHONE_SCREEN: "badge-success",
  INTERVIEW_SCHEDULED: "badge-info",
  INTERVIEW_1: "badge-info",
  INTERVIEW_2: "badge-info",
  TECHNICAL_INTERVIEW: "badge-info",
  HR_INTERVIEW: "badge-info",
  ASSESSMENT: "badge-info",
  OFFER: "badge-success",
  SELECTED: "badge-success",
  REJECTED: "badge-danger",
  WITHDRAWN: "badge-neutral",
  NO_RESPONSE: "badge-neutral",
  CLOSED: "badge-neutral",
};

export default function StatusBadge({ status }) {
  const cls = BADGE_CLASSES[status] || "badge-neutral";
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
      {status?.replaceAll("_", " ")}
    </span>
  );
}
