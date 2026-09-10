import express from "express";
import Company from "../models/Company.js";
import Contact from "../models/Contact.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import Call from "../models/Call.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/companies  (search + pagination)
router.get("/", async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20 } = req.query;
    const query = { owner: req.userId };
    if (search) query.name = { $regex: search, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [companies, total] = await Promise.all([
      Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Company.countDocuments(query),
    ]);
    res.json({ companies, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/companies
router.post("/", async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ message: "Company name is required" });
    const company = await Company.create({ ...req.body, owner: req.userId });
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/companies/:id  -> full detail: company + contacts + applications + emails + calls
router.get("/:id", async (req, res) => {
  try {
    const company = await Company.findOne({ _id: req.params.id, owner: req.userId });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const [contacts, applications, emails, calls] = await Promise.all([
      Contact.find({ owner: req.userId, companyRef: company._id }).sort({ createdAt: -1 }),
      Application.find({ owner: req.userId, company: company._id }).sort({ createdAt: -1 }),
      EmailLog.find({ owner: req.userId, company: company._id }).sort({ createdAt: -1 }).limit(50),
      Call.find({ owner: req.userId, company: company._id }).sort({ callDate: -1 }).limit(50),
    ]);

    res.json({ company, contacts, applications, emails, calls });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/companies/:id
router.put("/:id", async (req, res) => {
  const company = await Company.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, req.body, { new: true });
  if (!company) return res.status(404).json({ message: "Not found" });
  res.json(company);
});

// DELETE /api/companies/:id
router.delete("/:id", async (req, res) => {
  const company = await Company.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!company) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
