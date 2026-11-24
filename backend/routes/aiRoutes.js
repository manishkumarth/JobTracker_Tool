import express from "express";
import User from "../models/User.js";
import CandidateProfile from "../models/CandidateProfile.js";
import Application from "../models/Application.js";
import EmailTemplate from "../models/EmailTemplate.js";
import EmailLog from "../models/EmailLog.js";
import authMiddleware from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGuard.js";
import { callLLM, parseJson } from "../utils/llmClient.js";
import { candidateFactsBlock, masterPromptBlock, JSON_ONLY, sanitizeText, requestedDetailsBlock } from "../utils/candidatePrompt.js";
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
    const { requestText, recipientName, recipientEmail, templateId, applicationId } = req.body;

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

    // `detailsOnly` used to strip CTC / notice period / experience from the
    // facts, which made the reply skip exactly what HR asked for. The full
    // facts are still the only source of truth; the checklist below makes sure
    // asked-for details are actually answered.
    const factsBlock = candidateFactsBlock(profile);
    const requestedBlock = requestedDetailsBlock(profile, requestText);

    const prompt = `
You write a polite, professional reply email from a job candidate to a recruiter/HR who has asked follow-up questions. Only use facts from the candidate details below. Never invent anything.

${factsBlock}
${requestedBlock ? `\n${requestedBlock}\n` : ""}
${requestText ? `HR / recruiter request text:\n${requestText}\n` : ""}${applicationBlock}${templateBlock}

STYLE:
- Open clearly (e.g. "Dear <name>," or "Hello <name>,") — if a recipient name is known use it, otherwise "Dear Hiring Team,"
- Answer each requested detail using ONLY the candidate details above.
- When HR asks for current CTC, expected CTC, notice period, total experience, current company, location or education, state the matching value from CANDIDATE FACTS directly and briefly (for example "My current CTC is 3 LPA and my expected CTC is 4.5 LPA. My notice period is 30 days.").
- Mention CTC / notice period ONLY when asked — never volunteer them in a reply that does not mention them.
- Keep it concise, professional and confident. Use proper paragraphs. No brackets around URLs — write each link as a clean URL on its own line in the signature.
- If a requested detail is not in the candidate details, say you are happy to share it separately rather than guessing.
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

// POST /api/ai/dashboard-chat
// Ask AI about your job search data — summaries, counts, and natural-language questions.
router.post("/dashboard-chat", async (req, res) => {
  try {
    const profile = await CandidateProfile.findOne({ owner: req.userId });
    const { question } = req.body;

    const owner = req.userId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [
      totalApplications, totalCompanies, totalContacts,
      emailsSent, emailsFailed, emailsPending,
      interviewsScheduled, offers, rejected,
      recentApplications, upcomingInterviews,
      followUpsDueToday, overdueFollowUps, upcomingFollowUps,
      recentEmails,
    ] = await Promise.all([
      Application.countDocuments({ owner }),
      Company.countDocuments({ owner }),
      Contact.countDocuments({ owner }),
      EmailLog.countDocuments({ owner, status: "Sent" }),
      EmailLog.countDocuments({ owner, status: "Failed" }),
      EmailLog.countDocuments({ owner, status: "Pending" }),
      Application.countDocuments({ owner, status: "INTERVIEW_SCHEDULED" }),
      Application.countDocuments({ owner, status: { $in: ["OFFER", "SELECTED"] } }),
      Application.countDocuments({ owner, status: "REJECTED" }),
      Application.find({ owner }).populate("company", "name").sort({ createdAt: -1 }).limit(10),
      Interview.find({ owner, date: { $gte: now }, result: { $in: ["Scheduled", "Rescheduled"] } })
        .populate({ path: "application", select: "jobTitle" }).sort({ date: 1 }).limit(5),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $gte: startOfToday, $lte: endOfToday } }),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $lt: startOfToday } }),
      FollowUp.countDocuments({ owner, status: "Pending", date: { $gt: endOfToday } }),
      EmailLog.find({ owner }).sort({ createdAt: -1 }).limit(5),
    ]);

    // Application status breakdown
    const statusBreakdown = await Application.aggregate([
      { $match: { owner: new (require("mongoose")).Types.ObjectId(owner) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusMap = Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count]));

    // Build context summary
    const context = `
JOB SEARCH DASHBOARD — SUMMARY FOR ${profile?.name || "the candidate"}

STATS:
- Total applications: ${totalApplications}
- Emails sent: ${emailsSent}
- Emails failed: ${emailsFailed}
- Emails pending: ${emailsPending}
- Interviews scheduled: ${interviewsScheduled}
- Offers: ${offers}
- Rejected: ${rejected}
- Total companies: ${totalCompanies}
- Total contacts: ${totalContacts}

STATUS BREAKDOWN:
${Object.entries(statusMap).map(([k, v]) => `  ${k}: ${v}`).join("\n") || "  (none)"}

FOLLOW-UPS:
- Due today: ${followUpsDueToday}
- Overdue: ${overdueFollowUps}
- Upcoming: ${upcomingFollowUps}

RECENT APPLICATIONS (latest 10):
${recentApplications.map((a, i) => `  ${i + 1}. ${a.jobTitle || "Unknown"} at ${a.companyName || a.company?.name || "Unknown"} — status: ${a.status}, applied: ${new Date(a.createdAt).toLocaleDateString()}`).join("\n") || "  (none)"}

UPCOMING INTERVIEWS:
${upcomingInterviews.map((iv, i) => `  ${i + 1}. ${iv.application?.jobTitle || "Unknown"} on ${new Date(iv.date).toLocaleDateString()}`).join("\n") || "  (none)"}

RECENT EMAILS (latest 5):
${recentEmails.map((e, i) => `  ${i + 1}. [${e.status}] ${e.subject} → ${e.recipient} (${new Date(e.createdAt).toLocaleDateString()})`).join("\n") || "  (none)"}
`.trim();

    const userProviders = await getUserProviders(req.userId);

    // If no question, return just the summary
    if (!question || !question.trim()) {
      return res.json({ summary: context, answer: null });
    }

    // Ask the AI
    const prompt = `
You are a helpful job-search assistant. The user has asked a question about their job search.
Answer concisely and accurately using ONLY the data below. If the answer isn't in the data, say so.

DASHBOARD DATA:
${context}

USER QUESTION: ${question}

Answer in plain text (no JSON). Keep it short and helpful.
`.trim();

    const answer = await callLLM({ userProviders, prompt, timeoutMs: 15000 });
    res.json({ summary: context, answer: answer.trim() });
  } catch (err) {
    console.error("Dashboard chat error:", err.message);
    res.json({ summary: null, answer: "Sorry, I couldn't process that. Please try again." });
  }
});
