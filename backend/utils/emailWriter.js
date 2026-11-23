import { callLLM, parseJson } from "./llmClient.js";
import { candidateFactsBlock, masterPromptBlock, JSON_ONLY, sanitizeText } from "./candidatePrompt.js";

/**
 * Generate a job-application email draft for an application.
 * Shared by POST /api/ai/generate-email and the auto-send flow so both use
 * exactly the same prompt and candidate facts.
 */
export async function generateApplicationEmail({
  profile,
  application,
  tone = "professional",
  length = "short",
  userProviders = [],
  provider,
  model,
  timeoutMs,
  resumeExperience = null,
}) {
  if (!application?.jobTitle) throw new Error("jobTitle is required");

  const factsBlock = candidateFactsBlock(profile, resumeExperience);

  const prompt = `
You are an assistant that writes truthful, personalized job application emails.

${factsBlock}

JOB DETAILS:
Job title: ${application.jobTitle}
Company: ${application.companyName || "(not provided)"}
Recruiter name: ${application.hrName || "(unknown)"}
Job description:
${application.jobDescription || "(not provided)"}

STYLE:
Tone: ${tone || "professional"}
Length: ${length || "short"} (short = under 150 words, medium = 150-250 words)

Write a job application email. Only mention candidate skills/experience that genuinely overlap with what the job needs, drawn strictly from the candidate facts above.

GREETING RULE: If a recruiter name is provided, start with "Dear <name>,". If no recruiter name is provided, start with "Dear Hiring Team," or "Dear Hiring Manager,". Never leave the blank or use placeholders.
${masterPromptBlock(profile)}
${JSON_ONLY}, in exactly this shape:
{"subject": "...", "body": "..."}`.trim();

  const text = await callLLM({
    userProviders,
    prompt,
    preferProvider: provider,
    preferModel: model,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  const parsed = parseJson(text);
  if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");

  return { subject: sanitizeText(parsed.subject), body: sanitizeText(parsed.body) };
}

/**
 * Instant, deterministic application email used when the AI provider is slow
 * or unavailable. It only states facts from the candidate profile, so it is
 * safe to send without an LLM round-trip. This is what keeps one-click send
 * inside the serverless time budget.
 */
export function buildFallbackApplicationEmail({ profile, application, resumeExperience = null }) {
  const name = profile?.name?.trim() || "";
  const role = application?.jobTitle || "the advertised role";
  const company = application?.companyName?.trim() || "";
  const recruiter = application?.hrName?.trim() || "";

  const greeting = recruiter ? `Dear ${recruiter},` : "Dear Hiring Team,";
  const roleLine = company
    ? `I would like to apply for the ${role} position at ${company}.`
    : `I would like to apply for the ${role} position.`;

  const highlights = [];
  if (profile?.professionalTitle?.trim()) highlights.push(`my background as a ${profile.professionalTitle.trim()}`);
  const experienceText = resumeExperience != null
    ? `${resumeExperience} years`
    : (profile?.experience?.trim() || "");
  if (experienceText) highlights.push(`${experienceText} of experience`);
  const skills = (profile?.skills || []).filter(Boolean).slice(0, 5);
  if (skills.length) highlights.push(`hands-on work with ${skills.join(", ")}`);

  const highlightLine = highlights.length
    ? `I bring ${highlights.join(", ")}, which I believe fits what you are looking for.`
    : "I believe my background fits what you are looking for.";

  const links = [
    profile?.portfolio?.trim(),
    profile?.github?.trim(),
    profile?.linkedin?.trim(),
  ].filter(Boolean);

  const contactParts = [];
  if (profile?.phone?.trim()) contactParts.push(`Phone: ${profile.phone.trim()}`);
  if (profile?.email?.trim()) contactParts.push(`Email: ${profile.email.trim()}`);

  const body = [
    greeting,
    "",
    roleLine,
    "",
    highlightLine,
    "I have attached my resume for your review. I would be glad to discuss how I can contribute to your team.",
    "",
    "Thank you for your time and consideration.",
    "",
    "Best regards,",
    name || "Candidate",
    ...contactParts,
    ...links,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const subject = company
    ? `Application for ${role} at ${company}${name ? ` — ${name}` : ""}`
    : `Application for ${role}${name ? ` — ${name}` : ""}`;

  return { subject, body };
}
