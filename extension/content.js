(() => {
  if (window !== window.top || window.__jtLinkedInLoaded) return;
  window.__jtLinkedInLoaded = true;

  // LinkedIn changes their markup often. Try several known containers; the first
  // match that actually contains job-post-like text wins.
  const POST_SELECTORS = [
    '[data-urn^="urn:li:activity"]',
    '[data-id^="urn:li:activity"]',
    '.feed-shared-update-v2',
    'div[data-view-name="feed-full-update"]',
    'article',
    'div.occludable-update',
  ];
  const POST_SELECTOR = POST_SELECTORS.join(', ');
  const NESTED_SELECTOR =
    '.feed-shared-update-v2, [data-urn^="urn:li:activity"], [data-id^="urn:li:activity"], div[data-view-name="feed-full-update"]';
  const TEXT_SELECTORS = [
    '[class*="update-components-text"]',
    '.feed-shared-text',
    '.feed-shared-update-v2__description',
    '[data-test-id="main-feed-activity-card"] .break-words',
    'span.break-words',
    'div.update-components-text',
  ];
  const TEXT_SELECTOR = TEXT_SELECTORS.join(', ');

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
    // Try the most specific text container first, then fall back to the whole element.
    let node = null;
    for (const sel of TEXT_SELECTORS) {
      node = el.querySelector(sel);
      if (node && (node.innerText || "").trim().length > 40) break;
    }
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
    let found = 0;
    document.querySelectorAll(POST_SELECTOR).forEach((el) => {
      if (el.dataset.jtInjected) return;
      // Skip tiny elements (icons, buttons) — only inject into real posts
      if ((el.innerText || "").trim().length < 60) return;
      if (el.parentElement && el.parentElement.closest(NESTED_SELECTOR)) return;
      el.dataset.jtInjected = "1";
      applyRejection(el);
      inject(el);
      found++;
    });
    if (found === 0) {
      // Fallback: LinkedIn may have changed markup. Inject a floating button
      // the user can click to capture the currently visible post.
      ensureFloatingButton();
    }
  }

  let floatingBtn = null;
  function ensureFloatingButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement("button");
    floatingBtn.type = "button";
    floatingBtn.className = "jt-float";
    floatingBtn.textContent = "Save visible post to JobTrackr";
    document.body.appendChild(floatingBtn);
    floatingBtn.addEventListener("click", async () => {
      // Grab the largest text block currently in view
      // Find the post closest to the top of the viewport (most recently scrolled into view)
      const viewportTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const viewportCenter = viewportHeight / 2;
      const candidates = Array.from(document.querySelectorAll("div, section, article"))
        .filter((el) => {
          const text = (el.innerText || "").trim();
          // Skip tiny or huge blocks; skip sidebars/footers/navs
          if (text.length < 120 || text.length > 6000) return false;
          if (el.closest("aside, nav, footer, header, [role='complementary'], [role='navigation']")) return false;
          // Skip elements that look like the footer/sidebar (contain "Accessibility" etc.)
          if (/accessibility|help center|privacy & terms|ad choices|business services/i.test(text)) return false;
          return true;
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const elCenter = rect.top + rect.height / 2;
          const distanceFromCenter = Math.abs(elCenter - viewportCenter);
          return { el, text: (el.innerText || "").trim(), distanceFromCenter, rect };
        })
        .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
      const target = candidates[0]?.el;

      // Highlight the chosen element briefly so the user can see what's being saved
      if (target) {
        target.style.outline = "3px solid #4f46e5";
        target.style.outlineOffset = "4px";
        setTimeout(() => { target.style.outline = ""; target.style.outlineOffset = ""; }, 2000);
      }
      if (!target) {
        showToast("Could not find a post on this page.", "err");
        return;
      }
      const text = (target.innerText || "").replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000);
      if (!text) {
        showToast("Could not read post text.", "err");
        return;
      }
      floatingBtn.disabled = true;
      floatingBtn.textContent = "Saving...";
      const url = location.href;
      const res = await send({ type: "saveJob", text, url });
      floatingBtn.disabled = false;
      floatingBtn.textContent = "Save visible post to JobTrackr";
      if (res && res.ok) {
        if (res.already) showToast("Already saved.", "info");
        else if (res.emailSent) showToast(`Saved "${res.application.jobTitle}" and sent email.`, "info");
        else showToast(`Saved "${res.application.jobTitle}".`, "info");
      } else {
        showToast((res && res.error) || "Save failed.", "err");
      }
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
