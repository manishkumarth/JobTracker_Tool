import express from "express";
import multer from "multer";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { parseResumeFromBuffer } from "../utils/resumeParser.js";

const router = express.Router();
router.use(authMiddleware);

// In-memory upload for local parse
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

// GET /api/profile  -> creates an empty profile on first access
router.get("/", async (req, res) => {
  let profile = await CandidateProfile.findOne({ owner: req.userId });
  if (!profile) profile = await CandidateProfile.create({ owner: req.userId });
  res.json(profile);
});

// PUT /api/profile
router.put("/", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOneAndUpdate(
      { owner: req.userId },
      { ...req.body, owner: req.userId },
      { new: true, upsert: true }
    );
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/profile/parse-resume - parse uploaded file (from memory)
router.post("/parse-resume", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const parsed = await parseResumeFromBuffer(req.file.buffer);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/profile/parse-cloudinary-resume - parse resume from Cloudinary URL (no temp file)
router.post("/parse-cloudinary-resume", async (req, res) => {
  try {
    const { cloudinaryUrl, cloudinaryPublicId } = req.body;
    if (!cloudinaryUrl && !cloudinaryPublicId) {
      return res.status(400).json({ message: "cloudinaryUrl or cloudinaryPublicId is required" });
    }

    let url = cloudinaryUrl;
    if (!url && cloudinaryPublicId) {
      const { getCloudinaryUrl } = await import("../utils/cloudinary.js");
      url = getCloudinaryUrl(cloudinaryPublicId);
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download resume from Cloudinary");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = await parseResumeFromBuffer(buffer);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
