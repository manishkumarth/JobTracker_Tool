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
      toastEl.style.zIndex = "2147483647";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.remove("jt-toast-err", "jt-toast-info", "jt-toast-ok");
    const cls = kind === "err" ? "jt-toast-err" : kind === "ok" ? "jt-toast-ok" : "jt-toast-info";
    toastEl.classList.add(cls, "jt-toast-show");
    clearTimeout(toastTimer);
    // Errors / rejections stay longer so you can read them at the top
    const ms = kind === "err" ? 8000 : 5000;
    toastTimer = setTimeout(() => toastEl.classList.remove("jt-toast-show"), ms);
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
    if (!el) return "";
    const urn =
      el.getAttribute("data-urn") ||
      el.getAttribute("data-id") ||
      el.getAttribute("data-activity-urn") ||
      "";
    if (urn && urn.includes("activity")) {
      const clean = urn.startsWith("urn:") ? urn : `urn:li:activity:${urn}`;
      return `https://www.linkedin.com/feed/update/${clean}/`;
    }
    // Nested URN on children
    const urnNode = el.querySelector("[data-urn*='activity'], [data-id*='activity']");
    if (urnNode) {
      const u = urnNode.getAttribute("data-urn") || urnNode.getAttribute("data-id") || "";
      if (u.includes("activity")) {
        return `https://www.linkedin.com/feed/update/${u}/`;
      }
    }
    const link = el.querySelector(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn%3Ali%3Aactivity"], a[href*="activity:"]'
    );
    if (link && link.href) return link.href.split("?")[0];
    return "";
  }

  // Stable key even when LinkedIn hides the activity URN
  function postKey(el, text) {
    const url = postUrl(el);
    if (url) return url;
    const sample = (text || postText(el) || "").slice(0, 180).replace(/\s+/g, " ");
    let h = 0;
    for (let i = 0; i < sample.length; i++) h = ((h << 5) - h + sample.charCodeAt(i)) | 0;
    return `fingerprint:${h}:${sample.length}`;
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

  /** Click LinkedIn "…more" / "see more" so full post text (and emails) become visible */
  function expandSeeMore(el) {
    if (!el) return 0;
    let clicks = 0;
    const candidates = el.querySelectorAll(
      'button, span[role="button"], a[role="button"], .feed-shared-inline-show-more-text, [class*="show-more"], [class*="see-more"]'
    );
    candidates.forEach((btn) => {
      const t = ((btn.innerText || btn.textContent || "") + " " + (btn.getAttribute("aria-label") || ""))
        .toLowerCase()
        .trim();
      // Match see more / …more / show more, avoid "see more reactions" etc. lightly
      if (
        /^(…|\.\.\.)?more$/.test(t) ||
        t === "see more" ||
        t === "show more" ||
        t.includes("see more") ||
        t.includes("show more") ||
        (t.includes("more") && t.length < 24 && !t.includes("comment") && !t.includes("reaction"))
      ) {
        try {
          btn.click();
          clicks++;
        } catch (e) {}
      }
    });
    return clicks;
  }

  function collectPostElements() {
    const set = new Set();
    // Primary: activity URN cards
    document.querySelectorAll("[data-urn*='activity'], [data-id*='activity']").forEach((el) => {
      // Prefer outermost activity node
      const outer = el.closest("[data-urn*='activity'], [data-id*='activity']") || el;
      set.add(outer);
    });
    // Fallbacks for alternate LinkedIn layouts
    document.querySelectorAll(".feed-shared-update-v2, div[data-view-name='feed-full-update'], article.artdeco-card").forEach((el) => {
      set.add(el);
    });
    return Array.from(set).filter((el) => {
      const len = (el.innerText || "").trim().length;
      return len >= 40;
    });
  }

  function scan() {
    let seen = 0;
    let queuedNow = 0;
    let expanded = 0;
    const nodes = collectPostElements();

    nodes.forEach((el) => {
      seen++;
      expanded += expandSeeMore(el);

      if (!el.dataset.jtInjected) {
        el.dataset.jtInjected = "1";
        applyRejection(el);
        try {
          inject(el);
        } catch (e) {}
      }

      if (!autoSaveOnScroll || el.classList.contains("jt-hidden")) return;

      // After expand, re-read text
      const body = postText(el);
      if (!body || body.length < 50) return;
      const url = postUrl(el);
      const key = postKey(el, body);
      if (autoSavedUrls.has(key) || (url && rejected.has(url)) || rejected.has(key)) return;

      autoSavedUrls.add(key);
      const saveBtn = el.querySelector(".jt-btn.jt-save");
      enqueueSave({ text: body, url: url || key, button: saveBtn || null });
      queuedNow++;
    });

    ensurePanel();
    if (queueStatusEl) {
      const pending = saveQueue.length;
      if (autoSaveOnScroll) {
        queueStatusEl.textContent = queueRunning || pending
          ? `Queue ${pending} · saved ${queueDone} · fail ${queueFailed}`
          : `Scanned ${seen} · expanded ${expanded} · queued ${autoSavedUrls.size}`;
      } else if (pending || queueRunning) {
        queueStatusEl.textContent = `Queue ${pending} · saved ${queueDone}`;
      }
    }
    if (autoSaveOnScroll && seen === 0) {
      showToast("No posts found on screen — scroll the feed a bit", "err");
    } else if (autoSaveOnScroll && queuedNow > 0) {
      showToast(`Queued ${queuedNow} from this screen`, "info");
    }
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
      <div class="jt-hint">Queues job-like posts while you scroll. Backend rejects if no email/title. Enable Auto-send in popup to email recruiters.</div>
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
            ? "Auto-save ON · job posts go to queue (auto-send if enabled in popup)"
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
      // Expand "see more", then capture after LinkedIn updates DOM
      setTimeout(() => scan(), 500);
      setTimeout(() => {
        scan(); // second pass after see-more expansion
        processQueue();
      }, 1500);
      scheduleNextScroll();
    }, delay);
  }

  function startAutoScroll() {
    autoScrollOn = true;
    updateScrollToggleUI();
    if (!autoSaveOnScroll) {
      showToast("Auto-scroll ON — turn on Auto-save on scroll to queue & save posts", "info");
    } else {
      showToast(`Auto-scroll + auto-save ON · delay ${scrollMinMs / 1000}–${scrollMaxMs / 1000}s`, "ok");
      // Capture whatever is already on screen before first scroll
      scan();
      processQueue();
    }
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
