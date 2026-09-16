import express from "express";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import EmailLog from "../models/EmailLog.js";
import authMiddleware from "../middleware/auth.js";
import { callLLM, parseJson } from "../utils/llmClient.js";

const router = express.Router();
router.use(authMiddleware);

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

// Builds the anti-hallucination guardrail block shared by every prompt.
const candidateFactsBlock = (profile) => `
CANDIDATE FACTS (the ONLY truth you may use about the candidate — never invent anything beyond this):
Name: ${profile?.name || "(not provided)"}
Title: ${profile?.professionalTitle || "(not provided)"}
Experience: ${profile?.experience || "(not provided)"}
Skills: ${(profile?.skills || []).join(", ") || "(none listed)"}
Technologies: ${(profile?.technologies || []).join(", ") || "(none listed)"}
Previous companies: ${(profile?.previousCompanies || []).join(", ") || "(none listed)"}
Projects: ${(profile?.projects || []).join(", ") || "(none listed)"}
Education: ${profile?.education || "(not provided)"}
Portfolio/GitHub/LinkedIn: ${profile?.portfolio || ""} ${profile?.github || ""} ${profile?.linkedin || ""}
Additional info: ${profile?.additionalInfo || "(none)"}

STRICT RULES:
- Never claim a skill, technology, company, project, certification, or years of experience that is not listed above.
- If the job wants something the candidate doesn't have, simply don't mention it — do not apologize for the gap either.
- Do not invent job titles, achievements, or responsibilities.
`.trim();

const JSON_ONLY = "Respond ONLY with raw JSON, no markdown fences, no preamble";

// POST /api/ai/generate-email
router.post("/generate-email", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const { applicationId, jobTitle, companyName, jobDescription, recruiterName, tone, length, provider, model } = req.body;

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

    const userProviders = await getUserProviders(req.userId);

    const prompt = `
You are an assistant that writes truthful, personalized job application emails.

${candidateFactsBlock(profile)}

JOB DETAILS:
Job title: ${resolvedJobTitle}
Company: ${resolvedCompany || "(not provided)"}
Recruiter name: ${resolvedRecruiter || "(unknown — use a generic greeting like 'Hi there' or 'Dear Hiring Team')"}
Job description:
${resolvedDescription || "(not provided)"}

STYLE:
Tone: ${tone || "professional"}
Length: ${length || "short"} (short = under 150 words, medium = 150-250 words)

Write a job application email. Only mention candidate skills/experience that genuinely overlap with what the job needs, drawn strictly from the candidate facts above.

${JSON_ONLY}, in exactly this shape:
{"subject": "...", "body": "..."}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    const parsed = parseJson(text);
    if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");
    res.json(parsed);
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

${JSON_ONLY}:
{"subject": "...", "body": "..."}`.trim();

    const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
    const parsed = parseJson(text);
    if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");
    res.json(parsed);
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
    res.json(parsed);
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
router.post("/parse-linkedin", async (req, res) => {
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

export default router;
