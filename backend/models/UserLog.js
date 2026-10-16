import mongoose from "mongoose";

// Audit trail of user sessions and actions, viewable by the admin.
const userLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    type: { type: String, enum: ["login", "logout", "activity"], required: true, index: true },
    action: { type: String, default: "" },
    meta: { type: Object, default: {} },
    ip: { type: String, default: "" },
    location: {
      city: { type: String, default: "" },
      region: { type: String, default: "" },
      country: { type: String, default: "" },
      lat: { type: Number, default: null },
      lon: { type: Number, default: null },
      timezone: { type: String, default: "" },
    },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

userLogSchema.index({ createdAt: -1 });

export default mongoose.model("UserLog", userLogSchema);
