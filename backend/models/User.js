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

    // AI provider keys (encrypted at rest)
    aiProviders: [{
      provider: { type: String, required: true }, // e.g. "openrouter", "openai", "gemini", "anthropic", "groq", "deepseek", "together"
      apiKeyEnc: { type: String, default: "" },   // encrypted API key
      model: { type: String, default: "" },        // preferred model for this provider
      active: { type: Boolean, default: false },   // which provider is currently active
    }],
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
