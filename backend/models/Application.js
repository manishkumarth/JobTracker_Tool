import mongoose from "mongoose";

export const APPLICATION_STATUSES = [
  "NEW", "SAVED", "APPLYING", "APPLIED", "EMAIL_SENT",
  "FOLLOW_UP_REQUIRED", "FOLLOW_UP_SENT", "RECRUITER_REPLIED",
  "SCREENING", "PHONE_SCREEN", "INTERVIEW_SCHEDULED",
  "INTERVIEW_1", "INTERVIEW_2", "TECHNICAL_INTERVIEW", "HR_INTERVIEW",
  "ASSESSMENT", "OFFER", "SELECTED", "REJECTED", "WITHDRAWN",
  "NO_RESPONSE", "CLOSED",
];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // e.g. "status_change", "email_sent", "note", "call", "interview"
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const offerSchema = new mongoose.Schema(
  {
    offerDate: Date,
    salary: String,
    position: String,
    location: String,
    joiningDate: Date,
    status: { type: String, enum: ["Received", "Accepted", "Declined", "Negotiating", "Expired"], default: "Received" },
    notes: String,
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    companyName: { type: String, default: "" }, // denormalized for quick display / free-text entry

    jobTitle: { type: String, required: true },
    jobDescription: { type: String, default: "" },
    jobUrl: { type: String, default: "" },
    jobSource: {
      type: String,
      enum: ["Naukri", "LinkedIn", "Indeed", "Company Website", "Referral", "Recruiter", "Email", "Other"],
      default: "Other",
    },
    location: { type: String, default: "" },
    workMode: { type: String, enum: ["Remote", "Hybrid", "On-site"], default: "On-site" },
    employmentType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Internship"], default: "Full-time" },
    salary: { type: String, default: "" },
    experienceRequired: { type: String, default: "" },
    requiredSkills: [{ type: String }],

    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
    hrName: { type: String, default: "" },
    hrEmail: { type: String, default: "" },
    hrPhone: { type: String, default: "" },

    applicationDate: { type: Date, default: null },
    followUpDate: { type: Date, default: null },

    status: { type: String, enum: APPLICATION_STATUSES, default: "NEW" },
    priority: { type: String, enum: ["Low", "Medium", "High", "Urgent"], default: "Medium" },

    resumeUsed: { type: String, default: "" },
    coverLetterUsed: { type: String, default: "" },

    tags: [{ type: String }],
    jobMatchScore: { type: Number, default: null },
    jobMatchDetails: {
      matchingSkills: [{ type: String }],
      missingSkills: [{ type: String }],
    },

    offer: { type: offerSchema, default: null },

    notes: [noteSchema],
    activity: [activitySchema],
  },
  { timestamps: true }
);

applicationSchema.index({ owner: 1, status: 1 });
applicationSchema.index({ owner: 1, followUpDate: 1 });
applicationSchema.index({ owner: 1, applicationDate: 1 });
applicationSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model("Application", applicationSchema);
