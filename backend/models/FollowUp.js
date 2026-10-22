import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
    type: {
      type: String,
      enum: ["Email Follow-up", "Call Follow-up", "LinkedIn Follow-up", "Recruiter Follow-up", "Interview Follow-up", "General"],
      default: "General",
    },
    date: { type: Date, required: true },
    note: { type: String, default: "" },
    hrRequest: { type: String, default: "" },
    autoSend: { type: Boolean, default: false },
    emailSentAt: { type: Date, default: null },
    emailLog: { type: mongoose.Schema.Types.ObjectId, ref: "EmailLog", default: null },
    status: { type: String, enum: ["Pending", "Completed", "Cancelled"], default: "Pending" },
  },
  { timestamps: true }
);

followUpSchema.index({ owner: 1, date: 1, status: 1 });
followUpSchema.index({ status: 1, autoSend: 1, date: 1 });

export default mongoose.model("FollowUp", followUpSchema);
