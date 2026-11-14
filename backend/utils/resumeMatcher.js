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

// Seniority keywords found in job titles
const SENIORITY_LEVELS = {
  entry: ["junior", "jr", "entry", "trainee", "intern", "internship", "associate", "fresher", "new grad"],
  mid: ["mid", "middle", "mid-level", "midlevel", "experienced", "2-3 years", "3-5 years"],
  senior: ["senior", "sr", "lead", "principal", "staff", "5+ years", "5+", "7+ years", "7+"],
  executive: ["director", "vp", "head of", "chief", "cto", "ceo"],
};

function extractSeniority(text) {
  const t = String(text || "").toLowerCase();
  for (const [level, keywords] of Object.entries(SENIORITY_LEVELS)) {
    if (keywords.some((k) => t.includes(k))) return level;
  }
  return null;
}

/**
 * Parse any experience string into a numeric range (in years).
 * Handles "3-5 years", "3 – 5 yrs", "2.4 Years", "2 to 3", "6 Months - 2 Years",
 * "18 months", "5+", "at least 2".
 * @returns {{min:number,max:number|null,mid:number}|null}
 */
export function parseExperienceRange(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? { min: value, max: value, mid: value } : null;
  }

  const text = String(value)
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-"); // en/em dash -> hyphen

  // Month-based requirements are common ("6 months - 2 years"), so every
  // number is converted to years instead of being compared as a raw value.
  const unitPattern = "(months?|mos?|mo|years?|yrs?|yr)";
  const toYears = (raw, unit) => {
    const num = parseFloat(raw);
    if (!Number.isFinite(num)) return num;
    const years = /^mo/i.test(unit || "") ? num / 12 : num;
    return Math.round(years * 100) / 100;
  };

  const range = text.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unitPattern}?\\s*(?:-|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${unitPattern}?`)
  );
  let min;
  let max;

  if (range) {
    // Units can differ per bound: "6 months - 2 years".
    const firstUnit = range[2] || range[4] || "";
    const secondUnit = range[4] || range[2] || "";
    min = toYears(range[1], firstUnit);
    max = toYears(range[3], secondUnit);
    if (min > max) [min, max] = [max, min];
  } else {
    const single = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unitPattern}\\b`))
      || text.match(/(\d+(?:\.\d+)?)/);
    if (!single) return null;
    min = single[2] ? toYears(single[1], single[2]) : parseFloat(single[1]);
    max = /\d\s*\+/.test(text) ? null : min;
  }

  return { min, max, mid: max == null ? min : (min + max) / 2 };
}

// The experience range configured on a resume document (min/max fields).
function resumeExperienceRange(resume) {
  const min = resume?.experienceMin != null && resume.experienceMin !== "" ? Number(resume.experienceMin) : null;
  const max = resume?.experienceMax != null && resume.experienceMax !== "" ? Number(resume.experienceMax) : null;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;

  const lo = Number.isFinite(min) ? min : max;
  const hi = Number.isFinite(max) ? max : lo;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi), mid: (lo + hi) / 2 };
}

/**
 * Pull an experience requirement out of free text such as a job description.
 * Deliberately strict (needs "years/yrs" nearby) so numbers like "60% marks"
 * or salary figures are not mistaken for experience.
 */
export function extractExperienceFromText(text) {
  const value = String(text || "");
  if (!value) return null;

  const patterns = [
    // Ranges may mix months and years, e.g. "6 months - 2 years".
    /(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo|years?|yrs?|yr)?\s*(?:-|to|\u2013|\u2014)\s*(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo|years?|yrs?|yr)\b/i,
    /(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i,
    /(?:minimum|min\.?|at least|over)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)\b/i,
    /(?:minimum|min\.?|at least|over)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo)\b/i,
    /(\d+(?:\.\d+)?)\s*(?:months?|mos?|mo)\s*(?:of\s*)?(?:experience|exp)\b/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Resolve the experience requirement for an application. Prefers the explicit
 * field, then falls back to the job description / title.
 */
export function getApplicationExperience(application = {}) {
  return (
    application?.experienceRequired ||
    extractExperienceFromText(application?.jobDescription) ||
    extractExperienceFromText(application?.jobTitle) ||
    null
  );
}

function experienceLevelFromYears(years) {
  if (years == null) return null;
  if (years <= 2) return "entry";
  if (years <= 5) return "mid";
  if (years <= 9) return "senior";
  return "executive";
}

function experienceCompatibility(profileExperience, jobTitle, jobExperience = null) {
  if (!profileExperience) return 0;

  // Prefer an exact numeric-range comparison when both sides expose numbers.
  const jobRange = parseExperienceRange(jobExperience) || parseExperienceRange(jobTitle);
  const profileRange = parseExperienceRange(profileExperience);

  if (jobRange && profileRange) {
    const jobMax = jobRange.max == null ? jobRange.min : jobRange.max;
    const overlap = jobRange.min <= profileRange.max && profileRange.min <= jobMax;
    if (overlap) return 1;
    if (profileRange.mid > jobMax) return 0.25; // overqualified: still sendable
    return 0; // underqualified
  }

  const jobSeniority = extractSeniority(jobTitle);
  const profileYears = profileRange ? profileRange.mid : null;
  const profileLevel = profileYears != null ? experienceLevelFromYears(profileYears) : extractSeniority(profileExperience);

  if (!jobSeniority || !profileLevel) return 0;

  const levelOrder = { entry: 0, mid: 1, senior: 2, executive: 3 };
  const diff = levelOrder[profileLevel] - levelOrder[jobSeniority];

  // Same level = full compatibility, one level off = partial, more = none
  if (diff === 0) return 1;
  if (Math.abs(diff) === 1) return 0.5;
  return 0;
}

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
 * Score one resume against a job title and optional job experience requirement.
 * Returns 0 when the resume has no usable notes or no meaningful overlap.
 */
export function scoreResume(resume, jobTitle, jobExperience = null) {
  const jobTokens = new Set(tokenize(jobTitle));
  if (!jobTokens.size) return { score: 0, matchedTerms: [], experienceMatch: null };

  const noteTokens = tokenize(resume?.notes);
  if (!noteTokens.length) return { score: 0, matchedTerms: [], experienceMatch: null };

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

  // Experience range matching: job requirement (e.g. "3-5 years", "2.4 Years")
  // against the range configured on the resume (experienceMin/Max).
  const jobRange = parseExperienceRange(jobExperience);
  const resumeRange = resumeExperienceRange(resume);
  let experienceMatch = null;
  let experienceDistance = null;

  if (jobRange && resumeRange) {
    const jobMax = jobRange.max == null ? jobRange.min : jobRange.max;
    const overlaps = jobRange.min <= resumeRange.max && resumeRange.min <= jobMax;

    if (overlaps) {
      score += 2; // strong bonus when the job requirement sits in the resume range
      if (jobRange.mid >= resumeRange.min && jobRange.mid <= resumeRange.max) score += 1;
      experienceMatch = "match";
      experienceDistance = 0;
    } else {
      score -= 1; // mild penalty when the ranges do not overlap
      experienceMatch = "mismatch";
      // Gap in years, used as a tiebreaker so the closest resume wins
      // (e.g. a 3–5 year job prefers a 2–2.5 resume over a 1–2 one).
      const gap =
        jobRange.min > resumeRange.max
          ? jobRange.min - resumeRange.max
          : resumeRange.min - jobMax;
      experienceDistance = Math.max(0, Math.round(gap * 100) / 100);
    }
  } else if (jobRange && !resumeRange) {
    experienceMatch = "unknown";
  }

  return { score, matchedTerms, experienceMatch, experienceDistance, jobRange, resumeRange };
}

function publicResume(resume) {
  if (!resume) return null;
  return {
    _id: resume._id,
    originalName: resume.originalName,
    notes: resume.notes || "",
    size: resume.size,
    experienceMin: resume.experienceMin ?? null,
    experienceMax: resume.experienceMax ?? null,
  };
}

/**
 * Pick the best resume whose notes match the job title.
 *
 * @param {Object} opts
 * @param {Array} opts.resumes - CandidateProfile.resumes
 * @param {string} opts.jobTitle - scraped/saved application job title
 * @param {string} opts.profileExperience - candidate's experience string (e.g. "3 years", "Senior")
 * @param {string|number} opts.jobExperience - job's experience required (e.g. "2.5", "2")
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
export function matchResumeForJob({ resumes = [], jobTitle = "", profileExperience = "", jobExperience = null } = {}) {
  const list = Array.isArray(resumes) ? resumes : [];
  const title = String(jobTitle || "").trim();
  const base = { matched: false, resume: null, resumeId: null, score: 0, matchedTerms: [], jobTitle: title };

  if (!title) return { ...base, reason: "missing_job_title" };
  if (!list.length) return { ...base, reason: "no_resumes" };

  const withNotes = list.filter((r) => String(r?.notes || "").trim());
  if (!withNotes.length) return { ...base, reason: "no_resume_notes" };

  let best = null;
  for (const resume of withNotes) {
    const { score, matchedTerms, experienceMatch, experienceDistance } = scoreResume(resume, title, jobExperience);
    if (score <= 0) continue;
    // Add experience compatibility bonus from profile-level experience
    const expBonus = experienceCompatibility(profileExperience, title, jobExperience);
    const finalScore = score + expBonus;

    const isBetter =
      !best ||
      finalScore > best.score ||
      // When scores tie, prefer the resume whose experience range is closest
      // to the job requirement (both non-overlapping ranges get the same -1).
      (finalScore === best.score &&
        experienceDistance != null &&
        (best.experienceDistance == null || experienceDistance < best.experienceDistance));

    if (isBetter) {
      best = { resume, score: finalScore, matchedTerms, experienceMatch, experienceDistance };
    }
  }

  if (!best) return { ...base, reason: "no_matching_resume" };

  return {
    matched: true,
    resume: publicResume(best.resume),
    resumeId: String(best.resume._id),
    score: best.score,
    matchedTerms: best.matchedTerms,
    experienceMatch: best.experienceMatch,
    reason: null,
    jobTitle: title,
  };
}

/**
 * Confirm a specific resume is a valid match for the job title.
 * Used by the mail API so a client cannot bypass matching by sending any id.
 */
export function validateResumeForJob({ resumes = [], resumeId, jobTitle = "", jobExperience = null, profileExperience = "" } = {}) {
  const match = matchResumeForJob({ resumes, jobTitle, jobExperience, profileExperience });
  if (!match.matched) return { ...match, valid: false };
  const valid = String(match.resumeId) === String(resumeId);
  return { ...match, valid };
}

// Handy for the client's "no match" explanation: every resume + whether it
// matched, without ever exposing Cloudinary URLs.
export function describeResumeMatches({ resumes = [], jobTitle = "", jobExperience = null } = {}) {
  const list = Array.isArray(resumes) ? resumes : [];
  return list.map((resume) => {
    const notes = String(resume?.notes || "").trim();
    const result = notes
      ? scoreResume(resume, jobTitle, jobExperience)
      : { score: 0, matchedTerms: [], experienceMatch: null };
    return {
      ...publicResume(resume),
      matched: result.score > 0,
      score: result.score,
      matchedTerms: result.matchedTerms,
      experienceMatch: result.experienceMatch || null,
    };
  });
}
