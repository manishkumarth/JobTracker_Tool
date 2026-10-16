const DEFAULT_API_BASE = "http://localhost:5000/api";
const VALID_WORK_MODE = ["Remote", "Hybrid", "On-site"];
const VALID_EMPLOYMENT = ["Full-time", "Part-time", "Contract", "Internship"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  };
}

function cleanBase(base) {
  const cleaned = (base || "").trim().replace(/\/+$/, "");
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

async function login({ email, password, apiBase }) {
  const base = cleanBase(apiBase);
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

async function setSettings({ apiBase, autoSend }) {
  const patch = {};
  if (typeof apiBase === "string") patch.jt_api_base = cleanBase(apiBase);
  if (typeof autoSend === "boolean") patch.jt_auto_send = autoSend;
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

  if (url) {
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
  };
  if (VALID_WORK_MODE.includes(parsed.workMode)) payload.workMode = parsed.workMode;
  if (VALID_EMPLOYMENT.includes(parsed.employmentType)) payload.employmentType = parsed.employmentType;

  const application = await api("/applications", { method: "POST", body: payload, token });

  let emailSent = false;
  let emailSkipped = "";
  if (s.autoSend) {
    const hrEmail = (parsed.hrEmail || "").trim().toLowerCase();
    if (hrEmail && EMAIL_RE.test(hrEmail)) {
      try {
        const draft = await api("/ai/generate-email", {
          method: "POST",
          body: { applicationId: application._id },
          token,
        });
        await api("/mail/send", {
          method: "POST",
          token,
          body: {
            applicationId: application._id,
            recipientEmail: hrEmail,
            recipientName: parsed.hrName || "",
            subject: draft.subject,
            message: draft.body,
            emailType: "Job Application",
            isAiGenerated: true,
          },
        });
        emailSent = true;
      } catch (err) {
        emailSkipped = err.data?.message || err.message || "Email could not be sent";
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
