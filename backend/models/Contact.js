import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "" },
    email: { type: String, default: "", trim: true, lowercase: true },
    phone: { type: String, default: "" },
    company: { type: String, default: "" }, // free-text fallback (kept for backward compatibility)
    companyRef: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    designation: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    location: { type: String, default: "" },
    role: { type: String, default: "" }, // legacy field, kept for backward compatibility
    contactType: {
      type: String,
      enum: ["HR", "Recruiter", "Hiring Manager", "Founder", "Employee", "Referral", "Other"],
      default: "HR",
    },
    notes: { type: String, default: "" },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ owner: 1, email: 1, companyRef: 1 }, { sparse: true });

export default mongoose.model("Contact", contactSchema);
