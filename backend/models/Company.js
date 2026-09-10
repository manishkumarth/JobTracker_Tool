import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    website: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
    location: { type: String, default: "" },
    industry: { type: String, default: "" },
    size: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

companySchema.index({ owner: 1, name: 1 });

export default mongoose.model("Company", companySchema);
