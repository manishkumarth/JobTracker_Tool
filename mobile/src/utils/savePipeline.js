import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApplication } from "../api/applications";
import { parseLinkedIn } from "../api/ai";
import { autoSendApplicationEmail } from "../api/emails";

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
  };

  const application = await createApplication(payload);

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
      // Save is already complete. Generate/send in the background so the user
      // can immediately capture the next post.
      application._autoSendPending = true;
      autoSendApplicationEmail(application._id)
        .then((result) => {
          application._autoSendPending = false;
          application._autoSent = !!result.emailSent;
          if (!result.emailSent) {
            application._autoSendError = "Email could not be sent";
          }
          if (result.resume?.originalName) {
            application._autoSendResume = result.resume.originalName;
          }
          onAutoSend?.(application, result);
        })
        .catch((e) => {
          application._autoSendPending = false;
          console.warn("Auto-send application email failed", e);
          application._autoSendError =
            e?.response?.data?.message || e?.message || "send failed";
          onAutoSend?.(application, null, e);
        });
    } else {
      application._autoSendError = "No recruiter email found in the post - saved without sending.";
    }
  }

  return application;
}
