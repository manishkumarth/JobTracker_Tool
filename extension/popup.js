const $ = (id) => document.getElementById(id);

let state = null;

async function send(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch {
    return { ok: false, error: "Extension background is not reachable." };
  }
}

function showError(text) {
  const el = $("login-error");
  el.textContent = text;
  el.classList.remove("hidden");
}

function hideError() {
  $("login-error").classList.add("hidden");
}

function render(s) {
  state = s;
  const loggedIn = !!(s && s.token);

  $("login-view").classList.toggle("hidden", loggedIn);
  $("account-view").classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    $("api-base").value = (s && s.apiBase) || "";
    return;
  }

  $("user-name").textContent = s.user?.name || "Account";
  $("user-email").textContent = s.user?.email || "";

  const gmail = $("gmail-status");
  if (s.user?.gmailConnected) {
    gmail.textContent = `Gmail connected: ${s.user.gmailAddress || ""}`;
    gmail.className = "status status-ok";
  } else {
    gmail.textContent = "Gmail not connected - open JobTrackr and connect it in Settings.";
    gmail.className = "status status-warn";
  }

  $("auto-send").checked = !!s.autoSend;
  $("offline-note").classList.toggle("hidden", !s.offline);
}

async function init() {
  const res = await send({ type: "refreshUser" });
  render(res && res.ok ? res.state : { apiBase: "" });
}

$("login-btn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  const apiBase = $("api-base").value.trim();

  if (!email || !password) {
    showError("Enter your email and password.");
    return;
  }

  hideError();
  const btn = $("login-btn");
  btn.disabled = true;
  btn.textContent = "Logging in...";

  const res = await send({ type: "login", email, password, apiBase });

  btn.disabled = false;
  btn.textContent = "Log in";

  if (res && res.ok) {
    render(res.state);
    return;
  }
  showError((res && res.error) || "Login failed.");
});

$("auto-send").addEventListener("change", async (e) => {
  const res = await send({ type: "setSettings", autoSend: e.target.checked });
  if (res && res.ok) state = res.state;
});

$("open-app").addEventListener("click", () => {
  const base = (state && state.apiBase) || "";
  const appUrl = base.replace(/\/api\/?$/, "");
  chrome.tabs.create({ url: appUrl || "http://localhost:5173" });
});

$("logout-btn").addEventListener("click", async () => {
  const res = await send({ type: "logout" });
  if (res && res.ok) render(res.state);
});

init();
