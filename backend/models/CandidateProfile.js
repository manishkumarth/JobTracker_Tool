import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true },
    size: { type: Number },
    isDefault: { type: Boolean, default: false },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const candidateProfileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, default: "" },
    professionalTitle: { type: String, default: "" },
    experience: { type: String, default: "" },
    skills: [{ type: String }],
    technologies: [{ type: String }],
    previousCompanies: [{ type: String }],
    projects: [{ type: String }],
    education: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    github: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    resumeText: { type: String, default: "" },
    additionalInfo: { type: String, default: "" },
    resumes: [resumeSchema],
  },
  { timestamps: true }
);

export default mongoose.model("CandidateProfile", candidateProfileSchema);
