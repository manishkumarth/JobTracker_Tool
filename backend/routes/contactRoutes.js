import express from "express";
import Contact from "../models/Contact.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import Call from "../models/Call.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/contacts  (search + filter + pagination, enriched with application data)
router.get("/", async (req, res) => {
  try {
    const { search = "", company, contactType, location, page, limit = 50, includeApplications } = req.query;
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

    let cursor = Contact.find(query).populate("companyRef", "name").sort({ createdAt: -1 });
    if (page) {
      const skip = (Number(page) - 1) * Number(limit);
      cursor = cursor.skip(skip).limit(Number(limit));
    }
    const contacts = await cursor.lean();

    // Enrich with linked applications (job title / status) for list view
    const shouldEnrich = includeApplications !== "false";
    let enriched = contacts;
    if (shouldEnrich && contacts.length) {
      const contactIds = contacts.map((c) => c._id);
      const apps = await Application.find({ owner: req.userId, contact: { $in: contactIds } })
        .select("contact jobTitle companyName status workMode applicationDate")
        .populate("company", "name")
        .sort({ createdAt: -1 })
        .lean();

      const appsByContact = apps.reduce((acc, app) => {
        const key = String(app.contact);
        if (!acc[key]) acc[key] = [];
        acc[key].push(app);
        return acc;
      }, {});

      enriched = contacts.map((c) => ({
        ...c,
        applications: appsByContact[String(c._id)] || [],
        applicationCount: (appsByContact[String(c._id)] || []).length,
      }));
    }

    if (page) {
      const total = await Contact.countDocuments(query);
      return res.json({ contacts: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    }
    // Backward-compatible: if client expects plain array without application data, still return enriched array
    // Old code `Array.isArray(d) ? d : d.contacts` will still work because enriched is array
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/contacts  (manual creation - no field required except at least one identifier)
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, company, companyRef, designation, linkedinUrl, location, role, contactType, notes } = req.body;

    // Allow manual creation with minimal data: at least one of name/email/phone
    const trimmedName = (name || "").trim();
    const trimmedEmail = (email || "").trim();
    const trimmedPhone = (phone || "").trim();
    if (!trimmedName && !trimmedEmail && !trimmedPhone) {
      return res.status(400).json({ message: "At least one of name, email or phone is required" });
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Dedup only when email is provided (since email is now optional)
    if (trimmedEmail) {
      const dupQuery = { owner: req.userId, email: trimmedEmail.toLowerCase() };
      if (companyRef) dupQuery.companyRef = companyRef;
      const existing = await Contact.findOne(dupQuery);
      if (existing) return res.status(409).json({ message: "A contact with this email already exists for this company" });
    }

    const contact = await Contact.create({
      owner: req.userId,
      name: trimmedName,
      email: trimmedEmail ? trimmedEmail.toLowerCase() : "",
      phone: trimmedPhone,
      company: company || "",
      companyRef: companyRef || null,
      designation: designation || "",
      linkedinUrl: linkedinUrl || "",
      location: location || "",
      role: role || "",
      contactType: contactType || "HR",
      notes: notes || "",
    });
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/contacts/bulk/delete -> bulk delete (must be before /:id)
router.post("/bulk/delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "ids are required" });

    const result = await Contact.deleteMany({ _id: { $in: ids }, owner: req.userId });
    // Unlink from applications to avoid dangling refs
    await Application.updateMany({ owner: req.userId, contact: { $in: ids } }, { $set: { contact: null } });
    res.json({ deleted: result.deletedCount });
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
  try {
    // Normalize email if provided
    if (req.body.email != null) {
      const trimmed = String(req.body.email).trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      req.body.email = trimmed ? trimmed.toLowerCase() : "";
    }
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, owner: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!contact) return res.status(404).json({ message: "Not found" });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete("/:id", async (req, res) => {
  const contact = await Contact.findOneAndDelete({ _id: req.params.id, owner: req.userId });
  if (!contact) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
});

export default router;
