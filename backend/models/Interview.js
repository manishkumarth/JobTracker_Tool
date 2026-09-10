import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
    round: { type: String, enum: ["Round 1", "Round 2", "Round 3", "Final"], default: "Round 1" },
    interviewType: {
      type: String,
      enum: ["Phone", "Video", "Technical", "HR", "Managerial", "Assessment", "On-site"],
      default: "Video",
    },
    date: { type: Date, required: true },
    meetingUrl: { type: String, default: "" },
    interviewer: { type: String, default: "" },
    notes: { type: String, default: "" },
    result: {
      type: String,
      enum: ["Scheduled", "Completed", "Passed", "Failed", "Rescheduled", "Cancelled"],
      default: "Scheduled",
    },
  },
  { timestamps: true }
);

interviewSchema.index({ owner: 1, date: 1 });

export default mongoose.model("Interview", interviewSchema);
