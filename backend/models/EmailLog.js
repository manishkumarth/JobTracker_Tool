import mongoose from "mongoose";

const trackingEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["open", "click"], required: true },
    timestamp: { type: Date, default: Date.now },
    ip: String,
    userAgent: String,
    linkUrl: String,
  },
  { _id: false }
);

const emailLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },

    recipient: { type: String, required: true },
    recipientName: { type: String, default: "" },
    subject: { type: String, required: true },
    body: { type: String, required: true },

    sentAt: { type: Date, default: null },
    status: { type: String, enum: ["Draft", "Pending", "Sent", "Failed"], default: "Pending" },
    errorMessage: { type: String, default: "" },

    emailType: {
      type: String,
      enum: ["Job Application", "Follow-up", "Thank You", "Interview", "Referral", "Cold Outreach", "Recruiter Response", "Other"],
      default: "Job Application",
    },
    isAiGenerated: { type: Boolean, default: false },
    template: { type: mongoose.Schema.Types.ObjectId, ref: "EmailTemplate", default: null },
    attachmentName: { type: String, default: "" },

    trackingId: { type: String, unique: true, sparse: true, index: true },
    trackingEnabled: { type: Boolean, default: true },
    opens: [trackingEventSchema],
    clicks: [trackingEventSchema],
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    lastOpenedAt: { type: Date, default: null },
    lastClickedAt: { type: Date, default: null },

    // Email threading
    threadId: { type: String, index: true, sparse: true },
    inReplyTo: { type: String, default: "" }, // Message-ID of the email this is a reply to
    references: [{ type: String }], // Chain of Message-IDs
    isReply: { type: Boolean, default: false },
    parentEmail: { type: mongoose.Schema.Types.ObjectId, ref: "EmailLog", default: null },
  },
  { timestamps: true }
);

emailLogSchema.index({ owner: 1, createdAt: -1 });
emailLogSchema.index({ owner: 1, status: 1 });
emailLogSchema.index({ owner: 1, application: 1 });
emailLogSchema.index({ trackingId: 1 });
emailLogSchema.index({ threadId: 1 });

export default mongoose.model("EmailLog", emailLogSchema);
