// Shared prompt helpers used by every AI email generator.
// Keeping these in one place means the application auto-send flow and the
// manual AI routes always describe the candidate in exactly the same way.

export const JSON_ONLY = "Respond ONLY with raw JSON, no markdown fences, no preamble";

// Appends the user's own master prompt (stored in their profile) to any AI prompt.
export const masterPromptBlock = (profile) =>
  profile?.masterPrompt?.trim()
    ? `\n\nUSER MASTER PROMPT (always follow these instructions):\n${profile.masterPrompt.trim()}\n`
    : "";

// Builds the anti-hallucination guardrail block shared by every prompt.
export const buildLinksLine = (profile) => {
  const parts = [];
  if (profile?.linkedin?.trim()) parts.push(`LinkedIn: ${profile.linkedin.trim()}`);
  if (profile?.github?.trim()) parts.push(`GitHub: ${profile.github.trim()}`);
  if (profile?.portfolio?.trim()) parts.push(`Portfolio: ${profile.portfolio.trim()}`);
  return parts.length ? parts.join(" | ") : "(none provided)";
};

export const buildContactLine = (profile) => {
  const parts = [];
  if (profile?.email?.trim()) parts.push(`Email: ${profile.email.trim()}`);
  if (profile?.phone?.trim()) parts.push(`Phone: ${profile.phone.trim()}`);
  if (profile?.location?.trim()) parts.push(`Location: ${profile.location.trim()}`);
  return parts.length ? parts.join(" , ") : "(not provided)";
};

export const candidateFactsBlock = (profile) => `
CANDIDATE FACTS (the ONLY truth you may use about the candidate — never invent anything beyond this):
Name: ${profile?.name || "(not provided)"}
Title: ${profile?.professionalTitle || "(not provided)"}
Experience: ${profile?.experience || "(not provided)"}
Current company: ${profile?.currentCompany || "(not provided)"}
Current CTC: ${profile?.currentCTC || "(not provided)"}
Expected CTC: ${profile?.expectedCTC || "(not provided)"}
Notice period: ${profile?.noticePeriod || "(not provided)"}
Contact details: ${buildContactLine(profile)}
Skills: ${(profile?.skills || []).join(", ") || "(none listed)"}
Technologies: ${(profile?.technologies || []).join(", ") || "(none listed)"}
Previous companies: ${(profile?.previousCompanies || []).join(", ") || "(none listed)"}
Projects: ${(profile?.projects || []).join(", ") || "(none listed)"}
Education: ${profile?.education || "(not provided)"}
Links: ${buildLinksLine(profile)}
Additional info: ${profile?.additionalInfo || "(none)"}

STRICT RULES:
- Never claim a skill, technology, company, project, certification, or years of experience that is not listed above.
- When including links (LinkedIn/GitHub/Portfolio), copy them EXACTLY as a clean URL string with NO brackets or parentheses. Each link on its own line in the signature.
- When including contact details (phone/email), write them plainly as "Phone: <number>" and "Email: <address>" — never garble digits or brackets.
- If the job wants something the candidate doesn't have, simply don't mention it — do not apologize for the gap either.
- Do not invent job titles, achievements, or responsibilities.
`.trim();

// Some models emit stray square brackets / empty lists — strip them from output.
export const sanitizeText = (text) =>
  (text || "")
    .replace(/\[\s*\]/g, "")
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim();

// Limited candidate facts for HR replies: only name, email, contact, portfolio,
// LinkedIn, GitHub. No CTC, notice period, experience, or other salary details.
export const limitedFactsBlock = (profile) => {
  const parts = [];
  if (profile?.name?.trim()) parts.push(`Name: ${profile.name.trim()}`);
  if (profile?.email?.trim()) parts.push(`Email: ${profile.email.trim()}`);
  if (profile?.phone?.trim()) parts.push(`Phone: ${profile.phone.trim()}`);
  if (profile?.location?.trim()) parts.push(`Location: ${profile.location.trim()}`);
  if (profile?.portfolio?.trim()) parts.push(`Portfolio: ${profile.portfolio.trim()}`);
  if (profile?.linkedin?.trim()) parts.push(`LinkedIn: ${profile.linkedin.trim()}`);
  if (profile?.github?.trim()) parts.push(`GitHub: ${profile.github.trim()}`);
  return parts.length ? `CANDIDATE DETAILS (only these may be used — nothing else):\n${parts.join("\n")}` : "CANDIDATE DETAILS: (none provided)";
};
