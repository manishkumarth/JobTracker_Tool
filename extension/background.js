const DEFAULT_API_BASE = "https://j-tracker-tool.vercel.app/api";
const VALID_WORK_MODE = ["Remote", "Hybrid", "On-site"];
const VALID_EMPLOYMENT = ["Full-time", "Part-time", "Contract", "Internship"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 24-hour dedup on the extension side: key = "email|jobTitle", value = timestamp.
// Prevents re-calling the backend for the same recipient within 24 hours.
const sentEmailKeys = new Map();

function isRecentlySent(email, jobTitle) {
  if (!email) return false;
  const key = `${email.toLowerCase()}|${(jobTitle || "").trim().toLowerCase()}`;
  const ts = sentEmailKeys.get(key);
  if (!ts) return false;
  return Date.now() - ts < 24 * 60 * 60 * 1000;
}

function markSent(email, jobTitle) {
  if (!email) return;
  const key = `${email.toLowerCase()}|${(jobTitle || "").trim().toLowerCase()}`;
  sentEmailKeys.set(key, Date.now());
  // Clean up old entries
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, v] of sentEmailKeys.entries()) {
    if (v < cutoff) sentEmailKeys.delete(k);
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function getRaw() {
  return chrome.storage.local.get([
    "jt_api_base",
    "jt_token",
    "jt_user",
    "jt_auto_send",
    "jt_rejected",
    "jt_scroll_min_ms",
    "jt_scroll_max_ms",
    "jt_auto_save_on_scroll",
  ]);
}

async function getState() {
  const s = await getRaw();
  return {
    apiBase: s.jt_api_base || DEFAULT_API_BASE,
    token: s.jt_token || "",
    user: s.jt_user || null,
    autoSend: !!s.jt_auto_send,
    rejected: s.jt_rejected || [],
    scrollMinMs: typeof s.jt_scroll_min_ms === "number" ? s.jt_scroll_min_ms : 2500,
    scrollMaxMs: typeof s.jt_scroll_max_ms === "number" ? s.jt_scroll_max_ms : 7000,
    autoSaveOnScroll: !!s.jt_auto_save_on_scroll,
  };
}

function cleanBase(base) {
  let cleaned = (base || "").trim();
  // Fix common typos: "https//..." or "http//..." missing the colon
  cleaned = cleaned.replace(/^(https?)\/\//i, "$1://");
  // Ensure we always end up with a usable absolute URL
  if (cleaned && !/^https?:\/\//i.test(cleaned)) {
    cleaned = "https://" + cleaned.replace(/^\/+/, "");
  }
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned || DEFAULT_API_BASE;
}

async function api(path, { method = "GET", body, token, apiBase } = {}) {
  const base = apiBase || (await getState()).apiBase;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach JobTrackr at ${base}. Is the server running?`, 0, null);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

async function login({ email, password }) {
  // API base is fixed in code — not configurable from the popup
  const base = DEFAULT_API_BASE;
  const data = await api("/auth/login", { method: "POST", body: { email, password }, apiBase: base });
  await chrome.storage.local.set({ jt_api_base: base, jt_token: data.token, jt_user: data.user });
  return { ok: true, state: await getState() };
}

async function refreshUser() {
  const s = await getState();
  if (!s.token) return { ok: true, state: s };
  try {
    const user = await api("/auth/me", { token: s.token });
    const mini = {
      id: user._id,
      name: user.name,
      email: user.email,
      gmailConnected: user.gmailConnected,
      gmailAddress: user.gmailAddress,
      isAdmin: user.isAdmin,
      isDisabled: user.isDisabled,
      features: user.features,
    };
    await chrome.storage.local.set({ jt_user: mini });
    return { ok: true, state: await getState() };
  } catch (err) {
    if (err.status === 401) {
      await chrome.storage.local.remove(["jt_token", "jt_user"]);
      return { ok: true, state: await getState() };
    }
    return { ok: true, state: { ...s, offline: true } };
  }
}

async function logout() {
  const s = await getState();
  if (s.token) {
    try {
      await api("/auth/logout", { method: "POST", token: s.token });
    } catch {}
  }
  await chrome.storage.local.remove(["jt_token", "jt_user"]);
  return { ok: true, state: await getState() };
}

async function setSettings({ apiBase, autoSend, scrollMinMs, scrollMaxMs, autoSaveOnScroll }) {
  const patch = {};
  if (typeof apiBase === "string") patch.jt_api_base = cleanBase(apiBase);
  if (typeof autoSend === "boolean") patch.jt_auto_send = autoSend;
  if (typeof scrollMinMs === "number" && scrollMinMs >= 1000) patch.jt_scroll_min_ms = Math.round(scrollMinMs);
  if (typeof scrollMaxMs === "number" && scrollMaxMs >= 1000) patch.jt_scroll_max_ms = Math.round(scrollMaxMs);
  if (typeof autoSaveOnScroll === "boolean") patch.jt_auto_save_on_scroll = autoSaveOnScroll;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  return { ok: true, state: await getState() };
}

async function rejectJob({ url }) {
  if (!url) return { ok: true };
  const s = await getRaw();
  const list = s.jt_rejected || [];
  if (!list.includes(url)) {
    list.unshift(url);
    await chrome.storage.local.set({ jt_rejected: list.slice(0, 1000) });
  }
  return { ok: true };
}

function deriveTitle(text) {
  const lines = (text || "").split("\n").map((l) => l.trim());
  return lines.find((l) => l.length > 3 && l.length < 120) || "";
}

function setBadge(text, color) {
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch {}
}

function clearBadge() {
  try {
    chrome.action.setBadgeText({ text: "" });
  } catch {}
}

async function saveJob({ text, url }) {
  const s = await getState();
  if (!s.token) {
    return { ok: false, code: "NOT_LOGGED_IN", error: "Log in from the JobTrackr extension popup first." };
  }
  const token = s.token;

  // Only dedup when we have a real per-post URL (contains a URN). The floating
  // button fallback passes the feed URL, which would falsely match every save.
  const isPerPostUrl = /\/feed\/update\/urn:li:activity/.test(url);
  if (url && isPerPostUrl) {
    const check = await api(`/ext/check?url=${encodeURIComponent(url)}`, { token });
    if (check.exists) return { ok: true, already: true, application: check.application };
  }

  let parsed = {};
  let parseFailed = false;
  try {
    parsed = (await api("/ai/parse-linkedin", { method: "POST", body: { text }, token })) || {};
  } catch (err) {
    if (err.status === 403) throw err;
    parseFailed = true;
  }

  // Reject if both email and job title are missing (user requested auto-save filter)
  const jobTitleFound = !!(parsed.jobTitle || "").trim() || !!deriveTitle(text);
  const emailFound = !!(parsed.hrEmail || "").trim() && EMAIL_RE.test((parsed.hrEmail || "").trim());
  if (!jobTitleFound || !emailFound) {
    return {
      ok: true,
      rejected: true,
      error: !emailFound && !jobTitleFound
        ? "Rejected: email and job title not found"
        : !emailFound
          ? "Rejected: recruiter email not found"
          : "Rejected: job title not found",
    };
  }

  const payload = {
    jobTitle: (parsed.jobTitle || "").trim() || deriveTitle(text) || "LinkedIn job post",
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
    // Gate save behind resume-notes match: only save if a resume's role notes
    // match the job title. The backend rejects (422) when nothing matches.
    checkResume: true,
  };
  if (VALID_WORK_MODE.includes(parsed.workMode)) payload.workMode = parsed.workMode;
  if (VALID_EMPLOYMENT.includes(parsed.employmentType)) payload.employmentType = parsed.employmentType;

  let application;
  try {
    const created = await api("/applications", { method: "POST", body: payload, token });
    application = created?.application || created;
  } catch (err) {
    // 422 = no resume note matches → reject the post, don't save
    if (err.status === 422) {
      return {
        ok: true,
        rejected: true,
        error: err.data?.message || "No resume note matches this job title.",
        code: "NO_RESUME_MATCH",
        resumes: err.data?.resumes,
        jobTitle: err.data?.jobTitle,
      };
    }
    // 409 = duplicate application already saved today → skip quietly
    if (err.status === 409) {
      return {
        ok: true,
        rejected: true,
        already: true,
        error: err.data?.message || "Duplicate application already saved today.",
        code: "DUPLICATE_APPLICATION",
        application: err.data?.existing || null,
      };
    }
    throw err;
  }
  if (!application || !application._id) {
    throw new ApiError(created?.message || "Save failed: empty application response", 0, created);
  }

  let emailSent = false;
  let emailSkipped = "";
  if (s.autoSend) {
    const hrEmail = (parsed.hrEmail || "").trim().toLowerCase();
    if (hrEmail && EMAIL_RE.test(hrEmail)) {
      // Extension-side 24-hour dedup: skip if we already sent to this recipient
      // for this job title within the last 24 hours.
      if (isRecentlySent(hrEmail, application.jobTitle)) {
        emailSkipped = `Already sent to ${hrEmail} within the last 24 hours.`;
      } else {
        try {
          const auto = await api("/mail/auto-send", {
            method: "POST",
            token,
            body: { applicationId: application._id },
          });
          emailSent = !!auto.emailSent;
          if (emailSent) markSent(hrEmail, application.jobTitle);
          if (!emailSent) emailSkipped = "Email could not be sent";
        } catch (err) {
          // 409 = 24-hour dedup from backend
          if (err.status === 409) {
            emailSkipped = err.data?.message || "Already sent recently.";
            markSent(hrEmail, application.jobTitle);
          } else {
            emailSkipped = err.data?.message || err.message || "Email could not be sent";
          }
        }
      }
    } else {
      emailSkipped = "No recruiter email found in the post - saved without sending.";
    }
  }

  setBadge("OK", "#16a34a");
  setTimeout(clearBadge, 4000);

  return {
    ok: true,
    already: false,
    application: {
      id: application._id,
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      status: application.status,
    },
    emailSent,
    emailSkipped,
    parseFailed,
  };
}

async function handleMessage(msg) {
  switch (msg?.type) {
    case "getState":
      return { ok: true, state: await getState() };
    case "refreshUser":
      return refreshUser();
    case "login":
      return login(msg);
    case "logout":
      return logout();
    case "setSettings":
      return setSettings(msg);
    case "saveJob":
      return saveJob(msg);
    case "rejectJob":
      return rejectJob(msg);
    default:
      return { ok: false, error: `Unknown message: ${msg?.type}` };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(async (err) => {
      if (err.status === 401) await chrome.storage.local.remove(["jt_token", "jt_user"]);
      sendResponse({
        ok: false,
        error: err.message || "Something went wrong",
        status: err.status || 0,
        data: err.data || null,
      });
    });
  return true;
});
