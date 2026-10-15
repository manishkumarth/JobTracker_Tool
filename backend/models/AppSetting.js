import mongoose from "mongoose";

// Singleton-ish key/value store for app-wide settings the admin controls.
const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, default: "" },
  },
  { timestamps: true }
);

appSettingSchema.statics.getValue = async function (key, fallback = "") {
  const doc = await this.findOne({ key });
  return doc?.value || fallback;
};

appSettingSchema.statics.setValue = async function (key, value) {
  const doc = await this.findOneAndUpdate(
    { key },
    { value },
    { new: true, upsert: true }
  );
  return doc;
};

export default mongoose.model("AppSetting", appSettingSchema);
