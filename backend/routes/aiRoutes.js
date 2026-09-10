import express from "express";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import authMiddleware from "../middleware/auth.js";
import { generateApplicationEmail, generateFollowUpEmail, refineEmail, analyzeJobDescription, parseLinkedInText } from "../utils/gemini.js";

const router = express.Router();
router.use(authMiddleware);

const cleanAiError = (res, err) => {
  console.error("Gemini error:", err.message);
  res.status(502).json({ message: "Unable to generate email right now. Please try again." });
};

// POST /api/ai/generate-email
// body: { applicationId, jobTitle, companyName, jobDescription, recruiterName, tone, length }
router.post("/generate-email", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const { applicationId, jobTitle, companyName, jobDescription, recruiterName, tone, length } = req.body;

    let resolvedJobTitle = jobTitle, resolvedCompany = companyName, resolvedDescription = jobDescription, resolvedRecruiter = recruiterName;

    if (applicationId) {
      const app = await Application.findOne({ _id: applicationId, owner: req.userId });
      if (!app) return res.status(404).json({ message: "Application not found" });
      resolvedJobTitle = resolvedJobTitle || app.jobTitle;
      resolvedCompany = resolvedCompany || app.companyName;
      resolvedDescription = resolvedDescription || app.jobDescription;
      resolvedRecruiter = resolvedRecruiter || app.hrName;
    }

    if (!resolvedJobTitle) return res.status(400).json({ message: "jobTitle (or applicationId) is required" });

    const generated = await generateApplicationEmail({
      profile, jobTitle: resolvedJobTitle, companyName: resolvedCompany,
      jobDescription: resolvedDescription, recruiterName: resolvedRecruiter, tone, length,
    });

    res.json(generated);
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/generate-followup
// body: { applicationId }
router.post("/generate-followup", async (req, res) => {
  try {
    const { applicationId } = req.body;
    if (!applicationId) return res.status(400).json({ message: "applicationId is required" });

    const application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Application not found" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const originalEmail = await EmailLog.findOne({ owner: req.userId, application: applicationId, status: "Sent" }).sort({ createdAt: -1 });

    const generated = await generateFollowUpEmail({ profile, application, originalEmail });
    res.json(generated);
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/refine
// body: { currentSubject, currentBody, instruction }  instruction e.g. "make shorter", "more professional"
router.post("/refine", async (req, res) => {
  try {
    const { currentSubject, currentBody, instruction } = req.body;
    if (!currentBody || !instruction) return res.status(400).json({ message: "currentBody and instruction are required" });

    const generated = await refineEmail({ currentSubject, currentBody, instruction });
    res.json(generated);
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/analyze-job
// body: { jobDescription }
router.post("/analyze-job", async (req, res) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription) return res.status(400).json({ message: "jobDescription is required" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const analysis = await analyzeJobDescription({ jobDescription, profile });
    res.json(analysis);
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/parse-linkedin
// body: { text }
router.post("/parse-linkedin", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: "text is required" });

    const parsed = await parseLinkedInText({ text });
    res.json(parsed);
  } catch (err) {
    cleanAiError(res, err);
  }
});

export default router;
