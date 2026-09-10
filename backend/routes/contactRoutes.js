import express from "express";
import Contact from "../models/Contact.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import Call from "../models/Call.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/contacts  (search + filter + pagination, kept backward compatible: no query params = full list)
router.get("/", async (req, res) => {
  try {
    const { search = "", company, contactType, location, page, limit = 50 } = req.query;
    const query = { owner: req.userId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (company) query.companyRef = company;
    if (contactType) query.contactType = contactType;
    if (location) query.location = { $regex: location, $options: "i" };

    let cursor = Contact.find(query).sort({ createdAt: -1 });
    if (page) {
      const skip = (Number(page) - 1) * Number(limit);
      cursor = cursor.skip(skip).limit(Number(limit));
    }
    const contacts = await cursor;

    if (page) {
      const total = await Contact.countDocuments(query);
      return res.json({ contacts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    }
    // Backward-compatible: original frontend expects a plain array
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/contacts  (dedup by email + company where possible)
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, company, companyRef, designation, linkedinUrl, location, role, contactType, notes } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const dupQuery = { owner: req.userId, email: email.toLowerCase() };
    if (companyRef) dupQuery.companyRef = companyRef;
    const existing = await Contact.findOne(dupQuery);
    if (existing) return res.status(409).json({ message: "A contact with this email already exists for this company" });

    const contact = await Contact.create({
      owner: req.userId, name, email, phone, company, companyRef: companyRef || null,
      designation, linkedinUrl, location, role, contactType, notes,
    });
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/contacts/:id -> detail with related applications/emails/calls
router.get("/:id", async (req, res) => {
  try {
    const contact = await Contact.findOne({ _id: req.params.id, owner: req.userId });
    if (!contact) return res.status(404).json({ message: "Not found" });

    const [applications, emails, calls] = await Promise.all([
      Application.find({ owner: req.userId, contact: contact._id }).sort({ createdAt: -1 }),
      EmailLog.find({ owner: req.userId, contact: contact._id }).sort({ createdAt: -1 }).limit(50),
      Call.find({ owner: req.userId, contact: contact._id }).sort({ callDate: -1 }).limit(50),
    ]);

    res.json({ contact, applications, emails, calls });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/contacts/:id
router.put("/:id", async (req, res) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, owner: req.userId },
    req.body,
    { new: true }
  );
  if (!contact) return res.status(404).json({ message: "Not found" });
  res.json(contact);
});

// DELETE /api/contacts/:id
router.delete("/:id", async (req, res) => {
  const contact = await Contact.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!contact) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
