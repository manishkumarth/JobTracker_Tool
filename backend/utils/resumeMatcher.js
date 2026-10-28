// Resume ↔ job-title matching.
//
// The ONLY signal used is the role notes the user writes on each resume
// (e.g. "Full Stack Developer", "React Developer", "Node.js Developer").
// There is deliberately no default/first-resume fallback: if nothing matches
// we return matched=false and the caller must NOT send an email.
//
// This module is the single source of truth — the web client, extension and
// backend all rely on it (the client only displays the result).

const ALIASES = [
  [/\bfull[\s-]?stack\b/g, "full stack"],
  [/\bmern\b/g, "full stack"],
  [/\bmean\b/g, "full stack"],
  [/\breact\s*\.?\s*js\b/g, "react"],
  [/\breactjs\b/g, "react"],
  [/\bnode\s*\.?\s*js\b/g, "node"],
  [/\bnodejs\b/g, "node"],
  [/\bnext\s*\.?\s*js\b/g, "next"],
  [/\bexpress\s*\.?\s*js\b/g, "express"],
  [/\bvue\s*\.?\s*js\b/g, "vue"],
  [/\bangular\s*\.?\s*js\b/g, "angular"],
  [/\bfront[\s-]?end\b/g, "front end"],
  [/\bback[\s-]?end\b/g, "back end"],
  [/\bjava\s*script\b/g, "javascript"],
  [/\btype\s*script\b/g, "typescript"],
  [/\bdev[\s-]?ops\b/g, "devops"],
  [/\bmachine\s+learning\b/g, "machine learning"],
  [/\breact\s+native\b/g, "react native"],
];

// Generic words that describe the *level* of a role rather than its domain.
// They must not create a match on their own (otherwise every "developer"
// resume would match every "developer" job).
const STOPWORDS = new Set([
  "a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with",
  "developer", "developers", "development", "engineer", "engineers", "engineering",
  "programmer", "programmers", "software", "architect", "consultant", "specialist",
  "senior", "junior", "sr", "jr", "lead", "principal", "staff", "associate",
  "trainee", "intern", "internship", "entry", "mid", "level", "experienced",
  "job", "role", "position", "opening", "opportunity", "hiring", "urgent",
  "immediate", "required", "needed", "permanent", "contract", "contractor",
  "fulltime", "parttime", "remote", "hybrid", "onsite", "office", "work",
  "from", "home", "wfh", "any", "all", "multiple", "team",
]);

export function normalizeText(value) {
  let text = String(value || "").toLowerCase();
  text = text.replace(/&/g, " and ");
  for (const [pattern, replacement] of ALIASES) text = text.replace(pattern, replacement);
  return text
    .replace(/[^a-z0-9+#\s.]/g, " ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function notePhrases(notes) {
  return String(notes || "")
    .split(/[,;|\n\r/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Score one resume against a job title.
 * Returns 0 when the resume has no usable notes or no meaningful overlap.
 */
export function scoreResume(resume, jobTitle) {
  const jobTokens = new Set(tokenize(jobTitle));
  if (!jobTokens.size) return { score: 0, matchedTerms: [] };

  const noteTokens = tokenize(resume?.notes);
  if (!noteTokens.length) return { score: 0, matchedTerms: [] };

  const matchedTerms = [];
  for (const token of new Set(noteTokens)) {
    if (jobTokens.has(token)) matchedTerms.push(token);
  }

  let score = matchedTerms.length;

  // Reward a full role phrase match, e.g. notes "Full Stack Developer" vs
  // job title "Senior Full Stack Developer" beats a single shared keyword.
  for (const phrase of notePhrases(resume.notes)) {
    const phraseTokens = tokenize(phrase);
    if (phraseTokens.length >= 2 && phraseTokens.every((t) => jobTokens.has(t))) {
      score += 2;
    }
  }

  return { score, matchedTerms };
}

function publicResume(resume) {
  if (!resume) return null;
  return {
    _id: resume._id,
    originalName: resume.originalName,
    notes: resume.notes || "",
    size: resume.size,
  };
}

/**
 * Pick the best resume whose notes match the job title.
 *
 * @param {Object} opts
 * @param {Array} opts.resumes - CandidateProfile.resumes
 * @param {string} opts.jobTitle - scraped/saved application job title
 * @returns {{
 *   matched: boolean,
 *   resume: object|null,
 *   resumeId: string|null,
 *   score: number,
 *   matchedTerms: string[],
 *   reason: string|null,
 *   jobTitle: string
 * }}
 */
export function matchResumeForJob({ resumes = [], jobTitle = "" } = {}) {
  const list = Array.isArray(resumes) ? resumes : [];
  const title = String(jobTitle || "").trim();
  const base = { matched: false, resume: null, resumeId: null, score: 0, matchedTerms: [], jobTitle: title };

  if (!title) return { ...base, reason: "missing_job_title" };
  if (!list.length) return { ...base, reason: "no_resumes" };

  const withNotes = list.filter((r) => String(r?.notes || "").trim());
  if (!withNotes.length) return { ...base, reason: "no_resume_notes" };

  let best = null;
  for (const resume of withNotes) {
    const { score, matchedTerms } = scoreResume(resume, title);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { resume, score, matchedTerms };
  }

  if (!best) return { ...base, reason: "no_matching_resume" };

  return {
    matched: true,
    resume: publicResume(best.resume),
    resumeId: String(best.resume._id),
    score: best.score,
    matchedTerms: best.matchedTerms,
    reason: null,
    jobTitle: title,
  };
}

/**
 * Confirm a specific resume is a valid match for the job title.
 * Used by the mail API so a client cannot bypass matching by sending any id.
 */
export function validateResumeForJob({ resumes = [], resumeId, jobTitle = "" } = {}) {
  const match = matchResumeForJob({ resumes, jobTitle });
  if (!match.matched) return { ...match, valid: false };
  const valid = String(match.resumeId) === String(resumeId);
  return { ...match, valid };
}

// Handy for the client's "no match" explanation: every resume + whether it
// matched, without ever exposing Cloudinary URLs.
export function describeResumeMatches({ resumes = [], jobTitle = "" } = {}) {
  const list = Array.isArray(resumes) ? resumes : [];
  return list.map((resume) => {
    const notes = String(resume?.notes || "").trim();
    const { score, matchedTerms } = notes ? scoreResume(resume, jobTitle) : { score: 0, matchedTerms: [] };
    return { ...publicResume(resume), matched: score > 0, score, matchedTerms };
  });
}
