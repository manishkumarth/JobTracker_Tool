import express from "express";
import authMiddleware from "../middleware/auth.js";
import Application from "../models/Application.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/check", async (req, res) => {
  try {
    const url = (req.query.url || "").trim();
    if (!url) return res.status(400).json({ message: "url is required" });

    const existing = await Application.findOne({ owner: req.userId, jobUrl: url }).select(
      "_id jobTitle companyName status"
    );

    res.json({ exists: !!existing, application: existing || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
