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

    // Account status / admin
    isAdmin: { type: Boolean, default: false },
    isDisabled: { type: Boolean, default: false },
    disabledReason: { type: String, default: "" },

    // Per-user feature switches, toggled by the admin
    features: {
      sendEmail: { type: Boolean, default: true },   // send any email via Gmail
      aiEmail: { type: Boolean, default: true },      // AI generate + refine
      autoFollowUp: { type: Boolean, default: true }, // send/manage follow-ups
      resumeUpload: { type: Boolean, default: true }, // upload / parse resumes
      quickFill: { type: Boolean, default: true },    // LinkedIn quick fill
    },

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
