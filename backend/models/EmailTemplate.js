import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ["Job Application", "Follow-up", "Interview Confirmation", "Interview Thank You", "Recruiter Follow-up", "Referral Request", "Cold Outreach", "Other"],
      default: "Job Application",
    },
  },
  { timestamps: true }
);

export default mongoose.model("EmailTemplate", emailTemplateSchema);
