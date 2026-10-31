(() => {
  if (window !== window.top || window.__jtLinkedInLoaded) return;
  window.__jtLinkedInLoaded = true;

  const POST_SELECTORS = [
    '.feed-shared-update-v2',
    'div[data-view-name="feed-full-update"]',
    'div.occludable-update',
    'article.scaffold-layout__list-item',
    '.scaffold-finite-scroll__content > div',
    '.scaffold-finite-scroll__content li',
    'main .reusable-search__entity-result-list li',
    '[data-urn*="urn:li:"]',
    '[data-id*="urn:li:"]',
  ];
  const POST_SELECTOR = POST_SELECTORS.join(', ');
  const NESTED_SELECTOR =
    '[data-urn*="urn:li:activity"], [data-id*="urn:li:activity"], .feed-shared-update-v2, div[data-view-name="feed-full-update"], div.occludable-update';
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
  // Bound how many scans we wait for a post's "see more" text to expand.
  const collapsedSkips = new WeakMap();

  // Auto-scroll state
  let autoScrollOn = false;
  let autoScrollTimer = null;
  let scrollMinMs = 2500;
  let scrollMaxMs = 7000;
  // Auto-save visible posts while scrolling (checkbox)
  let autoSaveOnScroll = false;
  const autoSavedUrls = new Set(); // avoid re-queuing same post
  const seenPostKeys = new Set();

  let toastEl = null;
  let toastTimer = null;
  let panelEl = null;
  let queueStatusEl = null;

  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

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
    if (!el) return "";
    const urn = el.getAttribute("data-urn") || el.getAttribute("data-id") || el.getAttribute("data-activity-urn") || "";
    if (urn && urn.includes("urn:li:")) {
      if (urn.includes("activity")) {
        return `https://www.linkedin.com/feed/update/${urn}/`;
      }
      // sometimes other URNs appear; still try to link if looks like post
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }
    const urnNode = el.querySelector('[data-urn*="urn:li:"], [data-id*="urn:li:"], [data-activity-urn*="urn:li:"]');
    if (urnNode) {
      const u = urnNode.getAttribute("data-urn") || urnNode.getAttribute("data-id") || urnNode.getAttribute("data-activity-urn") || "";
      if (u && u.includes("urn:li:activity")) {
        return `https://www.linkedin.com/feed/update/${u}/`;
      } else if (u && u.includes("urn:li:")) {
        return `https://www.linkedin.com/feed/update/${u}/`;
      }
    }
    const link = el.querySelector(
      'a[href*="/feed/update/urn:li:"], a[href*="/feed/update/urn%3Ali%3A"], a[href*="urn%3Ali"]'
    );
    if (link && link.href) {
      try {
        const url = new URL(link.href, location.origin);
        if (url.pathname.includes("/feed/update/")) {
          return `${url.origin}${url.pathname}`;
        }
        return link.href.split("?")[0].split("#")[0];
      } catch {
        return link.href.split("?")[0].split("#")[0];
      }
    }
    return "";
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

  // Auto-save on scroll should only queue what the user can actually see.
  // Previously the first scan queued every post already rendered in the DOM
  // (20+ at once) the moment the checkbox was ticked.
  function isInViewport(el, margin = 120) {
    try {
      const r = el.getBoundingClientRect();
      if (!r || (r.width === 0 && r.height === 0)) return false;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      return r.bottom > -margin && r.top < vh + margin;
    } catch {
      return false;
    }
  }

  function expandSeeMore(el) {
    if (!el) return;
    el.querySelectorAll('button, span[role="button"], [aria-expanded="false"], .feed-shared-inline-show-more-text__see-more-less-toggle').forEach((btn) => {
      const t = ((btn.innerText || "") + " " + (btn.getAttribute("aria-label") || "")).toLowerCase().trim();
      if (t.includes("see more") || t.includes("show more") || t === "…more" || t === "...more" || t.includes("…see more")) {
        try { btn.click(); } catch (e) {}
      }
    });
  }

  // True while the post's own text is still collapsed behind "…see more".
  // Capturing now would read truncated text and miss the recruiter email that
  // sits at the end of the post, causing a false "email not found" rejection.
  function hasCollapsedPostText(el) {
    for (const sel of TEXT_SELECTORS) {
      const node = el.querySelector(sel);
      if (!node) continue;
      const toggles = node.querySelectorAll(
        '.feed-shared-inline-show-more-text__see-more-less-toggle, button[aria-expanded], [role="button"][aria-expanded], [class*="inline-show-more-text"] button'
      );
      for (const btn of toggles) {
        const t = ((btn.innerText || "") + " " + (btn.getAttribute("aria-label") || ""))
          .toLowerCase()
          .trim();
        if (t.includes("see more") || t.includes("show more") || t.includes("…more")) {
          return true;
        }
      }
    }
    return false;
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
    if (el.querySelector(".jt-bar")) return;
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
      expandSeeMore(el);
      setTimeout(() => {
        enqueueSave({ text: postText(el), url: postUrl(el) || location.href, button: save });
      }, 250);
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
    if (/\b(hiring|looking for|job title|position|role|opening|vacancy|engineer|developer|manager|analyst|recruiter)\b/i.test(text))
      return true;
    if (/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(text)) return true;
    return text.length >= 100;
  }

  function scan() {
    let seen = 0;
    let queuedNow = 0;
    const posts = new Set();
    document.querySelectorAll(POST_SELECTOR).forEach((el) => {
      // Only process the outermost matching card
      const outer = el.closest(NESTED_SELECTOR);
      if (outer && outer !== el && outer.querySelector(".jt-bar")) return;
      if ((el.innerText || "").trim().length < 40) return;
      posts.add(el);
    });

    // Also scan for any un-injected cards near viewport as fallback
    if (posts.size === 0) {
      document.querySelectorAll('.feed-shared-update-v2, div[data-view-name="feed-full-update"], div.occludable-update, article, .scaffold-finite-scroll__content > div, .scaffold-finite-scroll__content li, main ul > li, [role="listitem"]').forEach((el) => {
        if ((el.innerText || "").trim().length < 60) return;
        if (el.closest("aside, nav, header, footer, [role='complementary'], [role='navigation']")) return;
        const outer = el.closest(NESTED_SELECTOR);
        if (outer && outer !== el) return;
        posts.add(el);
      });
    }

    // If still nothing, scan all visible containers with reasonable text
    if (posts.size === 0) {
      document.querySelectorAll('div, section, article').forEach((el) => {
        const txt = (el.innerText || "").trim();
        if (txt.length < 80 || txt.length > 8000) return;
        if (el.querySelector('.jt-bar')) return;
        if (el.closest("aside, nav, header, footer")) return;
        // Heuristic: has some buttons/links typical of posts
        if (el.querySelectorAll('button, a').length < 2) return;
        posts.add(el);
      });
    }

    // Auto-save is only meaningful while auto-scroll is running. When
    // auto-scroll is off we capture nothing — no Save bars, no auto-queue,
    // no injection. This prevents a single tick of the checkbox from queuing
    // every post already loaded in the feed.
    if (!autoScrollOn || !autoSaveOnScroll) {
      ensurePanel();
      if (queueStatusEl) {
        queueStatusEl.textContent = autoScrollOn
          ? "Auto-save OFF"
          : "Auto-scroll OFF";
      }
      return;
    }

    Array.from(posts).forEach((el) => {
      // Only capture posts currently on screen. Posts further down the feed
      // get queued as the auto-scroll actually reaches them.
      if (!isInViewport(el)) return;

      seen++;

      // ONE Save bar per post
      if (!el.querySelector(".jt-bar")) {
        el.dataset.jtInjected = "1";
        applyRejection(el);
        try { inject(el); } catch (e) {}
        // Highlight newly captured post briefly
        try {
          el.style.outline = "2px solid #0a66c2";
          el.style.outlineOffset = "2px";
          setTimeout(() => {
            el.style.outline = "";
            el.style.outlineOffset = "";
          }, 1200);
        } catch (e) {}
      } else {
        el.dataset.jtInjected = "1";
      }

      if (el.classList.contains("jt-hidden")) return;

      expandSeeMore(el);
      // Wait for the expanded text before reading, otherwise the email at the
      // bottom of a long post is missed and the post gets wrongly rejected.
      // Give up after a few passes so a stuck toggle cannot block capture.
      if (hasCollapsedPostText(el)) {
        const skips = (collapsedSkips.get(el) || 0) + 1;
        collapsedSkips.set(el, skips);
        if (skips <= 3) return;
      }
      const url = postUrl(el);
      const body = postText(el);
      if (!body || body.length < 40) return;

      const key = (url && url.includes("activity") ? url : "") || ("t:" + body.slice(0, 200).replace(/\s+/g, " "));
      if (autoSavedUrls.has(key) || seenPostKeys.has(key)) return;
      if (url && rejected.has(url)) return;

      // Auto-save: queue every substantial post; server rejects non-jobs / missing email
      autoSavedUrls.add(key);
      seenPostKeys.add(key);
      const saveBtn = el.querySelector(".jt-btn.jt-save");
      enqueueSave({ text: body, url: url || location.href, button: saveBtn || null });
      queuedNow++;
    });

    ensurePanel();
    if (queueStatusEl) {
      queueStatusEl.textContent = autoSaveOnScroll
        ? (saveQueue.length || queueRunning
            ? "Queue " + saveQueue.length + " · saved " + queueDone + " · failed " + queueFailed
            : "Scanned " + seen + " · queued this pass " + queuedNow)
        : "Posts: " + seen;
    }
    if (autoSaveOnScroll) {
      if (seen === 0) showToast("Auto-save: 0 posts found — scroll the feed", "err");
      else if (queuedNow > 0) showToast("Auto-save queued " + queuedNow + " / scanned " + seen, "info");
      else if (seen > 0 && queuedNow === 0) showToast("Auto-save: scanned " + seen + " (no new unqueued)", "info");
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
      <label class="jt-checkbox-row" id="jt-auto-save-row">
        <input type="checkbox" id="jt-auto-save" disabled />
        <span>Auto-save on scroll</span>
      </label>
      <div class="jt-hint" id="jt-auto-save-hint">Start Auto-scroll to enable auto-save.</div>
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
      autoSaveCb.addEventListener("change", () => {
        // Auto-save can only be ON while auto-scroll is running.
        if (!autoScrollOn) {
          autoSaveCb.checked = false;
          updateAutoSaveUI();
          showToast("Start Auto-scroll first — auto-save follows it.", "info");
          return;
        }
        autoSaveOnScroll = !!autoSaveCb.checked;
        showToast(autoSaveOnScroll ? "Auto-save ON — scanning posts…" : "Auto-save OFF", "info");
        if (autoSaveOnScroll) {
          expandSeeMore(document.body);
          throttledScan();
        }
        send({ type: "setSettings", autoSaveOnScroll });
        updateAutoSaveUI();
      });
    }

    saveVisibleBtn.addEventListener("click", () => {
      // Prefer a JobTrackr-injected post in view
      let target = null;
      let best = Infinity;
      document.querySelectorAll("[data-jt-injected='1']").forEach((el) => {
        if (el.classList.contains("jt-hidden")) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < 60 || r.top > window.innerHeight - 60) return;
        const d = Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
        if (d < best) {
          best = d;
          target = el;
        }
      });
      if (!target) {
        // Fallback: look for any post-like element in view with bar or substantial text
        const candidates = Array.from(document.querySelectorAll("div, section, article, li"));
        candidates.forEach((el) => {
          if (el.classList.contains("jt-hidden")) return;
          const txt = (el.innerText || "").trim();
          if (txt.length < 80) return;
          if (el.closest("aside, nav, header, footer")) return;
          const r = el.getBoundingClientRect();
          if (r.bottom < 60 || r.top > window.innerHeight - 60) return;
          const d = Math.abs(r.top + r.height / 2 - window.innerHeight / 2);
          if (d < best) {
            best = d;
            target = el;
          }
        });
      }
      if (!target) target = findVisiblePost();
      if (!target) {
        showToast("No post in view. Scroll a bit and try again.", "err");
        return;
      }
      try {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {}
      target.style.outline = "3px solid #22c55e";
      target.style.outlineOffset = "4px";
      target.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.25)";
      setTimeout(() => {
        target.style.outline = "";
        target.style.outlineOffset = "";
        target.style.boxShadow = "";
      }, 2000);
      expandSeeMore(target);
      setTimeout(() => {
        const url = postUrl(target) || location.href;
        const text = postText(target) || (target.innerText || "").replace(/\s{3,}/g, "\n\n").trim().slice(0, 8000);
        enqueueSave({ text, url, button: target.querySelector(".jt-btn.jt-save") || null });
      }, 300);
    });

    updateQueueUI();
    updateScrollToggleUI();
    updateAutoSaveUI();
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

  const throttledScan = throttle(() => {
    try {
      expandSeeMore(document.body);
      scan();
      processQueue();
    } catch (e) {}
  }, 1200);

  function scheduleNextScroll() {
    if (!autoScrollOn) return;
    const delay = randomDelay();
    autoScrollTimer = setTimeout(() => {
      if (!autoScrollOn) return;
      humanScrollStep();
      setTimeout(() => { expandSeeMore(document.body); scan(); processQueue(); }, 300);
      setTimeout(() => { expandSeeMore(document.body); scan(); processQueue(); }, 800);
      setTimeout(() => { expandSeeMore(document.body); scan(); processQueue(); }, 1400);
      scheduleNextScroll();
    }, delay);
  }

  function startAutoScroll() {
    autoScrollOn = true;
    // Auto-save on scroll is coupled to auto-scroll: turning scrolling on
    // turns saving on, so posts are saved as they come into view.
    autoSaveOnScroll = true;
    send({ type: "setSettings", autoSaveOnScroll: true });
    updateScrollToggleUI();
    updateAutoSaveUI();
    showToast(`Auto-scroll + auto-save ON · delay ${Math.round(scrollMinMs/1000)}–${Math.round(scrollMaxMs/1000)}s`, "ok");
    expandSeeMore(document.body);
    throttledScan();
    autoScrollTimer = setTimeout(() => {
      if (!autoScrollOn) return;
      humanScrollStep();
      scheduleNextScroll();
    }, 800 + Math.random() * 700);
  }

  function stopAutoScroll() {
    autoScrollOn = false;
    // Saving follows scrolling; stop both so nothing keeps queuing in the
    // background after the user stops auto-scrolling.
    autoSaveOnScroll = false;
    send({ type: "setSettings", autoSaveOnScroll: false });
    if (autoScrollTimer) {
      clearTimeout(autoScrollTimer);
      autoScrollTimer = null;
    }
    updateScrollToggleUI();
    updateAutoSaveUI();
    if (queueStatusEl) queueStatusEl.textContent = "Auto-scroll OFF";
    showToast("Auto-scroll stopped — auto-save disabled", "info");
  }

  function updateAutoSaveUI() {
    const cb = panelEl && panelEl.querySelector("#jt-auto-save");
    const row = panelEl && panelEl.querySelector("#jt-auto-save-row");
    const hint = panelEl && panelEl.querySelector("#jt-auto-save-hint");
    if (cb) {
      cb.disabled = !autoScrollOn;
      cb.checked = autoScrollOn && autoSaveOnScroll;
    }
    if (row) row.classList.toggle("jt-disabled", !autoScrollOn);
    if (hint) {
      hint.textContent = autoScrollOn
        ? "Queues only posts that scroll into view. Auto-send via popup."
        : "Start Auto-scroll to enable auto-save.";
    }
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
      expandSeeMore(document.body);
      throttledScan();
    }, 350);
  });

  function start() {
    send({ type: "getState" }).then((res) => {
      if (res && res.ok && res.state) {
        (res.state.rejected || []).forEach((u) => rejected.add(u));
        if (typeof res.state.scrollMinMs === "number") scrollMinMs = res.state.scrollMinMs;
        if (typeof res.state.scrollMaxMs === "number") scrollMaxMs = res.state.scrollMaxMs;
        // Auto-scroll never resumes automatically after a page reload, so a
        // stale "auto-save on" flag must be dropped too. Saving follows scroll.
        autoSaveOnScroll = false;
        if (res.state.autoSaveOnScroll) {
          send({ type: "setSettings", autoSaveOnScroll: false });
        }
        updateAutoSaveUI();
      }
      expandSeeMore(document.body);
      throttledScan();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      expandSeeMore(document.body);
      throttledScan();
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
        expandSeeMore(document.body);
        throttledScan();
      });
    }
  }

  start();
})();
