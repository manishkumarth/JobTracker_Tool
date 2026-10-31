// Email extraction heuristics shared by the LinkedIn overlay save pipeline.
// Mirrors extension/background.js: the AI parse can miss an email that is
// plainly visible in the post, which previously caused "recruiter email not
// found" / "saved without sending" even when the post had an address.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_FIND_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const PLATFORM_EMAIL_DOMAINS = [
  "linkedin.com",
  "naukri.com",
  "indeed.com",
  "glassdoor.com",
];
const AUTOMATED_LOCAL_PARTS =
  /^(noreply|no-reply|donotreply|do-not-reply|notifications?|mailer|mailer-daemon|postmaster|abuse|support)$/i;

export function cleanEmail(raw) {
  return String(raw || "")
    .trim()
    .replace(/^[<("'\s]+/, "")
    .replace(/[>)"'.,;:\s]+$/, "")
    .toLowerCase();
}

export function isUsableEmail(email) {
  const e = cleanEmail(email);
  if (!e || !EMAIL_RE.test(e)) return false;
  const [, domain = ""] = e.split("@");
  if (PLATFORM_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) {
    return false;
  }
  const [local = ""] = e.split("@");
  if (AUTOMATED_LOCAL_PARTS.test(local)) return false;
  return true;
}

// "name [at] gmail [dot] com" → "name@gmail.com"
export function deobfuscateEmailText(text) {
  let t = String(text || "");
  if (!t) return t;
  t = t.replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, "@");
  t = t.replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, ".");
  t = t.replace(/\s+at\s+([a-z0-9.\-]+)\s+dot\s+([a-z]{2,})/gi, "@$1.$2");
  // "name at gmail.com" — skip when an @ already follows (e.g. after "(at)" was replaced)
  t = t.replace(/\s+at\s+((?![^\s]*@)[a-z0-9\-]+(?:\.[a-z0-9\-]+)+)/gi, "@$1");
  return t;
}

export function extractEmailFromText(text) {
  const direct = String(text || "").match(EMAIL_FIND_RE) || [];
  const fromDirect = direct.map(cleanEmail).find(isUsableEmail);
  if (fromDirect) return fromDirect;

  const deobfuscated = deobfuscateEmailText(text);
  const fromDeobfuscated = (deobfuscated.match(EMAIL_FIND_RE) || [])
    .map(cleanEmail)
    .find(isUsableEmail);
  return fromDeobfuscated || "";
}

/** Prefer a usable AI-extracted email, falling back to visible post text. */
export function resolveRecruiterEmail(parsedEmail, text) {
  if (isUsableEmail(parsedEmail)) return cleanEmail(parsedEmail);
  return extractEmailFromText(text);
}
