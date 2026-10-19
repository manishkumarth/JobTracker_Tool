import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProfile } from "../api/profile";
import { listResumes } from "../api/resumes";
import { createApplication } from "../api/applications";
import { parseLinkedIn, generateEmail } from "../api/ai";
import { sendMail } from "../api/emails";

const ROLE_KEYWORDS = [
  ["java", "spring", "spring boot", "j2ee", "hibernate"],
  ["react", "reactjs", "react.js"],
  ["frontend", "front end", "front-end", "angular", "vue", "javascript", "typescript"],
  ["fullstack", "full stack", "full-stack", "mean", "mern"],
  ["backend", "back end", "back-end", "node", "django", "express"],
  ["devops", "aws", "cloud", "sre", "infrastructure"],
  ["data", "ml", "machine learning", "ai", "analytics"],
  ["mobile", "android", "ios", "flutter", "react native"],
];

function matchResume(jobTitle, jobDesc, requiredSkills = [], resumes = []) {
  const jobText = `${jobTitle} ${jobDesc} ${(requiredSkills || []).join(" ")}`.toLowerCase();
  const titleText = (jobTitle || "").toLowerCase();
  const resumeText = (r) => `${r.originalName || ""} ${r.notes || ""}`.toLowerCase();
  const matchedGroups = ROLE_KEYWORDS.filter((kw) => kw.some((k) => titleText.includes(k)));
  const descGroups = matchedGroups.length ? matchedGroups : ROLE_KEYWORDS.filter((kw) => kw.some((k) => jobText.includes(k)));
  const allKw = descGroups.flat();
  let selected = allKw.length ? resumes.find((r) => allKw.some((k) => resumeText(r).includes(k))) : null;
  if (!selected) selected = resumes.find((r) => r.isDefault) || resumes[0];
  return selected;
}

export async function saveLinkedInPost({ text, url }) {
  const token = await AsyncStorage.getItem("token");
  if (!token) throw new Error("Not logged in");

  // 1. Parse
  let parsed = {};
  try {
    parsed = await parseLinkedIn(text);
  } catch (e) {
    if (e?.response?.status === 403) throw e;
    parsed = {};
  }

  // 2. Save application
  const payload = {
    jobTitle: (parsed.jobTitle || "").trim() || "LinkedIn job post",
    companyName: (parsed.companyName || "").trim(),
    jobDescription: parsed.jobDescription || text || "",
    location: parsed.location || "",
    salary: parsed.salary || "",
    experienceRequired: parsed.experienceRequired || "",
    requiredSkills: Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills.filter(Boolean).slice(0, 30) : [],
    hrName: parsed.hrName || "",
    hrEmail: parsed.hrEmail || "",
    hrPhone: parsed.hrPhone || "",
    jobUrl: url || "",
    jobSource: "LinkedIn",
    status: "SAVED",
  };

  const application = await createApplication(payload);

  // 3. Optional auto-send
  const autoSend = (await AsyncStorage.getItem("autoSend")) === "true";
  if (autoSend) {
    const hrEmail = (parsed.hrEmail || "").trim().toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (hrEmail && EMAIL_RE.test(hrEmail)) {
      let resumeId;
      try {
        let resumes = [];
        try {
          const r = await lr();
          resumes = r.resumes || [];
        } catch {
          const prof = await getProfile();
          resumes = prof?.resumes || [];
        }
        const matched = matchResume(parsed.jobTitle, parsed.jobDescription, parsed.requiredSkills, resumes);
        resumeId = matched?._id;
      } catch {}
      try {
        const draft = await generateEmail({ applicationId: application._id });
        await sendMail({
          applicationId: application._id,
          recipientEmail: hrEmail,
          recipientName: parsed.hrName || "",
          subject: draft.subject,
          message: draft.body,
          resumeId,
          emailType: "Job Application",
          isAiGenerated: true,
        });
      } catch (e) {
        console.warn("Auto-send failed", e);
      }
    }
  }

  return application;
}
