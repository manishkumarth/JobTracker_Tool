import mongoose from "mongoose";

const whatsappMessageSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", default: null },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", default: null },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    templateName: { type: String, default: "" },
    aiRewritten: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

whatsappMessageSchema.index({ owner: 1, sentAt: -1 });

export default mongoose.model("WhatsAppMessage", whatsappMessageSchema);
