import express from "express";
import EmailLog from "../models/EmailLog.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/emails  (history: search, filters, date range, pagination)
router.get("/", async (req, res) => {
  try {
    const {
      search = "", status, company, emailType, isAiGenerated,
      dateFrom, dateTo, application,
      page = 1, limit = 20,
    } = req.query;

    const query = { owner: req.userId };
    if (status) query.status = status;
    if (company) query.company = company;
    if (emailType) query.emailType = emailType;
    if (application) query.application = application;
    if (isAiGenerated !== undefined) query.isAiGenerated = isAiGenerated === "true";
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      query.$or = [
        { recipient: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [emails, total] = await Promise.all([
      EmailLog.find(query).populate("company", "name").populate("application", "jobTitle")
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      EmailLog.countDocuments(query),
    ]);

    const emailsWithTracking = emails.map((email) => ({
      ...email.toObject(),
      openCount: email.openCount || 0,
      clickCount: email.clickCount || 0,
      lastOpenedAt: email.lastOpenedAt || null,
      lastClickedAt: email.lastClickedAt || null,
    }));

    res.json({ emails: emailsWithTracking, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/emails/:id
router.get("/:id", async (req, res) => {
  const email = await EmailLog.findOne({ _id: req.params.id, owner: req.userId })
    .populate("company", "name").populate("application", "jobTitle").populate("contact", "name email");
  if (!email) return res.status(404).json({ message: "Not found" });
  res.json(email);
});

export default router;
