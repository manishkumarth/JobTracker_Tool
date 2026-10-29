import express from "express";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import EmailTemplate from "../models/EmailTemplate.js";
import EmailLog from "../models/EmailLog.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { callLLM, parseJson } from "../utils/llmClient.js";
import { candidateFactsBlock, masterPromptBlock, JSON_ONLY, sanitizeText, limitedFactsBlock } from "../utils/candidatePrompt.js";
import { generateApplicationEmail } from "../utils/emailWriter.js";

const router = express.Router();
router.use(authMiddleware);
router.use(requireFeature("aiEmail"));

const cleanAiError = (res, err) => {
  console.error("LLM error:", err.message);
  const detail = err.message?.includes("API key") || err.message?.includes("401") || err.message?.includes("403")
    ? " Invalid API key. Go to Config → AI Providers and update your key."
    : err.message?.includes("No AI provider")
    ? " No AI provider configured. Add an API key in Config → AI Providers."
    : "";
  res.status(502).json({ message: `AI error: ${err.message?.slice(0, 150) || "unknown"}${detail}` });
};

// Shared: get user's providers array for callLLM
const getUserProviders = async (userId) => {
  const user = await User.findById(userId).select("aiProviders");
  return user?.aiProviders || [];
};

// POST /api/ai/generate-email
router.post("/generate-email", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const { applicationId, jobTitle, companyName, jobDescription, recruiterName, tone, length, provider, model } = req.body;

    let application = {
      jobTitle,
      companyName,
      jobDescription,
      hrName: recruiterName,
    };

    if (applicationId) {
      const app = await Application.findOne({ _id: applicationId, owner: req.userId });
      if (!app) return res.status(404).json({ message: "Application not found" });
      application = {
        jobTitle: jobTitle || app.jobTitle,
        companyName: companyName || app.companyName,
        jobDescription: jobDescription || app.jobDescription,
        hrName: recruiterName || app.hrName,
      };
    }

    if (!application.jobTitle) return res.status(400).json({ message: "jobTitle (or applicationId) is required" });

    const userProviders = await getUserProviders(req.userId);
    const draft = await generateApplicationEmail({
      profile,
      application,
      tone,
      length,
      userProviders,
      provider,
      model,
    });
    res.json(draft);
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/generate-followup
router.post("/generate-followup", async (req, res) => {
  try {
    const { applicationId, provider, model } = req.body;
    if (!applicationId) return res.status(400).json({ message: "applicationId is required" });

    const application = await Application.findOne({ _id: applicationId, owner: req.userId });
    if (!application) return res.status(404).json({ message: "Application not found" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const originalEmail = await EmailLog.findOne({ owner: req.userId, application: applicationId, status: "Sent" }).sort({ createdAt: -1 });
    const userProviders = await getUserProviders(req.userId);

    const prompt = `
You are an assistant that writes short, polite follow-up emails for job applications.

${candidateFactsBlock(profile)}

APPLICATION CONTEXT:
Job title: ${application.jobTitle}
Company: ${application.companyName || ""}
Applied on: ${application.applicationDate ? new Date(application.applicationDate).toDateString() : "unknown date"}
Recruiter: ${application.hrName || "(unknown)"}
Original email sent: ${originalEmail?.subject ? `Subject: ${originalEmail.subject}` : "(not on file)"}

Write a brief, professional follow-up email (under 100 words) checking in on the application status, referencing the original application politely without being pushy.

GREETING RULE: If a recruiter name is provided, start with "Dear <name>,". If no recruiter name is provided, start with "Dear Hiring Team," or "Dear Hiring Manager,". Never leave the greeting blank or use placeholders.
${masterPromptBlock(profile)}
${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    const parsed = parseJson(text);
    if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");
    res.json({ subject: sanitizeText(parsed.subject), body: sanitizeText(parsed.body) });
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/refine
router.post("/refine", async (req, res) => {
  try {
    const { currentSubject, currentBody, instruction, provider, model } = req.body;
    if (!currentBody || !instruction) return res.status(400).json({ message: "currentBody and instruction are required" });

    const userProviders = await getUserProviders(req.userId);

    const prompt = `
You are editing an existing job-application email. Apply the requested change only —
do not add new claims about the candidate that weren't already in the email.

CURRENT SUBJECT: ${currentSubject}
CURRENT BODY:
${currentBody}

REQUESTED CHANGE: ${instruction}

${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    const parsed = parseJson(text);
    if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");
    res.json({ subject: sanitizeText(parsed.subject), body: sanitizeText(parsed.body) });
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/analyze-job
router.post("/analyze-job", async (req, res) => {
  try {
    const { jobDescription, provider, model } = req.body;
    if (!jobDescription) return res.status(400).json({ message: "jobDescription is required" });

    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const userProviders = await getUserProviders(req.userId);

    const prompt = `
Analyze this job description and extract structured information. Then compare requirements
against the candidate's actual profile below — never claim the candidate has a skill that
isn't listed in their profile.

${candidateFactsBlock(profile)}

JOB DESCRIPTION:
${jobDescription}

${JSON_ONLY}, in exactly this shape:
{
  "jobTitle": "...",
  "requiredSkills": ["..."],
  "preferredSkills": ["..."],
  "experienceRequired": "...",
  "responsibilities": ["..."],
  "location": "...",
  "workMode": "Remote|Hybrid|On-site|Unknown",
  "employmentType": "Full-time|Part-time|Contract|Internship|Unknown",
  "keywords": ["..."],
  "matchingSkills": ["..."],
  "missingSkills": ["..."]
}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    res.json(parseJson(text));
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/parse-linkedin
router.post("/parse-linkedin", requireFeature("quickFill"), async (req, res) => {
  try {
    const { text, provider, model } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: "text is required" });

    const userProviders = await getUserProviders(req.userId);

    const prompt = `
You are an expert at parsing LinkedIn content. Extract structured data from the text below.

The text could be:
- A job posting / job description
- A LinkedIn profile of a recruiter or hiring manager
- A LinkedIn message from a recruiter
- Any copied LinkedIn content

Extract whatever fields are relevant. If a field is not present in the text, set it to null.

${JSON_ONLY}, in exactly this shape:
{
  "jobTitle": "string or null",
  "companyName": "string or null",
  "jobDescription": "the full job description text if found, otherwise null",
  "location": "string or null",
  "workMode": "Remote|Hybrid|On-site|null — infer from text if possible",
  "employmentType": "Full-time|Part-time|Contract|Internship|null — infer from text if possible",
  "experienceRequired": "string like '3-5 years' or null",
  "requiredSkills": ["skill1", "skill2"] or [],
  "salary": "string or null",
  "hrName": "recruiter/hiring manager name if found, otherwise null",
  "hrEmail": "email if found, otherwise null",
  "hrPhone": "phone if found, otherwise null"
}

LinkedIn text:
${text}`.trim();

    const resultText = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    res.json(parseJson(resultText));
  } catch (err) {
    cleanAiError(res, err);
  }
});

// POST /api/ai/generate-detail-reply
router.post("/generate-detail-reply", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const { requestText, recipientName, recipientEmail, templateId, applicationId, detailsOnly } = req.body;

    if (!requestText || !requestText.trim()) return res.status(400).json({ message: "requestText is required" });

    const userProviders = await getUserProviders(req.userId);

    let templateBlock = "";
    if (templateId) {
      const tmpl = await EmailTemplate.findOne({ _id: templateId, owner: req.userId });
      if (tmpl) {
        templateBlock = `\n\nSELECTED TEMPLATE STYLE: "${tmpl.name}" (type: ${tmpl.type}). Follow this template's tone and structure but fill in the candidate's actual details, not the placeholders:\n${tmpl.subject ? `Subject: ${tmpl.subject}\n` : ""}${tmpl.body}\n`;
      }
    }

    let applicationBlock = "";
    if (applicationId) {
      const app = await Application.findOne({ _id: applicationId, owner: req.userId });
      if (app) applicationBlock = `\nRELATED APPLICATION: ${app.jobTitle || ""} at ${app.companyName || ""}`.trim();
    }

    const factsBlock = detailsOnly ? limitedFactsBlock(profile) : candidateFactsBlock(profile);

    const prompt = `
You write a polite, professional reply email from a job candidate to a recruiter/HR who has asked follow-up questions. Only use facts from the candidate details below. Never invent anything.

${factsBlock}

${requestText ? `HR / recruiter request text:\n${requestText}\n` : ""}${applicationBlock}${templateBlock}

STYLE:
- Open clearly (e.g. "Dear <name>," or "Hello <name>,") — if a recipient name is known use it, otherwise "Dear Hiring Team,"
- Answer each requested detail using ONLY the candidate details above. Do not include CTC, notice period, salary, experience, or any other personal data not listed above.
- Keep it concise, professional and confident. Use proper paragraphs. No brackets around URLs — write each link as a clean URL on its own line in the signature.
- If a requested detail is not in the candidate details, state that you are happy to share it separately rather than guessing.
${masterPromptBlock(profile)}

Candidate name: ${profile?.name || "the candidate"}
Recipient name: ${recipientName || "(unknown)"}
${recipientEmail ? `Recipient email: ${recipientEmail}` : ""}

${JSON_ONLY}, in exactly this shape:
{"subject": "...", "body": "..."}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: req.body.provider, preferModel: req.body.model });
    const parsed = parseJson(text);
    if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");
    res.json({ subject: sanitizeText(parsed.subject), body: sanitizeText(parsed.body) });
  } catch (err) {
    cleanAiError(res, err);
  }
});

export default router;
