import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    callDate: { type: Date, default: Date.now },
    durationMinutes: { type: Number, default: 0 },
    result: {
      type: String,
      enum: ["Connected", "No Answer", "Busy", "Callback Requested", "Wrong Number", "Not Interested", "Interested", "Asked to Email", "Interview Discussion", "Other"],
      default: "Connected",
    },
    notes: { type: String, default: "" },
    nextFollowUpDate: { type: Date, default: null },
  },
  { timestamps: true }
);

callSchema.index({ owner: 1, callDate: -1 });

export default mongoose.model("Call", callSchema);
