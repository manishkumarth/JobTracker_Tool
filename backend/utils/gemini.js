import { GoogleGenerativeAI } from "@google/generative-ai";

let client = null;
const getClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client;
};

// Strips markdown code fences etc. and parses JSON safely.
const parseJson = (text) => {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
};

const model = () => getClient().getGenerativeModel({ model: "gemini-3.5-flash" });

// Builds the anti-hallucination guardrail block shared by every prompt.
const candidateFactsBlock = (profile) => `
CANDIDATE FACTS (the ONLY truth you may use about the candidate \u2014 never invent anything beyond this):
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
- If the job wants something the candidate doesn't have, simply don't mention it \u2014 do not apologize for the gap either.
- Do not invent job titles, achievements, or responsibilities.
`.trim();

export const generateApplicationEmail = async ({ profile, jobTitle, companyName, jobDescription, recruiterName, tone = "professional", length = "short" }) => {
  const prompt = `
You are an assistant that writes truthful, personalized job application emails.

${candidateFactsBlock(profile)}

JOB DETAILS:
Job title: ${jobTitle}
Company: ${companyName}
Recruiter name: ${recruiterName || "(unknown \u2014 use a generic greeting like 'Hi there' or 'Dear Hiring Team')"}
Job description:
${jobDescription || "(not provided)"}

STYLE:
Tone: ${tone}
Length: ${length} (short = under 150 words, medium = 150-250 words)

Write a job application email. Only mention candidate skills/experience that genuinely overlap with what the job needs, drawn strictly from the candidate facts above.

Respond ONLY with raw JSON, no markdown fences, no preamble, in exactly this shape:
{"subject": "...", "body": "..."}
`.trim();

  const result = await model().generateContent(prompt);
  const text = result.response.text();
  const parsed = parseJson(text);
  if (!parsed.subject || !parsed.body) throw new Error("Gemini returned an unexpected format");
  return parsed;
};

export const generateFollowUpEmail = async ({ profile, application, originalEmail }) => {
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

Respond ONLY with raw JSON, no markdown fences:
{"subject": "...", "body": "..."}
`.trim();

  const result = await model().generateContent(prompt);
  const parsed = parseJson(result.response.text());
  if (!parsed.subject || !parsed.body) throw new Error("Gemini returned an unexpected format");
  return parsed;
};

export const refineEmail = async ({ currentSubject, currentBody, instruction }) => {
  const prompt = `
You are editing an existing job-application email. Apply the requested change only \u2014
do not add new claims about the candidate that weren't already in the email.

CURRENT SUBJECT: ${currentSubject}
CURRENT BODY:
${currentBody}

REQUESTED CHANGE: ${instruction}

Respond ONLY with raw JSON, no markdown fences:
{"subject": "...", "body": "..."}
`.trim();

  const result = await model().generateContent(prompt);
  const parsed = parseJson(result.response.text());
  if (!parsed.subject || !parsed.body) throw new Error("Gemini returned an unexpected format");
  return parsed;
};

export const parseLinkedInText = async ({ text }) => {
  const prompt = `
You are an expert at parsing LinkedIn content. Extract structured data from the text below.

The text could be:
- A job posting / job description
- A LinkedIn profile of a recruiter or hiring manager
- A LinkedIn message from a recruiter
- Any copied LinkedIn content

Extract whatever fields are relevant. If a field is not present in the text, set it to null.

Respond ONLY with raw JSON, no markdown fences, in exactly this shape:
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
${text}
`.trim();

  const result = await model().generateContent(prompt);
  return parseJson(result.response.text());
};

export const analyzeJobDescription = async ({ jobDescription, profile }) => {
  const prompt = `
Analyze this job description and extract structured information. Then compare requirements
against the candidate's actual profile below \u2014 never claim the candidate has a skill that
isn't listed in their profile.

${candidateFactsBlock(profile)}

JOB DESCRIPTION:
${jobDescription}

Respond ONLY with raw JSON, no markdown fences, in exactly this shape:
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
}
`.trim();

  const result = await model().generateContent(prompt);
  return parseJson(result.response.text());
};
