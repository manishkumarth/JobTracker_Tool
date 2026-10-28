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
}) {
  if (!application?.jobTitle) throw new Error("jobTitle is required");

  const prompt = `
You are an assistant that writes truthful, personalized job application emails.

${candidateFactsBlock(profile)}

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

GREETING RULE: If a recruiter name is provided, start with "Dear <name>,". If no recruiter name is provided, start with "Dear Hiring Team," or "Dear Hiring Manager,". Never leave the greeting blank or use placeholders.
${masterPromptBlock(profile)}
${JSON_ONLY}, in exactly this shape:
{"subject": "...", "body": "..."}`.trim();

  const text = await callLLM({ userProviders, prompt, preferProvider: provider, preferModel: model });
  const parsed = parseJson(text);
  if (!parsed.subject || !parsed.body) throw new Error("LLM returned an unexpected format");

  return { subject: sanitizeText(parsed.subject), body: sanitizeText(parsed.body) };
}
