(() => {
  if (window !== window.top || window.__jtLinkedInLoaded) return;
  window.__jtLinkedInLoaded = true;

  const POST_SELECTOR =
    '[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"], .feed-shared-update-v2';
  const NESTED_SELECTOR =
    '.feed-shared-update-v2, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]';
  const TEXT_SELECTOR =
    '[class*="update-components-text"], .feed-shared-text, .feed-shared-update-v2__description';

  const rejected = new Set();

  let toastEl = null;
  let toastTimer = null;

  function send(msg) {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  }

  function showToast(text, kind) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "jt-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.remove("jt-toast-err", "jt-toast-info");
    toastEl.classList.add(kind === "err" ? "jt-toast-err" : "jt-toast-info", "jt-toast-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("jt-toast-show"), 4500);
  }

  function postUrl(el) {
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || "";
    if (urn.startsWith("urn:li:activity:")) {
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }
    const link = el.querySelector('a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn%3Ali%3Aactivity"]');
    return link ? link.href : "";
  }

  function postText(el) {
    const node = el.querySelector(TEXT_SELECTOR);
    const raw = node ? node.innerText : el.innerText;
    return (raw || "").replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000);
  }

  function applyRejection(el) {
    const url = postUrl(el);
    if (url && rejected.has(url)) el.classList.add("jt-hidden");
  }

  function inject(el) {
    const bar = document.createElement("div");
    bar.className = "jt-bar";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "jt-btn jt-save";
    save.textContent = "Save to JobTrackr";

    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "jt-btn jt-hide";
    hide.textContent = "Hide";

    bar.appendChild(save);
    bar.appendChild(hide);
    el.style.position = el.style.position || "relative";
    el.prepend(bar);

    save.addEventListener("click", async () => {
      if (save.disabled) return;
      const text = postText(el);
      if (!text) {
        showToast("Could not read this post's text.", "err");
        return;
      }
      const url = postUrl(el);

      save.disabled = true;
      save.textContent = "Saving...";

      const res = await send({ type: "saveJob", text, url });

      if (res && res.ok && res.already) {
        save.textContent = "Already saved";
        save.classList.add("jt-ok");
        return;
      }

      if (res && res.ok) {
        if (res.emailSent) {
          save.textContent = "Saved + email sent";
          showToast(`Saved "${res.application.jobTitle}" and sent the application email.`, "info");
        } else {
          save.textContent = "Saved";
          if (res.emailSkipped) showToast(res.emailSkipped, "info");
          if (res.parseFailed) showToast("Saved, but AI parsing failed - review the details in JobTrackr.", "info");
        }
        save.classList.add("jt-ok");
        return;
      }

      save.disabled = false;
      save.textContent = "Save to JobTrackr";

      if (res && res.code === "NOT_LOGGED_IN") {
        showToast("Open the JobTrackr extension popup and log in first.", "err");
        return;
      }
      if (res && res.data && res.data.featureDisabled) {
        showToast("This feature is disabled for your account - contact support.", "err");
        return;
      }
      showToast((res && res.error) || "Save failed. Try again.", "err");
    });

    hide.addEventListener("click", () => {
      const url = postUrl(el);
      if (url) {
        rejected.add(url);
        send({ type: "rejectJob", url });
      }
      el.classList.add("jt-hidden");
      showToast("Post hidden.", "info");
    });
  }

  function scan() {
    document.querySelectorAll(POST_SELECTOR).forEach((el) => {
      if (el.dataset.jtInjected) return;
      if (el.parentElement && el.parentElement.closest(NESTED_SELECTOR)) return;
      el.dataset.jtInjected = "1";
      applyRejection(el);
      inject(el);
    });
  }

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 350);
  });

  send({ type: "getState" }).then((res) => {
    if (res && res.ok && res.state) {
      (res.state.rejected || []).forEach((u) => rejected.add(u));
      scan();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();
