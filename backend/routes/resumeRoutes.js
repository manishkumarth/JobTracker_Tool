import express from "express";
import CandidateProfile from "../models/CandidateProfile.js";
import authMiddleware from "../middleware/auth.js";
import { upload, uploadToCloudinary, deleteFromCloudinary, getCloudinaryUrl } from "../utils/cloudinary.js";

const router = express.Router();
router.use(authMiddleware);

// POST /api/resumes/upload - Upload a new resume
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    const isFirstResume = profile.resumes.length === 0;

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      public_id: `${req.userId}-${Date.now()}-${req.file.originalname.replace(/\.[^/.]+$/, "")}`,
    });

    const newResume = {
      fileName: cloudinaryResult.public_id,
      originalName: req.file.originalname,
      cloudinaryPublicId: cloudinaryResult.public_id,
      cloudinaryUrl: cloudinaryResult.secure_url,
      size: req.file.size,
      isDefault: isFirstResume,
    };

    // If this is the first resume, unset any existing default
    if (isFirstResume) {
      profile.resumes.forEach((r) => (r.isDefault = false));
    }

    profile.resumes.push(newResume);
    await profile.save();

    res.status(201).json({ resume: newResume });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resumes - Get all resumes for the user
router.get("/", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (!profile) return res.json({ resumes: [] });
    res.json({ resumes: profile.resumes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/resumes/:resumeId/default - Set a resume as default
router.patch("/:resumeId/default", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    const resume = profile.resumes.id(req.params.resumeId);
    if (!resume) return res.status(404).json({ message: "Resume not found" });

    profile.resumes.forEach((r) => (r.isDefault = false));
    resume.isDefault = true;
    await profile.save();

    res.json({ resume });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/resumes/:resumeId - Delete a resume
router.delete("/:resumeId", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    const resume = profile.resumes.id(req.params.resumeId);
    if (!resume) return res.status(404).json({ message: "Resume not found" });

    const wasDefault = resume.isDefault;
    await deleteFromCloudinary(resume.cloudinaryPublicId);

    profile.resumes.pull(req.params.resumeId);

    // If deleted was default, set the first remaining as default
    if (wasDefault && profile.resumes.length > 0) {
      profile.resumes[0].isDefault = true;
    }

    await profile.save();
    res.json({ message: "Resume deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;