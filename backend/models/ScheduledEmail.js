import mongoose from "mongoose";

// Statuses used by the dashboard.
// Pending   -> due now / immediately after creation, waiting for the worker
// Scheduled -> future send, waiting for its scheduled time
// Processing-> atomically claimed by a worker (in flight)
// Sent / Failed / Cancelled -> terminal states (Failed can be retried manually)
export const SCHEDULED_EMAIL_STATUSES = [
  "Pending",
  "Scheduled",
  "Processing",
  "Sent",
  "Failed",
  "Cancelled",
];

const scheduledEmailSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },

    // Sender account (subdocument id on User.emailAccounts)
    accountId: { type: mongoose.Schema.Types.ObjectId, default: null },
    accountEmail: { type: String, default: "" },

    recipient: { type: String, required: true },
    recipientName: { type: String, default: "" },
    subject: { type: String, required: true },
    body: { type: String, required: true },

    emailType: {
      type: String,
      enum: ["Job Application", "Follow-up", "Thank You", "Interview", "Referral", "Cold Outreach", "Recruiter Response", "Other"],
      default: "Job Application",
    },
    isAiGenerated: { type: Boolean, default: false },

    resumeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    resumeName: { type: String, default: "" },

    // Persisted schedule (UTC). Survives restarts because it lives in MongoDB.
    scheduledAt: { type: Date, required: true, index: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    nextRetryAt: { type: Date, default: null, index: true },

    status: { type: String, enum: SCHEDULED_EMAIL_STATUSES, default: "Scheduled", index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String, default: "" },

    processingStartedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    emailLog: { type: mongoose.Schema.Types.ObjectId, ref: "EmailLog", default: null },

    // Active duplicate guard. Unset on terminal states so the same
    // application can be sent again later if the user explicitly retries.
    // Unique + sparse prevents concurrent duplicate schedules atomically.
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

scheduledEmailSchema.index({ owner: 1, status: 1, scheduledAt: 1 });
scheduledEmailSchema.index({ owner: 1, createdAt: -1 });
scheduledEmailSchema.index({ status: 1, scheduledAt: 1 });
scheduledEmailSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("ScheduledEmail", scheduledEmailSchema);
