import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // hashed, for app login

    // Gmail sending identity (the user's OWN mail id)
    gmailAddress: { type: String, default: "" },
    gmailAppPasswordEnc: { type: String, default: "" }, // encrypted app password
    gmailConnected: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
