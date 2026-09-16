import express from "express";
import multer from "multer";
import CandidateProfile from "../models/CandidateProfile.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";
import { parseResumeFromBuffer } from "../utils/resumeParser.js";
import { callLLM, parseJson } from "../utils/llmClient.js";

const router = express.Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

const parseExperienceWithLLM = async (rawText, userProviders) => {
  const systemPrompt = `You are a resume parsing assistant. Extract structured experience data from resume text.
Return ONLY valid JSON with this exact structure:
{
  "totalExperience": "X years Y months" or "X+ years" (calculated from actual work dates, NOT from resume text claims),
  "experienceEntries": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM" or "Present",
      "duration": "X years Y months"
    }
  ],
  "professionalTitle": "Most recent job title",
  "previousCompanies": ["Company1", "Company2"],
  "skills": ["skill1", "skill2"],
  "education": "Degree, Institution",
  "projects": ["Project 1", "Project 2"]
}

Rules for calculating experience:
- Parse ALL date ranges (e.g. "November 2024 to present", "Jan 2022 - Dec 2023", "2020-2024", "Mar 2021 - Present")
- Handle month names (jan-dec), numeric dates (MM/YYYY), and year-only formats
- Calculate TOTAL experience by summing all overlapping/non-overlapping job durations
- If dates overlap, count the overlap only once
- Use today's date (${new Date().toISOString().slice(0, 10)}) as "Present" endpoint
- If only years given, assume January for start and December for end
- Return totalExperience as calculated from dates, NOT as stated in resume`;

  const prompt = `Extract and calculate experience from this resume text:\n\n${rawText.slice(0, 6000)}`;

  try {
    const response = await callLLM({ userProviders, prompt, systemPrompt });
    return parseJson(response);
  } catch (err) {
    console.error("LLM experience parse failed, falling back to regex:", err.message);
    return null;
  }
};

const mergeParsedIntoProfile = (profile, parsed) => {
  const update = {};

  if (parsed.professionalTitle && (!profile.professionalTitle || profile.professionalTitle === "Not specified")) {
    update.professionalTitle = parsed.professionalTitle;
  }
  if (parsed.totalExperience) {
    update.experience = parsed.totalExperience;
  }
  if (parsed.education && (!profile.education || profile.education === "Not specified")) {
    update.education = parsed.education;
  }

  if (parsed.skills?.length) {
    const existing = new Set((profile.skills || []).map((s) => s.toLowerCase()));
    const newSkills = parsed.skills.filter((s) => !existing.has(s.toLowerCase()));
    if (newSkills.length) update.skills = [...(profile.skills || []), ...newSkills];
  }

  if (parsed.previousCompanies?.length) {
    const existing = new Set((profile.previousCompanies || []).map((c) => c.toLowerCase()));
    const newCompanies = parsed.previousCompanies.filter((c) => !existing.has(c.toLowerCase()));
    if (newCompanies.length) update.previousCompanies = [...(profile.previousCompanies || []), ...newCompanies];
  }

  if (parsed.projects?.length) {
    const existing = new Set((profile.projects || []).map((p) => p.toLowerCase()));
    const newProjects = parsed.projects.filter((p) => !existing.has(p.toLowerCase()));
    if (newProjects.length) update.projects = [...(profile.projects || []), ...newProjects];
  }

  return update;
};

// GET /api/profile
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

// POST /api/profile/parse-resume
router.post("/parse-resume", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const basic = await parseResumeFromBuffer(req.file.buffer);

    const user = await User.findById(req.userId).select("aiProviders");
    const userProviders = user?.aiProviders || [];
    const llmData = await parseExperienceWithLLM(basic.rawText, userProviders);

    const parsed = {
      skills: basic.skills,
      experience: llmData?.totalExperience || basic.experience,
      education: llmData?.education || basic.education,
      projects: llmData?.projects || (basic.projects !== "Not specified" ? basic.projects.split("; ") : []),
      professionalTitle: llmData?.professionalTitle || basic.professionalTitle,
      previousCompanies: llmData?.previousCompanies || [],
      experienceEntries: llmData?.experienceEntries || [],
      rawText: basic.rawText,
    };

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (profile) {
      const merged = mergeParsedIntoProfile(profile, parsed);
      if (parsed.rawText) merged.resumeText = parsed.rawText;
      const updated = await CandidateProfile.findOneAndUpdate(
        { owner: req.userId },
        { $set: merged },
        { new: true }
      );
      return res.json({ parsed, profile: updated });
    }

    res.json({ parsed, profile: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/profile/parse-cloudinary-resume
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

    const basic = await parseResumeFromBuffer(buffer);

    const user = await User.findById(req.userId).select("aiProviders");
    const userProviders = user?.aiProviders || [];
    const llmData = await parseExperienceWithLLM(basic.rawText, userProviders);

    const parsed = {
      skills: basic.skills,
      experience: llmData?.totalExperience || basic.experience,
      education: llmData?.education || basic.education,
      projects: llmData?.projects || (basic.projects !== "Not specified" ? basic.projects.split("; ") : []),
      professionalTitle: llmData?.professionalTitle || basic.professionalTitle,
      previousCompanies: llmData?.previousCompanies || [],
      experienceEntries: llmData?.experienceEntries || [],
      rawText: basic.rawText,
    };

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    if (profile) {
      const merged = mergeParsedIntoProfile(profile, parsed);
      if (parsed.rawText) merged.resumeText = parsed.rawText;
      const updated = await CandidateProfile.findOneAndUpdate(
        { owner: req.userId },
        { $set: merged },
        { new: true }
      );
      return res.json({ parsed, profile: updated });
    }

    res.json({ parsed, profile: null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
