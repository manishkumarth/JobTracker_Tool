import express from "express";
import WhatsAppMessage from "../models/WhatsAppMessage.js";
import authMiddleware from "../middleware/auth.js";
import User from "../models/User.js";
import { callLLM } from "../utils/llmClient.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/whatsapp - list messages
router.get("/", async (req, res) => {
  try {
    const { contact, page = 1, limit = 20 } = req.query;
    const query = { owner: req.userId };
    if (contact) query.contact = contact;

    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total] = await Promise.all([
      WhatsAppMessage.find(query).populate("contact", "name phone").sort({ sentAt: -1 }).skip(skip).limit(Number(limit)),
      WhatsAppMessage.countDocuments(query),
    ]);
    res.json({ messages, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/whatsapp - log a sent message
router.post("/", async (req, res) => {
  try {
    const { contact, company, application, phone, message, templateName, aiRewritten } = req.body;
    if (!phone || !message) return res.status(400).json({ message: "Phone and message are required" });

    const msg = await WhatsAppMessage.create({
      owner: req.userId, contact, company, application,
      phone, message, templateName, aiRewritten,
    });
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/whatsapp/rewrite - AI rewrite a message
router.post("/rewrite", async (req, res) => {
  try {
    const { message, tone, contactName } = req.body;
    if (!message) return res.status(400).json({ message: "Message is required" });

    const user = await User.findById(req.userId).select("aiProviders");
    const userProviders = user?.aiProviders || [];

    const systemPrompt = `You are a professional WhatsApp message rewriter. Rewrite the user's message to be more professional, clear, and concise while keeping the intent.
Rules:
- Keep it short (WhatsApp messages should be brief)
- Maintain the original meaning
- Use a ${tone || "professional"} tone
- Address the person as ${contactName || "them"} if mentioned
- Do NOT use markdown formatting
- Return ONLY the rewritten message text, nothing else`;

    const rewritten = await callLLM({ userProviders, prompt: message, systemPrompt });
    res.json({ rewritten: rewritten.trim() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/whatsapp/:id
router.delete("/:id", async (req, res) => {
  const msg = await WhatsAppMessage.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!msg) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
