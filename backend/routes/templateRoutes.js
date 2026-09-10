import express from "express";
import EmailTemplate from "../models/EmailTemplate.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/templates
router.get("/", async (req, res) => {
  const templates = await EmailTemplate.find({ owner: req.userId }).sort({ createdAt: -1 });
  res.json(templates);
});

// POST /api/templates
router.post("/", async (req, res) => {
  try {
    const { name, subject, body, type } = req.body;
    if (!name || !subject || !body) return res.status(400).json({ message: "Name, subject and body are required" });
    const template = await EmailTemplate.create({ owner: req.userId, name, subject, body, type });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/templates/:id
router.put("/:id", async (req, res) => {
  const template = await EmailTemplate.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, req.body, { new: true });
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json(template);
});

// POST /api/templates/:id/duplicate
router.post("/:id/duplicate", async (req, res) => {
  const original = await EmailTemplate.findOne({ _id: req.params.id, owner: req.userId });
  if (!original) return res.status(404).json({ message: "Not found" });
  const copy = await EmailTemplate.create({
    owner: req.userId,
    name: `${original.name} (Copy)`,
    subject: original.subject,
    body: original.body,
    type: original.type,
  });
  res.status(201).json(copy);
});

// DELETE /api/templates/:id
router.delete("/:id", async (req, res) => {
  const template = await EmailTemplate.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
