import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApplication } from "../api/applications";
import { parseLinkedIn } from "../api/ai";
import { autoSendApplicationEmail } from "../api/emails";

const DEDUP_KEY = "jt_auto_send_dedup";

function dedupKey(email, jobTitle) {
  return `${email.toLowerCase()}|${(jobTitle || "").trim().toLowerCase()}`;
}

async function isRecentlySent(email, jobTitle) {
  if (!email) return false;
  try {
    const raw = await AsyncStorage.getItem(DEDUP_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const ts = map[dedupKey(email, jobTitle)];
    if (!ts) return false;
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

async function markSent(email, jobTitle) {
  if (!email) return;
  try {
    const raw = await AsyncStorage.getItem(DEDUP_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[dedupKey(email, jobTitle)] = Date.now();
    // Clean old entries (>24h)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, v] of Object.entries(map)) {
      if (v < cutoff) delete map[k];
    }
    await AsyncStorage.setItem(DEDUP_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Save a LinkedIn post as an application.
 * Auto-sends AI email only when `autoSendApplication` is true and an HR email is present.
 * The application is saved first; auto-send runs in the background so capture can continue.
 */
export async function saveLinkedInPost({ text, url, onAutoSend }) {
  const token = await AsyncStorage.getItem("token");
  if (!token) throw new Error("Not logged in");

  let parsed = {};
  try {
    parsed = await parseLinkedIn(text);
  } catch (e) {
    if (e?.response?.status === 403) throw e;
    parsed = {};
  }

  const payload = {
    jobTitle: (parsed.jobTitle || "").trim() || "LinkedIn job post",
    companyName: (parsed.companyName || "").trim(),
    jobDescription: parsed.jobDescription || text || "",
    location: parsed.location || "",
    salary: parsed.salary || "",
    experienceRequired: parsed.experienceRequired || "",
    requiredSkills: Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.filter(Boolean).slice(0, 30)
      : [],
    hrName: parsed.hrName || "",
    hrEmail: parsed.hrEmail || "",
    hrPhone: parsed.hrPhone || "",
    jobUrl: url || "",
    jobSource: "LinkedIn",
    status: "SAVED",
    // Gate save behind resume-notes match: only save if a resume's role notes
    // match the job title. The backend rejects (422) when nothing matches.
    checkResume: true,
  };

  let application;
  try {
    const created = await createApplication(payload);
    application = created?.application || created;
  } catch (err) {
    // 422 = no resume note matches → reject the post, don't save
    if (err?.response?.status === 422) {
      const data = err.response?.data || {};
      throw new Error(data.message || "No resume note matches this job title.");
    }
    throw err;
  }
  if (!application || !application._id) {
    throw new Error("Save failed: empty application response");
  }

  // Application auto-send (separate from Gmail auto-send)
  const autoSendApplication = (await AsyncStorage.getItem("autoSendApplication")) === "true";
  // Migrate legacy key if present
  if (!autoSendApplication) {
    const legacy = (await AsyncStorage.getItem("autoSend")) === "true";
    if (legacy) {
      await AsyncStorage.setItem("autoSendApplication", "true");
    }
  }
  const shouldAutoSend =
    (await AsyncStorage.getItem("autoSendApplication")) === "true" ||
    (await AsyncStorage.getItem("autoSend")) === "true";

  if (shouldAutoSend) {
    const hrEmail = (parsed.hrEmail || "").trim().toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (hrEmail && EMAIL_RE.test(hrEmail)) {
      // Mobile-side 24-hour dedup: skip if already sent to this recipient
      // for this job title within the last 24 hours.
      if (await isRecentlySent(hrEmail, application.jobTitle)) {
        application._autoSendPending = false;
        application._autoSendError = `Already sent to ${hrEmail} within the last 24 hours.`;
        onAutoSend?.(application, null, new Error(application._autoSendError));
      } else {
        // Save is already complete. Generate/send in the background so the user
        // can immediately capture the next post.
        application._autoSendPending = true;
        autoSendApplicationEmail(application._id)
          .then(async (result) => {
            application._autoSendPending = false;
            application._autoSent = !!result.emailSent;
            if (application._autoSent) await markSent(hrEmail, application.jobTitle);
            if (!result.emailSent) {
              application._autoSendError = "Email could not be sent";
            }
            if (result.resume?.originalName) {
              application._autoSendResume = result.resume.originalName;
            }
            onAutoSend?.(application, result);
          })
          .catch(async (e) => {
            application._autoSendPending = false;
            // 409 = backend 24-hour dedup
            if (e?.response?.status === 409) {
              await markSent(hrEmail, application.jobTitle);
              application._autoSendError = e?.response?.data?.message || "Already sent recently.";
            } else {
              console.warn("Auto-send application email failed", e);
              application._autoSendError = e?.response?.data?.message || e?.message || "send failed";
            }
            onAutoSend?.(application, null, e);
          });
      }
    } else {
      application._autoSendError = "No recruiter email found in the post - saved without sending.";
    }
  }

  return application;
}
