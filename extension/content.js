(() => {
  if (window !== window.top || window.__jtLinkedInLoaded) return;
  window.__jtLinkedInLoaded = true;

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

  const rejected = new Set();
  const saveQueue = [];
  let queueRunning = false;
  let queueDone = 0;
  let queueFailed = 0;

  // Auto-scroll state
  let autoScrollOn = false;
  let autoScrollTimer = null;
  let scrollMinMs = 2500;
  let scrollMaxMs = 7000;
  // Auto-save visible posts while scrolling (checkbox)
  let autoSaveOnScroll = false;
  const autoSavedUrls = new Set(); // avoid re-queuing same post

  let toastEl = null;
  let toastTimer = null;
  let panelEl = null;
  let queueStatusEl = null;

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
    toastEl.classList.remove("jt-toast-err", "jt-toast-info", "jt-toast-ok");
    const cls = kind === "err" ? "jt-toast-err" : kind === "ok" ? "jt-toast-ok" : "jt-toast-info";
    toastEl.classList.add(cls, "jt-toast-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("jt-toast-show"), 5000);
  }

  function updateQueueUI() {
    if (!queueStatusEl) return;
    const pending = saveQueue.length;
    if (pending === 0 && !queueRunning) {
      queueStatusEl.textContent = queueDone || queueFailed
        ? `Done · ${queueDone} saved${queueFailed ? `, ${queueFailed} failed` : ""}`
        : "Queue empty";
      return;
    }
    queueStatusEl.textContent = queueRunning
      ? `Processing… ${pending} left · ${queueDone} done`
      : `Queued: ${pending}`;
  }

  function postUrl(el) {
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || "";
    if (urn.startsWith("urn:li:activity:")) {
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }
    const link = el.querySelector(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn%3Ali%3Aactivity"]'
    );
    return link ? link.href : "";
  }

  function postText(el) {
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

  // ---------- Save queue (non-blocking) ----------
  function enqueueSave({ text, url, button }) {
    if (!text) {
      showToast("Could not read this post's text.", "err");
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = "Queued";
      button.classList.add("jt-queued");
    }
    saveQueue.push({ text, url, button });
    updateQueueUI();
    showToast(`Added to queue (${saveQueue.length} pending)`, "info");
    processQueue();
  }

  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    updateQueueUI();

    while (saveQueue.length > 0) {
      const item = saveQueue.shift();
      updateQueueUI();
      if (item.button) {
        item.button.textContent = "Saving...";
      }

      try {
        const res = await send({ type: "saveJob", text: item.text, url: item.url });

        if (res && res.ok && res.already) {
          queueDone++;
          if (item.button) {
            item.button.textContent = "Already saved";
            item.button.classList.add("jt-ok");
          }
          showToast(`Already saved: ${res.application?.jobTitle || "post"}`, "info");
        } else if (res && res.ok && res.rejected) {
          // Backend rejected: missing email and/or job title
          queueFailed++;
          if (item.url) {
            rejected.add(item.url);
            send({ type: "rejectJob", url: item.url });
          }
          if (item.button) {
            item.button.disabled = true;
            item.button.textContent = "Rejected";
            item.button.classList.add("jt-hide");
          }
          showToast(res.error || "Rejected: email or job title not found", "info");
        } else if (res && res.ok) {
          queueDone++;
          const title = res.application?.jobTitle || "Job post";
          if (item.button) {
            item.button.textContent = res.emailSent ? "Saved + email" : "Saved";
            item.button.classList.add("jt-ok");
          }
          if (res.emailSent) {
            showToast(`✓ Saved & email sent: ${title}`, "ok");
          } else {
            showToast(`✓ Saved: ${title}`, "ok");
            if (res.emailSkipped) showToast(res.emailSkipped, "info");
          }
        } else {
          queueFailed++;
          if (item.button) {
            item.button.disabled = false;
            item.button.textContent = "Save to JobTrackr";
            item.button.classList.remove("jt-queued");
          }
          if (res && res.code === "NOT_LOGGED_IN") {
            showToast("Open JobTrackr extension and log in first.", "err");
          } else {
            showToast((res && res.error) || "Save failed.", "err");
          }
        }
      } catch (e) {
        queueFailed++;
        if (item.button) {
          item.button.disabled = false;
          item.button.textContent = "Save to JobTrackr";
          item.button.classList.remove("jt-queued");
        }
        showToast("Save failed. Try again.", "err");
      }
      updateQueueUI();
      // Small pause between queue items so we don't hammer the API
      if (saveQueue.length > 0) await sleep(600 + Math.random() * 400);
    }

    queueRunning = false;
    updateQueueUI();
    if (queueDone > 0) {
      showToast(
        `Queue finished · ${queueDone} saved${queueFailed ? `, ${queueFailed} failed` : ""}`,
        queueFailed ? "info" : "ok"
      );
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Inject Save / Hide on posts ----------
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

    save.addEventListener("click", () => {
      if (save.disabled) return;
      enqueueSave({ text: postText(el), url: postUrl(el), button: save });
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

  // Quick client-side check: does this post look like it has an email + job-title signal?
  function looksLikeJobWithEmail(text) {
    if (!text || text.length < 40) return false;
    const hasEmail = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text);
    // Job-title heuristics: common role words or "hiring" / "looking for" etc.
    const hasTitleSignal =
      /\b(hiring|looking for|we(?:'re| are) hiring|job title|position|role|opening|vacancy)\b/i.test(text) ||
      /\b(engineer|developer|designer|manager|analyst|recruiter|intern|consultant|architect|scientist|specialist)\b/i.test(text);
    return hasEmail && hasTitleSignal;
  }

  function scan() {
    document.querySelectorAll(POST_SELECTOR).forEach((el) => {
      if (el.dataset.jtInjected) return;
      if ((el.innerText || "").trim().length < 60) return;
      if (el.parentElement && el.parentElement.closest(NESTED_SELECTOR)) return;
      el.dataset.jtInjected = "1";
      applyRejection(el);
      inject(el);

      // Auto-save on scroll: only queue posts that appear to have email + job title
      if (autoSaveOnScroll && !el.classList.contains("jt-hidden")) {
        const url = postUrl(el);
        const text = postText(el);
        if (url && !autoSavedUrls.has(url) && !rejected.has(url) && looksLikeJobWithEmail(text)) {
          autoSavedUrls.add(url);
          const saveBtn = el.querySelector(".jt-btn.jt-save");
          enqueueSave({ text, url, button: saveBtn || null });
        } else if (url && !autoSavedUrls.has(url) && !looksLikeJobWithEmail(text)) {
          // Reject posts missing email and/or job-title signals
          autoSavedUrls.add(url);
          rejected.add(url);
          el.classList.add("jt-hidden");
          send({ type: "rejectJob", url });
        }
      }
    });
    ensurePanel();
  }

  // ---------- Control panel (queue status + auto-scroll) ----------
  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return;

    panelEl = document.createElement("div");
    panelEl.className = "jt-panel";
    panelEl.innerHTML = `
      <div class="jt-panel-title">JobTrackr</div>
      <div class="jt-queue-status" id="jt-queue-status">Queue empty</div>
      <button type="button" class="jt-panel-btn jt-save-visible" id="jt-save-visible">Save visible post</button>
      <label class="jt-checkbox-row">
        <input type="checkbox" id="jt-auto-save" />
        <span>Auto-save on scroll</span>
      </label>
      <div class="jt-hint">Only saves posts that have both email + job title; others are rejected/hidden</div>
      <div class="jt-scroll-row">
        <button type="button" class="jt-panel-btn jt-scroll-toggle" id="jt-scroll-toggle">▶ Auto-scroll</button>
      </div>
      <div class="jt-delay-row">
        <label>Min <input type="number" id="jt-delay-min" min="1" max="60" step="0.5" value="2.5" />s</label>
        <label>Max <input type="number" id="jt-delay-max" min="1" max="120" step="0.5" value="7" />s</label>
      </div>
      <div class="jt-hint">Random delay between scrolls · human-like</div>
    `;
    document.body.appendChild(panelEl);

    queueStatusEl = panelEl.querySelector("#jt-queue-status");
    const minInput = panelEl.querySelector("#jt-delay-min");
    const maxInput = panelEl.querySelector("#jt-delay-max");
    const toggleBtn = panelEl.querySelector("#jt-scroll-toggle");
    const saveVisibleBtn = panelEl.querySelector("#jt-save-visible");

    minInput.value = (scrollMinMs / 1000).toString();
    maxInput.value = (scrollMaxMs / 1000).toString();

    minInput.addEventListener("change", () => {
      let v = parseFloat(minInput.value);
      if (!Number.isFinite(v) || v < 1) v = 1;
      if (v > 60) v = 60;
      scrollMinMs = Math.round(v * 1000);
      minInput.value = (scrollMinMs / 1000).toString();
      if (scrollMinMs > scrollMaxMs) {
        scrollMaxMs = scrollMinMs;
        maxInput.value = (scrollMaxMs / 1000).toString();
      }
      persistScrollSettings();
    });

    maxInput.addEventListener("change", () => {
      let v = parseFloat(maxInput.value);
      if (!Number.isFinite(v) || v < 1) v = 1;
      if (v > 120) v = 120;
      scrollMaxMs = Math.round(v * 1000);
      maxInput.value = (scrollMaxMs / 1000).toString();
      if (scrollMaxMs < scrollMinMs) {
        scrollMinMs = scrollMaxMs;
        minInput.value = (scrollMinMs / 1000).toString();
      }
      persistScrollSettings();
    });

    toggleBtn.addEventListener("click", () => {
      if (autoScrollOn) stopAutoScroll();
      else startAutoScroll();
    });

    const autoSaveCb = panelEl.querySelector("#jt-auto-save");
    if (autoSaveCb) {
      autoSaveCb.checked = autoSaveOnScroll;
      autoSaveCb.addEventListener("change", () => {
        autoSaveOnScroll = !!autoSaveCb.checked;
        showToast(
          autoSaveOnScroll
            ? "Auto-save ON · posts need email + job title or they are rejected"
            : "Auto-save OFF",
          "info"
        );
        if (autoSaveOnScroll) {
          // Immediately process currently visible posts
          scan();
        }
        send({ type: "setSettings", autoSaveOnScroll });
      });
    }

    saveVisibleBtn.addEventListener("click", () => {
      const target = findVisiblePost();
      if (!target) {
        showToast("No post in view. Scroll a bit and try again.", "err");
        return;
      }
      target.style.outline = "3px solid #4f46e5";
      target.style.outlineOffset = "4px";
      setTimeout(() => {
        target.style.outline = "";
        target.style.outlineOffset = "";
      }, 1500);
      enqueueSave({
        text: (target.innerText || "").replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000),
        url: location.href,
        button: null,
      });
    });

    updateQueueUI();
    updateScrollToggleUI();
  }

  function findVisiblePost() {
    const viewportCenter = window.innerHeight / 2;
    const candidates = Array.from(document.querySelectorAll("div, section, article"))
      .filter((el) => {
        const text = (el.innerText || "").trim();
        if (text.length < 120 || text.length > 6000) return false;
        if (el.closest("aside, nav, footer, header, [role='complementary'], [role='navigation']")) return false;
        if (/accessibility|help center|privacy & terms|ad choices|business services/i.test(text)) return false;
        return true;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const elCenter = rect.top + rect.height / 2;
        return { el, distanceFromCenter: Math.abs(elCenter - viewportCenter) };
      })
      .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
    return candidates[0]?.el || null;
  }

  // ---------- Human-like auto-scroll ----------
  function randomDelay() {
    const min = Math.min(scrollMinMs, scrollMaxMs);
    const max = Math.max(scrollMinMs, scrollMaxMs);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function getScrollRoot() {
    // LinkedIn feed often scrolls on documentElement / body; sometimes a main container
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector("main"),
      document.querySelector(".scaffold-finite-scroll__content"),
      document.querySelector("[data-testid='primary-column']"),
    ].filter(Boolean);
    // Prefer the element that actually can scroll
    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight + 50) return el;
    }
    return document.scrollingElement || document.documentElement;
  }

  function humanScrollStep() {
    const amount = Math.floor(window.innerHeight * (0.55 + Math.random() * 0.35));
    const root = getScrollRoot();
    try {
      if (root === document.scrollingElement || root === document.documentElement || root === document.body) {
        window.scrollBy({ top: amount, left: 0, behavior: "smooth" });
      } else {
        root.scrollBy({ top: amount, left: 0, behavior: "smooth" });
      }
    } catch {
      window.scrollBy(0, amount);
    }
  }

  function scheduleNextScroll() {
    if (!autoScrollOn) return;
    const delay = randomDelay();
    autoScrollTimer = setTimeout(() => {
      if (!autoScrollOn) return;
      humanScrollStep();
      // Re-scan posts after scroll settles
      setTimeout(() => scan(), 800);
      scheduleNextScroll();
    }, delay);
  }

  function startAutoScroll() {
    autoScrollOn = true;
    updateScrollToggleUI();
    showToast(`Auto-scroll ON · delay ${scrollMinMs / 1000}–${scrollMaxMs / 1000}s`, "info");
    // First scroll after a short pause
    autoScrollTimer = setTimeout(() => {
      if (!autoScrollOn) return;
      humanScrollStep();
      scheduleNextScroll();
    }, 800 + Math.random() * 700);
  }

  function stopAutoScroll() {
    autoScrollOn = false;
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    updateScrollToggleUI();
    showToast("Auto-scroll stopped", "info");
  }

  function updateScrollToggleUI() {
    const btn = panelEl && panelEl.querySelector("#jt-scroll-toggle");
    if (!btn) return;
    if (autoScrollOn) {
      btn.textContent = "⏹ Stop scroll";
      btn.classList.add("jt-scroll-on");
    } else {
      btn.textContent = "▶ Auto-scroll";
      btn.classList.remove("jt-scroll-on");
    }
  }

  function persistScrollSettings() {
    send({
      type: "setSettings",
      scrollMinMs,
      scrollMaxMs,
    });
  }

  // ---------- Boot ----------
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 350);
  });

  function start() {
    send({ type: "getState" }).then((res) => {
      if (res && res.ok && res.state) {
        (res.state.rejected || []).forEach((u) => rejected.add(u));
        if (typeof res.state.scrollMinMs === "number") scrollMinMs = res.state.scrollMinMs;
        if (typeof res.state.scrollMaxMs === "number") scrollMaxMs = res.state.scrollMaxMs;
        if (typeof res.state.autoSaveOnScroll === "boolean") autoSaveOnScroll = res.state.autoSaveOnScroll;
      }
      scan();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      scan();
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
        scan();
      });
    }
  }

  start();
})();
