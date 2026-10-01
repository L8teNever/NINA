// universal.js — ISOLATED world · main frame · document_idle
//
// Headless companion for streaming sites (UI lives in the side panel).
// Handles: keyboard shortcuts, toasts, auto-skip. All speed/volume work is
// done by speed-patch.js (rate) + audio-patch.js (gain) — this file never
// touches <video> directly. It writes to chrome.storage and lets the bridge
// in frame-speed.js push updates to the MAIN world.

(function () {
  'use strict';
  if (window.__uscUniversalLoaded) return;
  window.__uscUniversalLoaded = true;

  const SPEED_MIN = 0.25, SPEED_MAX = 10, SPEED_STEP = 0.25;
  const VOL_MIN = 0, VOL_MAX = 6, VOL_STEP = 0.1;

  let currentSpeed = 1;
  let currentVolume = 1;
  let autoSkipEnabled = true;
  let autoSkipDelay = 0;
  let pauseOnOpenSetting = false;
  let wasPlayingOnOpen = false;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 100) / 100));

  let myTabId = null;

  // ── Storage sync ─────────────────────────────────────────────────────────────
  chrome.storage.local.get([
    'joyn_autoskip', 
    'joyn_autoskip_delay',
    'joyn_show_thanks_download', 
    'joyn_pause_on_open', 
    'joyn_hide_xray',
    'joyn_hide_prime_controls',
    'joyn_hide_prime_topbar',
    'joyn_hide_prime_nextup',
    'joyn_hide_prime_settings'
  ], (res) => {
    const resSafe = res || {};
    autoSkipEnabled = resSafe.joyn_autoskip !== undefined ? !!resSafe.joyn_autoskip : true;
    const delay = parseInt(resSafe.joyn_autoskip_delay);
    autoSkipDelay = isFinite(delay) ? delay : 0;
    const showThanksDownload = resSafe.joyn_show_thanks_download !== undefined ? !!resSafe.joyn_show_thanks_download : false;
    if (showThanksDownload) {
      document.body.classList.add('nina-show-thanks-download');
      document.documentElement.classList.add('nina-show-thanks-download');
    }
    const hideXRay = resSafe.joyn_hide_xray !== undefined ? !!resSafe.joyn_hide_xray : false;
    if (hideXRay) {
      document.body.classList.add('nina-hide-xray');
      document.documentElement.classList.add('nina-hide-xray');
    }
    const hideControls = resSafe.joyn_hide_prime_controls !== undefined ? !!resSafe.joyn_hide_prime_controls : false;
    if (hideControls) {
      document.body.classList.add('nina-hide-prime-controls');
      document.documentElement.classList.add('nina-hide-prime-controls');
    }
    const hideTopbar = resSafe.joyn_hide_prime_topbar !== undefined ? !!resSafe.joyn_hide_prime_topbar : false;
    if (hideTopbar) {
      document.body.classList.add('nina-hide-prime-topbar');
      document.documentElement.classList.add('nina-hide-prime-topbar');
    }
    const hideNextup = resSafe.joyn_hide_prime_nextup !== undefined ? !!resSafe.joyn_hide_prime_nextup : false;
    if (hideNextup) {
      document.body.classList.add('nina-hide-prime-nextup');
      document.documentElement.classList.add('nina-hide-prime-nextup');
    }
    const hideSettings = resSafe.joyn_hide_prime_settings !== undefined ? !!resSafe.joyn_hide_prime_settings : false;
    if (hideSettings) {
      document.body.classList.add('nina-hide-prime-settings');
      document.documentElement.classList.add('nina-hide-prime-settings');
    }
    pauseOnOpenSetting = resSafe.joyn_pause_on_open !== undefined ? !!resSafe.joyn_pause_on_open : false;

    chrome.runtime.sendMessage({ type: 'GET_TAB_SETTINGS' }, (tabRes) => {
      if (tabRes) {
        myTabId = tabRes.tabId;
        if (tabRes.speed !== undefined) currentSpeed = clamp(tabRes.speed, SPEED_MIN, SPEED_MAX);
        if (tabRes.volume !== undefined) currentVolume = clamp(tabRes.volume, VOL_MIN, VOL_MAX);
      }
      updateYouTubeVolumeBoostUI();
      const valEl = document.getElementById('usc-yt-speed-val');
      if (valEl) valEl.textContent = currentSpeed.toFixed(2);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (area !== 'local') return;
    if (changes.tab_speeds && myTabId) {
      const newTabSettings = changes.tab_speeds.newValue[myTabId];
      if (newTabSettings) {
        if (newTabSettings.speed !== undefined) {
          currentSpeed = clamp(newTabSettings.speed, SPEED_MIN, SPEED_MAX);
          const valEl = document.getElementById('usc-yt-speed-val');
          if (valEl) valEl.textContent = currentSpeed.toFixed(2);
        }
        if (newTabSettings.volume !== undefined) {
          currentVolume = clamp(newTabSettings.volume, VOL_MIN, VOL_MAX);
          updateYouTubeVolumeBoostUI();
        }
        const overlay = document.getElementById('usc-overlay');
        if (overlay && typeof overlay._updateUI === 'function') {
          overlay._updateUI(currentSpeed, currentVolume);
        }
      }
    }
    if (changes.joyn_autoskip && changes.joyn_autoskip.newValue !== undefined) {
      autoSkipEnabled = !!changes.joyn_autoskip.newValue;
    }
    if (changes.joyn_autoskip_delay && changes.joyn_autoskip_delay.newValue !== undefined) {
      autoSkipDelay = parseInt(changes.joyn_autoskip_delay.newValue) || 0;
    }
    if (changes.joyn_pause_on_open && changes.joyn_pause_on_open.newValue !== undefined) {
      pauseOnOpenSetting = !!changes.joyn_pause_on_open.newValue;
    }
    if (changes.joyn_hide_xray && changes.joyn_hide_xray.newValue !== undefined) {
      const hideX = !!changes.joyn_hide_xray.newValue;
      if (hideX) {
        document.body.classList.add('nina-hide-xray');
        document.documentElement.classList.add('nina-hide-xray');
      } else {
        document.body.classList.remove('nina-hide-xray');
        document.documentElement.classList.remove('nina-hide-xray');
      }
    }
    if (changes.joyn_hide_prime_controls && changes.joyn_hide_prime_controls.newValue !== undefined) {
      const hideC = !!changes.joyn_hide_prime_controls.newValue;
      if (hideC) {
        document.body.classList.add('nina-hide-prime-controls');
        document.documentElement.classList.add('nina-hide-prime-controls');
      } else {
        document.body.classList.remove('nina-hide-prime-controls');
        document.documentElement.classList.remove('nina-hide-prime-controls');
      }
    }
    if (changes.joyn_hide_prime_topbar && changes.joyn_hide_prime_topbar.newValue !== undefined) {
      const hideT = !!changes.joyn_hide_prime_topbar.newValue;
      if (hideT) {
        document.body.classList.add('nina-hide-prime-topbar');
        document.documentElement.classList.add('nina-hide-prime-topbar');
      } else {
        document.body.classList.remove('nina-hide-prime-topbar');
        document.documentElement.classList.remove('nina-hide-prime-topbar');
      }
    }
    if (changes.joyn_hide_prime_nextup && changes.joyn_hide_prime_nextup.newValue !== undefined) {
      const hideN = !!changes.joyn_hide_prime_nextup.newValue;
      if (hideN) {
        document.body.classList.add('nina-hide-prime-nextup');
        document.documentElement.classList.add('nina-hide-prime-nextup');
      } else {
        document.body.classList.remove('nina-hide-prime-nextup');
        document.documentElement.classList.remove('nina-hide-prime-nextup');
      }
    }
    if (changes.joyn_hide_prime_settings && changes.joyn_hide_prime_settings.newValue !== undefined) {
      const hideS = !!changes.joyn_hide_prime_settings.newValue;
      if (hideS) {
        document.body.classList.add('nina-hide-prime-settings');
        document.documentElement.classList.add('nina-hide-prime-settings');
      } else {
        document.body.classList.remove('nina-hide-prime-settings');
        document.documentElement.classList.remove('nina-hide-prime-settings');
      }
    }
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function setSpeedTo(target, withToast) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const s = clamp(target, SPEED_MIN, SPEED_MAX);
    if (s === currentSpeed) return;
    currentSpeed = s;
    if (myTabId) {
      chrome.storage.local.get(['tab_speeds'], (res) => {
        const tabSpeeds = res.tab_speeds || {};
        const activeSettings = tabSpeeds[myTabId] || {};
        tabSpeeds[myTabId] = {
          ...activeSettings,
          speed: s
        };
        chrome.storage.local.set({ tab_speeds: tabSpeeds });
      });
    }
    if (withToast) showToast('⚡ ' + s.toFixed(2) + '×');
  }

  function bumpSpeed(delta) {
    setSpeedTo(currentSpeed + delta, true);
  }

  function bumpVolume(delta) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const v = clamp(currentVolume + delta, VOL_MIN, VOL_MAX);
    if (v === currentVolume) return;
    currentVolume = v;
    if (myTabId) {
      chrome.storage.local.get(['tab_speeds'], (res) => {
        const tabSpeeds = res.tab_speeds || {};
        const activeSettings = tabSpeeds[myTabId] || {};
        tabSpeeds[myTabId] = {
          ...activeSettings,
          volume: v
        };
        chrome.storage.local.set({ tab_speeds: tabSpeeds });
      });
    }
    showToast('🔊 ' + Math.round(v * 100) + '%');
  }

  document.addEventListener('keydown', (e) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(document.activeElement)) return;
    if (!e.key) return;
    const key = e.key.toLowerCase();
    // On YouTube Shorts, Up/Down is YouTube's own navigation to the
    // next/previous Short — hijacking it for volume broke that. W/S stay
    // volume shortcuts there since they don't conflict with anything native.
    const isYouTubeShorts = location.hostname.includes('youtube.com') && location.pathname.startsWith('/shorts');
    if (key === 'd') bumpSpeed(SPEED_STEP);
    else if (key === 'a') bumpSpeed(-SPEED_STEP);
    else if (e.key === 'ArrowUp' && !isYouTubeShorts) {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(VOL_STEP);
    }
    else if (e.key === 'ArrowDown' && !isYouTubeShorts) {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(-VOL_STEP);
    }
    else if (key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(VOL_STEP);
    }
    else if (key === 's') {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(-VOL_STEP);
    }
  });

  // ── Crunchyroll: extra speeds in its own "Abspielgeschwindigkeit" menu ──
  // The player's menu only offers 0.5x / 0.75x / 1x. Clone its own rows for
  // higher speeds so they look native, and route every selection — ours and
  // Crunchyroll's — through setSpeedTo() so speed-patch.js enforces it.
  // Otherwise picking a native entry after one of ours would get overridden
  // by our still-active higher target rate.
  if (location.hostname.includes('crunchyroll.com')) {
    const CR_EXTRA_SPEEDS = [1.25, 1.5, 1.75, 2, 2.5, 3];
    const SPEED_LABEL_RE = /^(\d+(?:[.,]\d+)?)\s*x$/i;
    const MENU_TITLE_RE = /abspielgeschwindigkeit|wiedergabegeschwindigkeit|playback speed/i;
    let crCheckTemplate = null;
    let crCheckLabelDepth = 0;

    const isLeaf = (el) => el.children.length === 0;
    const parseSpeedLabel = (text) => {
      const m = SPEED_LABEL_RE.exec((text || '').trim());
      return m ? parseFloat(m[1].replace(',', '.')) : null;
    };
    const speedLabelIn = (row) =>
      [row, ...row.querySelectorAll('*')].find((c) => isLeaf(c) && parseSpeedLabel(c.textContent) !== null);

    // Locate the menu via its title, then collect Crunchyroll's own speed
    // labels inside it. Anchoring on the title keeps the "1x" toggle button
    // in the control bar (same text, outside the menu) from matching.
    function findNativeSpeedLabels() {
      for (const title of document.querySelectorAll('span, div, p, h1, h2, h3, h4, label')) {
        if (!isLeaf(title) || !MENU_TITLE_RE.test(title.textContent || '')) continue;
        if (title.closest('#usc-overlay')) continue;
        for (let node = title.parentElement, i = 0; node && i < 8; node = node.parentElement, i++) {
          const labels = [];
          for (const c of node.querySelectorAll('*')) {
            if (isLeaf(c) && !c.closest('[data-nina-speed]') && parseSpeedLabel(c.textContent) !== null) {
              labels.push(c);
            }
          }
          if (labels.length >= 2) return labels;
        }
      }
      return null;
    }

    function updateSpeedChecks(rowsParent, nativeRows) {
      const customActive = !nativeRows.some((r) => Math.abs(r.speed - currentSpeed) < 0.01);
      // Crunchyroll still thinks it's at its own rate (speed-patch spoofs the
      // getter), so hide its check while one of ours is the real speed.
      for (const { row } of nativeRows) {
        row.querySelectorAll('svg:not([data-nina-check])').forEach((svg) => {
          svg.style.visibility = customActive ? 'hidden' : '';
        });
      }
      for (const row of rowsParent.querySelectorAll(':scope > [data-nina-speed]')) {
        const active = Math.abs(parseFloat(row.dataset.ninaSpeed) - currentSpeed) < 0.01;
        const existing = row.querySelector('[data-nina-check]');
        if (active && !existing && crCheckTemplate) {
          const check = crCheckTemplate.cloneNode(true);
          check.setAttribute('data-nina-check', '1');
          check.style.visibility = '';
          // Put the check into the same container as in Crunchyroll's own row
          // (same number of levels above the label), so its flex layout pushes
          // it to the right instead of wrapping below the text.
          let container = crCheckLabelDepth > 0 ? speedLabelIn(row) : null;
          for (let i = 0; container && i < crCheckLabelDepth; i++) container = container.parentElement;
          if (!container || !row.contains(container)) container = row;
          container.appendChild(check);
        } else if (!active && existing) {
          existing.remove();
        }
      }
    }

    function enhanceCrunchyrollSpeedMenu() {
      if (!document.querySelector('video')) return;
      const labels = findNativeSpeedLabels();
      if (!labels) return;

      let rowsParent = labels[0].parentElement;
      while (rowsParent && !labels.every((l) => rowsParent.contains(l))) rowsParent = rowsParent.parentElement;
      if (!rowsParent) return;

      const nativeRows = labels.map((label) => {
        let row = label;
        while (row && row.parentElement !== rowsParent) row = row.parentElement;
        return { row, speed: parseSpeedLabel(label.textContent) };
      }).filter((r) => r.row);
      if (nativeRows.length < 2) return;

      for (const { row, speed } of nativeRows) {
        const svg = row.querySelector('svg:not([data-nina-check])');
        if (svg && !crCheckTemplate) {
          // The check usually sits in a wrapper next to the label. Clone that
          // whole wrapper (not just the svg) and remember how far above the
          // label their shared container is.
          const label = speedLabelIn(row);
          let slot = svg;
          while (slot.parentElement && slot.parentElement !== row && !(label && slot.parentElement.contains(label))) {
            slot = slot.parentElement;
          }
          let depth = 0;
          for (let n = label; n && n !== slot.parentElement; n = n.parentElement) depth++;
          crCheckTemplate = slot.cloneNode(true);
          crCheckLabelDepth = label && slot.parentElement !== row ? depth : -1;
          crCheckTemplate.querySelectorAll('svg').forEach((s) => { s.style.visibility = ''; });
        }
        if (!row.dataset.ninaBound) {
          row.dataset.ninaBound = '1';
          row.addEventListener('click', () => setSpeedTo(speed, false));
        }
      }

      if (!rowsParent.querySelector(':scope > [data-nina-speed]')) {
        // Clone an unselected row so the copies don't inherit Crunchyroll's
        // "selected" highlight or its check icon.
        const template = (nativeRows.find((r) => !r.row.querySelector('svg')) || nativeRows[nativeRows.length - 1]).row;
        let insertAfter = nativeRows[nativeRows.length - 1].row;
        for (const s of CR_EXTRA_SPEEDS) {
          const row = template.cloneNode(true);
          row.dataset.ninaSpeed = String(s);
          delete row.dataset.ninaBound;
          row.removeAttribute('id');
          row.removeAttribute('aria-checked');
          row.removeAttribute('aria-selected');
          row.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
          row.querySelectorAll('svg').forEach((n) => n.remove());
          const label = speedLabelIn(row);
          if (label) label.textContent = s + 'x';
          row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setSpeedTo(s, false);
            updateSpeedChecks(rowsParent, nativeRows);
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          });
          insertAfter.after(row);
          insertAfter = row;
        }
      }

      updateSpeedChecks(rowsParent, nativeRows);
    }

    let crSpeedMenuPending = false;
    new MutationObserver(() => {
      if (crSpeedMenuPending) return;
      crSpeedMenuPending = true;
      requestAnimationFrame(() => {
        crSpeedMenuPending = false;
        try { enhanceCrunchyrollSpeedMenu(); } catch (_) {}
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Capture volumechange events to sync native adjustments back to storage
  document.addEventListener('volumechange', (e) => {
    const video = e.target;
    if (video && video.tagName === 'VIDEO') {
      if (!video.muted && video.volume > 0) {
        const diff = Math.abs(video.volume - currentVolume);
        if (diff > 0.05) {
          if (currentVolume > 1.0 && video.volume === 1.0) {
            // Already in boosted range, native is maxed at 100% (no-op)
          } else {
            if (myTabId) {
              chrome.storage.local.get(['tab_speeds'], (res) => {
                const tabSpeeds = res.tab_speeds || {};
                const activeSettings = tabSpeeds[myTabId] || {};
                tabSpeeds[myTabId] = {
                  ...activeSettings,
                  volume: video.volume
                };
                chrome.storage.local.set({ tab_speeds: tabSpeeds });
              });
            }
          }
        }
      }
    }
  }, true);

  // ── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'usc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.classList.add('usc-toast-show');
      setTimeout(() => {
        t.classList.remove('usc-toast-show');
        setTimeout(() => t.remove(), 400);
      }, 1800);
    });
  }

  // ── Auto-skip ────────────────────────────────────────────────────────────────
  const isYouTube = window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be');

  const SKIP_SELECTORS = [
    // Disney+
    '.skip-head',
    '.skip-button',
    
    // Joyn
    '.vjs-skip-button',
    
    // YouTube
    '.ytp-ad-skip-button',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-hover',
    
    // Crunchyroll
    '.erc-skip-button',
    '.rc-skip-button',
    
    // RTL+ (TVNow)
    '.player-skip-button',
    '[class*="skip-button"]',
    
    // Generic
    '[class*="skip-intro"]',
    '[class*="skipIntro"]',
    '[class*="skip-credits"]',
    '[class*="skipCredits"]',
    '[class*="skip-recap"]',
    '[class*="skipRecap"]',
    '[class*="skip-content"]',
    '[class*="skipContent"]',
    '[class*="skip-button"]',
    '[class*="skipButton"]',
    '[id*="skipButton"]',
    '[data-testid*="skip"]',
    '[aria-label*="intro" i]',
    '[aria-label*="credits" i]',
    '[aria-label*="skip" i]',
    '.adSkipButton',
    '.skipMain'
  ];

  const SKIP_TEXTS = [
    'skip intro', 'intro überspringen', 'vorspann überspringen',
    'skip credits', 'credits überspringen', 'abspann überspringen',
    'opening skip', 'skip opening', 'intro skippen', 'skip recap', 'recap überspringen',
    'schnellvorlauf', 'werbung überspringen', 'skip ad', 'skip recap', 'überspringen'
  ];

  const NEXT_SELECTORS = [
    // Disney+ Up Next
    '.up-next-play-button',
    '[data-testid="up-next-play-button"]',

    // YouTube's "next video" is an algorithmic suggestion, not a real next
    // episode — auto-advancing through it isn't wanted the way it is for
    // Netflix. .ytp-next-button was here before and caused exactly that
    // (plus randomly skipping Shorts, since Shorts reuses the same class).
    // Deliberately not included.

    // Joyn next
    '.next-episode-btn',

    // RTL+ next
    '.player-next-button',

    // Generic Next Episode
    '[class*="nextEpisode"]',
    '[class*="next-episode"]',
    '[class*="nextEpisodeButton"]',
    '[id*="nextEpisode"]',
    '[data-testid*="next-episode"]',
    '[aria-label*="next episode" i]',
    '[aria-label*="nächste folge" i]',
    '[data-t="next-episode"] a',
    '[class*="next-up"]'
  ];

  const NEXT_TEXTS = [
    'nächste folge', 'next episode', 'next video', 'weiter zu', 'zur nächsten', 'play next',
    'nächstes video', 'nächste folge abspielen', 'up next', 'nächste folge laden'
  ];

  function robustClick(element) {
    if (!element) return;
    // Dispatch one realistic, correctly-ordered sequence ending in 'click'.
    // We used to also call element.click() before this loop, which fired an
    // extra out-of-order 'click' with no preceding mousedown — some handlers
    // (e.g. Netflix's "next episode" action) reacted to both, advancing
    // twice per call. Others may only react to a 'click' preceded by a real
    // mousedown/mouseup and ignored the early one. A single, properly
    // ordered sequence covers both without double-firing.
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const name of events) {
      try {
        const ev = new MouseEvent(name, {
          bubbles: true,
          cancelable: true,
          view: window,
          buttons: 1
        });
        element.dispatchEvent(ev);
      } catch (_) {}
    }
  }

  function isVisible(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return false;
      
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
        return false;
      }
      
      // Check parent visibility/opacity up to 4 levels
      let parent = el.parentElement;
      for (let i = 0; i < 4 && parent; i++) {
        const pStyle = window.getComputedStyle(parent);
        if (pStyle.display === 'none' || pStyle.visibility === 'hidden' || parseFloat(pStyle.opacity) === 0) {
          return false;
        }
        parent = parent.parentElement;
      }
      
      // Check if inside viewport bounds
      const inViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );
      if (!inViewport) return false;
    } catch (_) {
      return false;
    }
    return true;
  }

  function textMatches(el, phrases) {
    const t = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase().trim();
    for (const p of phrases) if (t.includes(p)) return true;
    return false;
  }

  // Recursive Shadow DOM selector helper
  function queryAllShadow(root, selector, out = []) {
    try {
      const hits = root.querySelectorAll(selector);
      for (const el of hits) out.push(el);
    } catch (_) { }
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) queryAllShadow(el.shadowRoot, selector, out);
      }
    } catch (_) { }
    return out;
  }

  // Recursive Shadow DOM button collector
  function collectButtons(root, out = []) {
    try {
      const hits = root.querySelectorAll('button, [role="button"], a');
      for (const el of hits) out.push(el);
    } catch (_) { }
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) collectButtons(el.shadowRoot, out);
      }
    } catch (_) { }
    return out;
  }

  function isYouTubeForbiddenElement(el) {
    if (!isYouTube) return false;
    let curr = el;
    while (curr && curr !== document.body) {
      if (curr.classList && curr.classList.length > 0) {
        for (let i = 0; i < curr.classList.length; i++) {
          const cls = curr.classList[i];
          if (typeof cls === 'string' && (cls.includes('ytp-chapter') || cls.includes('ytp-chapters'))) {
            return true;
          }
        }
      }
      if (curr.id === 'panels' || curr.tagName === 'YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER') {
        return true;
      }
      const tag = curr.tagName;
      if (tag === 'YTD-MACRO-MARKERS-LIST-ITEM-RENDERER' || 
          tag === 'YTD-PLAYLIST-PANEL-VIDEO-RENDERER' ||
          (curr.classList && curr.classList.contains('ytd-structured-description-content-renderer'))) {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  function findSkippable(selectors, texts) {
    for (const sel of selectors) {
      const hits = queryAllShadow(document, sel);
      for (const el of hits) {
        if (isVisible(el)) {
          if (isYouTubeForbiddenElement(el)) continue;
          return el;
        }
      }
    }
    // The text-matching fallback below exists for other sites whose "skip
    // intro" buttons don't have stable CSS classes across versions. On
    // YouTube it's pure risk with no upside: creators routinely name video
    // chapters "Intro", "Sponsor", "Filler" etc., and those chapter
    // markers are real clickable elements — the isYouTubeForbiddenElement
    // guard below doesn't cover every chapter UI variant, so this ended up
    // auto-clicking chapters by name and seeking through the video with
    // SponsorBlock fully disabled. YouTube's real skip targets (ads) are
    // already caught by the selector pass above, so just skip this for
    // YouTube entirely rather than chase every chapter component YouTube
    // ships.
    if (!isYouTube) {
      try {
        const btns = collectButtons(document);
        for (const el of btns) {
          if (isVisible(el) && textMatches(el, texts)) {
            if (isYouTubeForbiddenElement(el)) continue;
            return el;
          }
        }
      } catch (_) { }
    }
    return null;
  }

  function collectVideos(root, out = []) {
    try {
      const vids = root.querySelectorAll('video');
      for (const v of vids) out.push(v);
    } catch (_) {}
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          collectVideos(el.shadowRoot, out);
        }
      }
    } catch (_) {}
    return out;
  }

  function findMainVideo() {
    const vids = collectVideos(document);
    let best = null;
    let maxArea = 0;
    for (const v of vids) {
      const area = v.offsetWidth * v.offsetHeight;
      if (area > maxArea && v.offsetWidth > 300 && v.offsetHeight > 150) {
        maxArea = area;
        best = v;
      }
    }
    return best || vids[0] || null;
  }

  function findControlsContainer() {
    const selectors = [
      '[data-testid*="controls" i]',
      '[class*="controls-container" i]',
      '[class*="player-controls" i]',
      '.player-controls',
      '.controls-container',
      '.controls',
      '[class*="player-ui" i]',
      '[class*="player-overlay" i]',
      '[class*="player__controls" i]'
    ];
    // Our CSS (styles/overlay.css) is injected into the main document and
    // cannot reach into a shadow root, so a container found inside one would
    // leave the panel completely unstyled (and stuck looking "open"). Only
    // accept light-DOM containers here.
    for (const sel of selectors) {
      const hits = queryAllShadow(document, sel);
      for (const el of hits) {
        if (el.getRootNode() === document && el.offsetHeight > 100 && el.offsetWidth > 300) {
          return el;
        }
      }
    }
    const playSelectors = [
      '[data-testid="play-pause-button"]',
      '[data-testid="play-button"]',
      '.play-pause-button',
      '.play-button',
      '.player-play-button'
    ];
    for (const sel of playSelectors) {
      const hits = queryAllShadow(document, sel);
      for (const btn of hits) {
        if (btn.getRootNode() !== document) continue;
        let curr = btn.parentElement;
        while (curr && curr !== document.body) {
          if (curr.offsetHeight > 100 && curr.offsetWidth > 300) {
            return curr;
          }
          curr = curr.parentElement;
        }
      }
    }
    return null;
  }

  function queryShadow(root, selector) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch (_) {}
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) {
          const found = queryShadow(el.shadowRoot, selector);
          if (found) return found;
        }
      }
    } catch (_) {}
    return null;
  }

  function resumeUniversalVideo(video) {
    if (!video) return;
    if (!video.paused) return;

    // 1. Try to click a custom play/pause button first
    const selectors = [
      '.ytp-play-button', // YouTube
      '.atvwebplayersdk-playpause-button', // Prime Video
      '.atvwebplayersdk-play-button',
      '[class*="playpause"]',
      '[class*="play-button"]',
      '[data-testid="play-pause-button"]',
      '[data-testid="play-button"]',
      '.play-pause-button',
      '.play-button',
      '.player-play-button',
      '[aria-label*="play" i]',
      '[aria-label*="abspielen" i]',
      '[aria-label*="wiedergabe" i]',
      '.player-control-play',
      '.player__control--play'
    ];

    for (const sel of selectors) {
      const btn = queryShadow(document, sel);
      if (btn && typeof btn.click === 'function') {
        btn.click();
        break;
      }
    }

    // 2. Fallback check: if it's still paused, try spacebar and native play()
    setTimeout(() => {
      if (video.paused) {
        try {
          video.focus();
          const spaceEvent = new KeyboardEvent('keydown', {
            key: ' ',
            code: 'Space',
            keyCode: 32,
            which: 32,
            bubbles: true,
            cancelable: true
          });
          video.dispatchEvent(spaceEvent);
        } catch (_) {}

        setTimeout(() => {
          if (video.paused) {
            try {
              video.play().catch(() => {});
            } catch (_) {}
          }
        }, 50);
      }
    }, 50);
  }

  const SKIP_COOLDOWN = 5000;
  let lastSkipTime = 0;
  let lastNextHref = null;
  let cachedOverlay = null;
  let cachedBackdrop = null;

  let lastAdTimeText = 0;
  let lastIntroTime = -1;
  let reverseButtonClicked = false;
  let lastAmazonEpText = '';

  function getCurrentEpisodeNumber(title) {
    if (!title) return null;
    const nums = title.match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    return parseInt(nums[nums.length - 1], 10);
  }

  function parseAdTime(adTimeText) {
    if (!adTimeText) return 0;
    let adTime = 0;
    if (adTimeText.includes(':')) {
      const parts = adTimeText.split(':');
      if (parts.length === 2) {
        adTime = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      } else if (parts.length === 3) {
        adTime = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      }
    } else {
      adTime = parseInt(adTimeText, 10);
    }
    return isNaN(adTime) ? 0 : adTime;
  }

  // Picking our own overlay/backdrop as the "first child" reference (because we
  // just inserted them there) makes ensureOverlay() re-target itself relative
  // to itself on the very next tick, endlessly swapping their order and
  // re-triggering the MutationObserver forever. Always skip past our own nodes.
  function firstRealChild(el) {
    let child = el ? el.firstElementChild : null;
    while (child && (child.id === 'usc-overlay' || child.id === 'usc-backdrop')) {
      child = child.nextElementSibling;
    }
    return child;
  }

  function getNetflixControlsTarget() {
    const otherSpeedBtn = document.querySelector('#videoSpeed');
    if (otherSpeedBtn && otherSpeedBtn.parentElement) {
      return { parent: otherSpeedBtn.parentElement, reference: otherSpeedBtn };
    }

    const nextBtn = document.querySelector('[data-uia="control-next"], [data-uia*="next"], [data-uia*="episode"]');
    if (nextBtn && nextBtn.parentElement) {
      const container = nextBtn.parentElement;
      return { parent: container, reference: firstRealChild(container) || nextBtn };
    }

    const fullscreenBtn = document.querySelector('[data-uia="control-fullscreen"]');
    if (fullscreenBtn && fullscreenBtn.parentElement) {
      const container = fullscreenBtn.parentElement;
      return { parent: container, reference: firstRealChild(container) || fullscreenBtn };
    }

    const controls = document.querySelector('[data-uia="controls-standard"]');
    if (!controls) return null;
    const firstChild = controls.firstChild;
    if (!firstChild) return null;
    const sections = firstChild.children;
    if (!sections || sections.length === 0) return null;
    const targetSection = sections[sections.length - 1];
    if (!targetSection) return null;
    const container = targetSection.firstChild;
    if (!container) return null;
    return { parent: container, reference: firstRealChild(container) || container.firstChild };
  }

  function getCrunchyrollControlsTarget() {
    // Crunchyroll uses data-testid attributes — try known speed button selectors
    const speedSelectors = [
      '[data-testid="vilos-playback-speed-button"]',
      '[data-testid="playback-speed-button"]',
      '[data-testid="speed-control"]',
      // speed button often contains "1.0x" text — find any button with that
    ];
    for (const sel of speedSelectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.parentElement) {
        return { parent: btn.parentElement, reference: btn };
      }
    }

    // Try finding the bottom-right controls stack (fullscreen, next, etc.)
    // and insert before it — placing NINA to its left
    const rightStack = document.querySelector('[data-testid="bottom-right-controls-stack"]');
    if (rightStack && rightStack.parentElement) {
      return { parent: rightStack.parentElement, reference: rightStack };
    }

    // Try the overall bottom controls bar and use the right-side group
    const bottomControls = document.querySelector(
      '[data-testid="bottom-controls-autohide"], [data-testid="player-controls"]'
    );
    if (bottomControls) {
      // Find a right-side or secondary controls container
      const rightGroup = bottomControls.querySelector(
        '[class*="right"], [class*="Right"], [class*="secondary"], [class*="actions"]'
      );
      if (rightGroup) {
        return { parent: rightGroup, reference: firstRealChild(rightGroup) };
      }
      // Append directly to bottom controls
      return { parent: bottomControls, reference: null };
    }

    // Last resort: any element containing the speed text "1.0x" or "1.00x"
    const allButtons = document.querySelectorAll('button, [role="button"]');
    for (const btn of allButtons) {
      if (/^1\.0+x?$/.test((btn.textContent || '').trim())) {
        if (btn.parentElement) {
          return { parent: btn.parentElement, reference: btn };
        }
      }
    }

    return null;
  }


  function runNetflixSkipper() {
    if (!autoSkipEnabled) return;

    // 1. Skip Intro
    // Same reused-node/repeat-click hazard as the next-episode button below:
    // without a one-shot guard this fires again on every tick the button is
    // still visible (e.g. while it's fading out), clicking through extra
    // content each time. Gate it the same way, keyed to the URL.
    const skipIntroBtn = document.querySelector('[data-uia="player-skip-intro"]');
    if (skipIntroBtn && isVisible(skipIntroBtn)) {
      if (skipIntroBtn._detectedHref !== location.href) {
        skipIntroBtn._detectedHref = location.href;
        skipIntroBtn._detectedAt = Date.now();
        skipIntroBtn._clicked = false;
      }
      if (!skipIntroBtn._clicked && Date.now() - skipIntroBtn._detectedAt >= autoSkipDelay * 1000) {
        skipIntroBtn._clicked = true;
        robustClick(skipIntroBtn);
        showToast('⏭ Intro übersprungen');
      }
    }

    // 2. Skip Recap
    const skipRecapBtn = document.querySelector('[data-uia="player-skip-recap"], [data-uia="player-skip-preplay"]');
    if (skipRecapBtn && isVisible(skipRecapBtn)) {
      if (skipRecapBtn._detectedHref !== location.href) {
        skipRecapBtn._detectedHref = location.href;
        skipRecapBtn._detectedAt = Date.now();
        skipRecapBtn._clicked = false;
      }
      if (!skipRecapBtn._clicked && Date.now() - skipRecapBtn._detectedAt >= autoSkipDelay * 1000) {
        skipRecapBtn._clicked = true;
        robustClick(skipRecapBtn);
        showToast('⏭ Recap übersprungen');
      }
    }

    // 3. Skip Credits / Next Episode
    const nextEpBtn = document.querySelector('[data-uia="next-episode-seamless-button-draining"]');
    if (nextEpBtn && isVisible(nextEpBtn)) {
      // Netflix's seamless transition can reuse this exact DOM node for the
      // *next* episode's button too, just updating its target underneath it.
      // A leftover _detectedAt from the previous episode would then satisfy
      // the delay check instantly, skipping an extra episode with no wait.
      // Re-arm detection whenever the URL changes so the delay always
      // restarts for the episode currently showing this button.
      if (nextEpBtn._detectedHref !== location.href) {
        nextEpBtn._detectedHref = location.href;
        nextEpBtn._detectedAt = Date.now();
        nextEpBtn._clicked = false;
      }
      // A small stabilization floor on top of the user's configured delay so
      // a one-frame fade-out ghost from the previous episode's transition
      // can't be mistaken for a fresh, real next-episode prompt.
      const requiredWait = Math.max(autoSkipDelay * 1000, 600);
      if (!nextEpBtn._clicked && Date.now() - nextEpBtn._detectedAt >= requiredWait) {
        nextEpBtn._clicked = true;
        robustClick(nextEpBtn);
        showToast('▶ Nächste Folge');
      }
    }

    // 4. Blocked Autoplay Continue
    const continueBtn = document.querySelector('[data-uia="interrupt-autoplay-continue"]');
    if (continueBtn && isVisible(continueBtn)) {
      robustClick(continueBtn);
    }

    // 5. Remove Netflix Games Rows
    const gamesRow = document.querySelector('div.mobile-games-row');
    if (gamesRow) gamesRow.remove();
    const betaRow = document.querySelector('div[data-list-context="configbased_cloudpersonalizedgames"]');
    if (betaRow) betaRow.remove();
    const billboardGames = document.querySelector('div.billboard-row.billboard-row-games');
    if (billboardGames) billboardGames.remove();
  }

  function checkNetflixAds(video) {
    if (!video) return;
    const adTimeEl = document.querySelector('span[class*="mmvz9h"]');
    const adLength = adTimeEl ? parseAdTime(adTimeEl.textContent) : 0;

    const isEdge = /edg/i.test(navigator.userAgent);
    const playBackRate = isEdge ? 3 : 8;

    if (adLength > 0 || lastAdTimeText > 0) {
      if (video.paused) {
        try { video.play().catch(() => {}); } catch (_) {}
      }
      if (adLength > 2) {
        if (video.getAttribute('data-usc-ad') !== 'true') {
          video.setAttribute('data-usc-ad', 'true');
          video.dispatchEvent(new Event('ratechange'));
        }
        video.muted = true;
        lastAdTimeText = adLength;
      } else {
        if (video.getAttribute('data-usc-ad') === 'true') {
          video.removeAttribute('data-usc-ad');
          video.dispatchEvent(new Event('ratechange'));
        }
        video.muted = false;
        lastAdTimeText = 0;
      }
    }

    const pauseAdDiv = document.querySelector('div[data-uia="pause-ad-title-display"]');
    const pauseAdBtn = document.querySelector('button[data-uia="pause-ad-expand-button"]');
    if (pauseAdBtn && pauseAdDiv && isVisible(pauseAdDiv)) {
      robustClick(pauseAdBtn);
      setTimeout(() => {
        if (video) video.pause();
      }, 100);
    }
  }

  function createAmazonRewindButton(video, position, startTime, endTime) {
    if (!position || document.querySelector('[data-uia="reverse-button"]')) return;

    const button = document.createElement("button");
    button.style.cssText = "padding: 0px 22px; line-height: normal; min-width: 0px; z-index: 9999; pointer-events: all; margin-left: 10px;";
    button.setAttribute(
      "class",
      "fqye4e3 f1ly7q5u fk9c3ap fz9ydgy f1xrlb00 f1hy0e6n fgbpje3 f1uteees f1h2a8xb f1cg7427 fiqc9rt fg426ew f1ekwadg"
    );
    button.dataset.uia = "reverse-button";
    button.textContent = "Rewind?";

    position.appendChild(button);

    const timeout = setTimeout(() => {
      button.remove();
    }, 5000);

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      reverseButtonClicked = true;
      video.currentTime = startTime;
      button.remove();
      clearTimeout(timeout);
      const waitTime = endTime - startTime + 2;
      setTimeout(() => {
        reverseButtonClicked = false;
      }, waitTime * 1000);
    });
  }

  function runAmazonSkipper(video) {
    if (!autoSkipEnabled) return;

    // 1. Skip Intro & Recap
    if (video && !reverseButtonClicked && lastIntroTime === -1) {
      const skipBtn = document.querySelector(
        "[class*=skipelement], button.f1xhgfrd.fg4c0o1.fxdt570.ff1ld61.f1cet4yo.f11un3wk.fe9afsx.fj0jixm.f1e5razt.fw6qvwa.f1vpdgub.f1g75y8b, button[aria-label='Vorspann überspringen'], button[aria-label='Skip Intro']"
      );
      const nextUpBtn = document.querySelector("[class*=nextupcard-button]");
      
      if (skipBtn && isVisible(skipBtn) && !nextUpBtn) {
        if (!skipBtn._detectedAt) skipBtn._detectedAt = Date.now();
        if (Date.now() - skipBtn._detectedAt >= autoSkipDelay * 1000) {
          const time = Math.floor(video.currentTime);
          lastIntroTime = time;
          setTimeout(() => { lastIntroTime = -1; }, 5000);

          robustClick(skipBtn);
          showToast('⏭ Intro übersprungen');

          setTimeout(() => {
            createAmazonRewindButton(video, skipBtn.parentElement?.parentElement?.parentElement, time, video.currentTime);
          }, 50);
        }
      }
    }

    // 2. Skip Credits / Next Episode
    const nextEpBtn = document.querySelector(
      "[class*=nextupcard-button], button.f1h7p346.fl0ztaa.f1w91twd.f1hy0e6n.fgbpje3.fe9afsx.fj0jixm"
    );
    if (nextEpBtn && isVisible(nextEpBtn)) {
      const epTextEl = document.querySelector("[class*=nextupcard-episode], .f14s8172.f615xjr.f1jlz00e");
      const epText = epTextEl ? (epTextEl.textContent || '') : '';
      const isEp1 = /(?<!\S)1(?!\S)/.test(epText);
      if (epText && !isEp1 && lastAmazonEpText !== epText) {
        if (!nextEpBtn._detectedAt) nextEpBtn._detectedAt = Date.now();
        if (Date.now() - nextEpBtn._detectedAt >= autoSkipDelay * 1000) {
          lastAmazonEpText = epText;
          setTimeout(() => { lastAmazonEpText = ''; }, 5000);
          robustClick(nextEpBtn);
          showToast('▶ Nächste Folge');
        }
      }
    }

    // 3. Skip Freevee Ads
    if (video) {
      const adTimeTextEl = document.querySelector(".dv-player-fullscreen .atvwebplayersdk-ad-timer-remaining-time");
      if (adTimeTextEl && isVisible(adTimeTextEl)) {
        let adTime = 0;
        if (adTimeTextEl.childNodes?.[0]) adTime = parseAdTime(adTimeTextEl.childNodes[0].textContent);
        if (!adTime && adTimeTextEl.childNodes?.[1]) adTime = parseAdTime(adTimeTextEl.childNodes[1].textContent);

        const selfAdBtn = document.querySelector(".fu4rd6c.f1cw2swo");
        if (!selfAdBtn && adTime > 1 && !lastAdTimeText) {
          lastAdTimeText = adTime;
          const bigTime = 90;
          const cooldown = adTime > bigTime ? 3000 : 1000;
          setTimeout(() => { lastAdTimeText = 0; }, cooldown);
          const skipTime = adTime > bigTime ? bigTime : adTime - 1;
          video.currentTime += skipTime;
          showToast('⏭ Werbung übersprungen');
        }
      }
    }

    // 4. Skip Self promo ads (wait 150ms to prevent infinite loading loop)
    const dvWebPlayer = document.querySelector("#dv-web-player");
    if (dvWebPlayer && window.getComputedStyle(dvWebPlayer).display !== "none") {
      const selfAdBtn = document.querySelector(".fu4rd6c.f1cw2swo");
      if (selfAdBtn && isVisible(selfAdBtn) && !selfAdBtn.dataset.clicking) {
        selfAdBtn.dataset.clicking = "true";
        setTimeout(() => {
          robustClick(selfAdBtn);
          showToast('⏭ Werbung übersprungen');
          delete selfAdBtn.dataset.clicking;
        }, 150);
      }
    }
  }

  function ensureYouTubeSpeedControls() {
    if (!isYouTube) return;
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    let container = document.getElementById('usc-yt-speed-controls');
    if (!container) {
      container = document.createElement('div');
      container.id = 'usc-yt-speed-controls';
      container.className = 'ytp-speed-controls';

      const decBtn = document.createElement('button');
      decBtn.className = 'ytp-speed-btn ytp-speed-dec';
      decBtn.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width: 40px !important; height: 36px !important; display: block !important; transform: scaleX(-1);"><path d="M 4 6 L 10 12 L 4 18" /><path d="M 11 6 L 17 12 L 11 18" /></svg>';
      decBtn.setAttribute('title', 'Langsamer (A)');
      decBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        bumpSpeed(-SPEED_STEP);
      });

      const display = document.createElement('span');
      display.className = 'ytp-speed-display';
      display.id = 'usc-yt-speed-val';
      display.textContent = currentSpeed.toFixed(2);
      display.setAttribute('title', 'Auf 1.00× zurücksetzen');
      display.style.cursor = 'pointer';
      display.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
        if (myTabId) {
          chrome.storage.local.get(['tab_speeds'], (res) => {
            const tabSpeeds = res.tab_speeds || {};
            const activeSettings = tabSpeeds[myTabId] || {};
            tabSpeeds[myTabId] = {
              ...activeSettings,
              speed: 1.0
            };
            chrome.storage.local.set({ tab_speeds: tabSpeeds });
          });
        }
        showToast('⚡ 1.00×');
      });

      const incBtn = document.createElement('button');
      incBtn.className = 'ytp-speed-btn ytp-speed-inc';
      incBtn.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width: 40px !important; height: 36px !important; display: block !important;"><path d="M 4 6 L 10 12 L 4 18" /><path d="M 11 6 L 17 12 L 11 18" /></svg>';
      incBtn.setAttribute('title', 'Schneller (D)');
      incBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        bumpSpeed(SPEED_STEP);
      });

      container.appendChild(decBtn);
      container.appendChild(display);
      container.appendChild(incBtn);
    }

    const settingsBtn = rightControls.querySelector('.ytp-settings-button');
    if (settingsBtn) {
      if (settingsBtn.previousSibling !== container) {
        settingsBtn.before(container);
      }
    } else {
      if (!rightControls.contains(container)) {
        rightControls.appendChild(container);
      }
    }

    const valEl = document.getElementById('usc-yt-speed-val');
    if (valEl && valEl.textContent !== currentSpeed.toFixed(2)) {
      valEl.textContent = currentSpeed.toFixed(2);
    }
  }

  function updateYouTubeVolumeBoostUI() {
    const active = document.getElementById('usc-yt-volume-boost-active');
    const nativeHandle = document.querySelector('.ytp-volume-slider-handle');
    const slider = document.querySelector('.ytp-volume-slider');
    const panel = document.querySelector('.ytp-volume-panel');
    if (!active || !nativeHandle) return;

    const sliderWidth = slider ? slider.offsetWidth : 52;
    const handleWidth = nativeHandle.offsetWidth || 12;
    const panelWidth = panel ? panel.offsetWidth : 104;

    const nativeMax = sliderWidth - handleWidth; // e.g. 40
    const totalMax = panelWidth - handleWidth;   // e.g. 92
    const boostRange = totalMax - nativeMax;     // e.g. 52

    let leftPx;
    if (currentVolume > 1.0) {
      const pct = (currentVolume - 1.0) / 5.0; // 0.0 to 1.0
      leftPx = nativeMax + pct * boostRange;
      const activeWidthPx = Math.max(0, leftPx + (handleWidth / 2) - sliderWidth);
      active.style.width = activeWidthPx + 'px';
    } else {
      leftPx = currentVolume * nativeMax;
      active.style.width = '0px';
    }

    nativeHandle.style.setProperty('left', leftPx + 'px', 'important');
  }

  function ensureYouTubeVolumeBoost() {
    if (!isYouTube) return;
    const panel = document.querySelector('.ytp-volume-panel');
    if (!panel) return;

    let boostSlider = document.getElementById('usc-yt-volume-boost');
    if (!boostSlider) {
      boostSlider = document.createElement('div');
      boostSlider.id = 'usc-yt-volume-boost';
      boostSlider.className = 'usc-volume-boost-slider';

      const bg = document.createElement('div');
      bg.className = 'usc-volume-boost-track-background';

      const active = document.createElement('div');
      active.className = 'usc-volume-boost-track-active';
      active.id = 'usc-yt-volume-boost-active';

      boostSlider.appendChild(bg);
      boostSlider.appendChild(active);

      panel.appendChild(boostSlider);
    }

    if (!panel._uscVolumeBoostAttached) {
      panel._uscVolumeBoostAttached = true;
      let isDragging = false;

      function updateVolumeFromEvent(e) {
        const rect = panel.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));

        let targetVolume;
        const video = findMainVideo();

        if (pct <= 0.5) {
          targetVolume = pct * 2.0;
          if (video) {
            video.volume = targetVolume;
            video.muted = false;
          }
        } else {
          targetVolume = 1.0 + (pct - 0.5) * 10.0;
          if (video) {
            video.volume = 1.0;
            video.muted = false;
          }
        }

        if (myTabId) {
          chrome.storage.local.get(['tab_speeds'], (res) => {
            const tabSpeeds = res.tab_speeds || {};
            const activeSettings = tabSpeeds[myTabId] || {};
            tabSpeeds[myTabId] = {
              ...activeSettings,
              volume: targetVolume
            };
            chrome.storage.local.set({ tab_speeds: tabSpeeds });
          });
        }
      }

      panel.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        updateVolumeFromEvent(e);

        function onMouseMove(moveEvent) {
          if (!isDragging) return;
          updateVolumeFromEvent(moveEvent);
        }

        function onMouseUp() {
          isDragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    updateYouTubeVolumeBoostUI();
  }

  function isWatchPage() {
    const url = window.location.href;
    const host = window.location.hostname;
    
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return url.includes('/watch') || url.includes('/shorts') || url.includes('/embed');
    }
    if (host.includes('netflix.com')) {
      return url.includes('/watch/');
    }
    if (host.includes('crunchyroll.com')) {
      return url.includes('/watch/');
    }
    if (host.includes('primevideo.com') || host.includes('amazon.')) {
      return url.includes('/gp/video/') || url.includes('/watch/') || url.includes('/detail/') || url.includes('/play/');
    }
    if (host.includes('disneyplus.com')) {
      return url.includes('/play/') || url.includes('/video/');
    }
    if (host.includes('joyn.de')) {
      return url.includes('/play/') || url.includes('/live/');
    }
    if (url.includes('/watch/') || url.includes('/play/') || url.includes('/video/') || url.includes('/player/')) {
      return true;
    }
    const video = document.querySelector('video');
    if (video && video.offsetWidth > 300 && video.offsetHeight > 150) {
      return true;
    }
    return false;
  }

  // Elements can end up inside a shadow root (e.g. Disney+'s player controls).
  // document.getElementById() can't see into shadow roots, so relying on it to
  // detect "does our overlay already exist" causes it to be recreated on every
  // re-render instead of moved, piling up duplicate overlays. Cache direct
  // references instead, and only fall back to a DOM lookup once.
  function getExistingOverlayEls() {
    if (!cachedOverlay || !cachedOverlay.isConnected) {
      cachedOverlay = document.getElementById('usc-overlay');
    }
    if (!cachedBackdrop || !cachedBackdrop.isConnected) {
      cachedBackdrop = document.getElementById('usc-backdrop');
    }
    return { overlay: cachedOverlay, backdrop: cachedBackdrop };
  }

  function ensureOverlay() {
    const host = window.location.hostname;
    const isYouTubeHost = host.includes('youtube.com') || host.includes('youtu.be');
    // YouTube gets its own native-styled speed/volume controls (see
    // ensureYouTubeSpeedControls/ensureYouTubeVolumeBoost) — don't also show
    // the generic floating badge/panel there.
    if (!isWatchPage() || isYouTubeHost) {
      const { overlay: existing, backdrop: existingBackdrop } = getExistingOverlayEls();
      if (existing) {
        existing.style.setProperty('display', 'none', 'important');
      }
      if (existingBackdrop) {
        existingBackdrop.style.setProperty('display', 'none', 'important');
      }
      return;
    }

    let { overlay, backdrop } = getExistingOverlayEls();
    let targetParent = document.body;
    let referenceNode = null;
    const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    
    if (fullscreenEl) {
      const controls = findControlsContainer();
      if (controls) {
        targetParent = controls;
      } else {
        const video = findMainVideo();
        if (video && video.parentElement && video.getRootNode() === document) {
          targetParent = video.parentElement;
        } else {
          targetParent = fullscreenEl;
        }
      }
      if (targetParent.tagName === 'VIDEO' || targetParent.tagName === 'IFRAME') {
        targetParent = document.body;
      }
    }

    const isNetflix = host.includes('netflix.com');
    const isCrunchyroll = host.includes('crunchyroll.com');
    if (isNetflix) {
      const netflixTarget = getNetflixControlsTarget();
      if (netflixTarget) {
        targetParent = netflixTarget.parent;
        referenceNode = netflixTarget.reference;
      } else {
        const controls = document.querySelector('[data-uia="controls-standard"]');
        if (controls) {
          targetParent = controls;
        }
      }
    } else if (isCrunchyroll) {
      const crunchyrollTarget = getCrunchyrollControlsTarget();
      if (crunchyrollTarget) {
        targetParent = crunchyrollTarget.parent;
        referenceNode = crunchyrollTarget.reference;
      } else {
        const controls = document.querySelector('[data-testid="bottom-controls-autohide"]');
        if (controls) targetParent = controls;
      }
    }

    if (overlay && backdrop) {
      if (!isNetflix && !isCrunchyroll) overlay.style.setProperty('display', 'block', 'important');
      if (!isNetflix && !isCrunchyroll) backdrop.style.setProperty('display', 'block', 'important');
      
      if (referenceNode && referenceNode.parentNode === targetParent) {
        if (overlay.parentNode !== targetParent || overlay.nextSibling !== referenceNode) {
          targetParent.insertBefore(overlay, referenceNode);
        }
      } else {
        if (overlay.parentNode !== targetParent) {
          targetParent.appendChild(overlay);
        }
      }
      
      if (backdrop.parentNode !== targetParent || backdrop.nextSibling !== overlay) {
        targetParent.insertBefore(backdrop, overlay);
      }
      return;
    }

    if (overlay) overlay.remove();
    if (backdrop) backdrop.remove();

    backdrop = document.createElement('div');
    backdrop.id = 'usc-backdrop';
    if (!isNetflix && !isCrunchyroll) backdrop.style.setProperty('display', 'block', 'important');

    overlay = document.createElement('div');
    overlay.id = 'usc-overlay';
    if (!isNetflix && !isCrunchyroll) overlay.style.setProperty('display', 'block', 'important');

    cachedOverlay = overlay;
    cachedBackdrop = backdrop;

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      overlay.classList.add('usc-youtube');
      backdrop.classList.add('usc-youtube');
    } else if (host.includes('netflix.com')) {
      overlay.classList.add('usc-netflix');
      backdrop.classList.add('usc-netflix');
    } else if (host.includes('primevideo.com') || host.includes('amazon.')) {
      overlay.classList.add('usc-prime');
      backdrop.classList.add('usc-prime');
    } else if (host.includes('disneyplus.com')) {
      overlay.classList.add('usc-disney');
      backdrop.classList.add('usc-disney');
    } else if (host.includes('joyn.de')) {
      overlay.classList.add('usc-joyn');
      backdrop.classList.add('usc-joyn');
    } else if (host.includes('crunchyroll.com')) {
      overlay.classList.add('usc-crunchyroll');
      backdrop.classList.add('usc-crunchyroll');
    }
    
    overlay.innerHTML = `
      <style>
        #usc-overlay .usc-card-body {
          padding: 12px 16px !important;
          overflow: visible !important;
          min-height: 60px !important;
        }

        #usc-overlay input[type=range] {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 100% !important;
          height: 44px !important;
          border-radius: 28px !important;
          background: transparent !important;
          outline: none !important;
          cursor: pointer !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }

        #usc-overlay input[type=range]:focus {
          outline: none !important;
        }

        #usc-speed-slider::-webkit-slider-runnable-track {
          background: linear-gradient(to right, #80D8DF var(--pct, 0%), rgba(128, 216, 223, 0.08) var(--pct, 0%)) !important;
          border-radius: 28px !important;
          height: 28px !important;
          transition: background 0.1s ease !important;
        }

        #usc-vol-slider::-webkit-slider-runnable-track {
          background: linear-gradient(to right, #a3e635 var(--vpct, 0%), rgba(163, 230, 53, 0.12) var(--vpct, 0%)) !important;
          border-radius: 28px !important;
          height: 28px !important;
          transition: background 0.1s ease !important;
        }

        #usc-overlay input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          margin-top: -6px !important;
          height: 40px !important;
          width: 10px !important;
          border-radius: 9999px !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
          transition: transform 0.1s ease !important;
          border: none !important;
          cursor: grab !important;
        }

        #usc-speed-slider::-webkit-slider-thumb {
          background-color: #80D8DF !important;
        }

        #usc-vol-slider::-webkit-slider-thumb {
          background-color: #a3e635 !important;
        }

        #usc-overlay input[type=range]:active::-webkit-slider-thumb {
          transform: scaleY(1.1) scaleX(1.3) !important;
          cursor: grabbing !important;
        }

      </style>
      <div id="usc-badge" title="NINA Player-Steuerung">
        <svg viewBox="0 0 24 24" class="usc-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
          <rect x="3" y="3" width="18" height="18" rx="6" stroke="currentColor" stroke-width="2.2" fill="none" />
          <path d="M9 17V7l6 10V7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <img class="usc-ext-icon" alt="NINA" width="24" height="24" style="display:none;" />
        <span class="usc-val" id="usc-badge-val">1.00×</span>
        <span class="usc-dot"></span>
      </div>

      <div id="usc-panel">
        <div class="usc-card">
          <div class="usc-card-header">
            <span class="usc-card-title-group">
              <svg viewBox="0 0 24 24" class="usc-card-icon" width="18" height="18" fill="none" stroke="#80D8DF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a4.122 4.122 0 003 4.12 4.122 4.122 0 003-4.12 8.284 8.284 0 00.362-4.386z" />
                <path d="M12 9.75v3.25" />
              </svg>
              <span class="usc-card-title">Geschwindigkeit</span>
            </span>
            <span class="usc-card-badge usc-speed-badge" id="usc-panel-speed-val">1.00x</span>
          </div>
          <div class="usc-card-body">
            <input type="range" class="usc-slider" id="usc-speed-slider" min="0.25" max="3.0" step="0.05" value="1.0">
          </div>
        </div>

        <div class="usc-card">
          <div class="usc-card-header">
            <span class="usc-card-title-group">
              <svg viewBox="0 0 24 24" class="usc-card-icon" width="18" height="18" fill="none" stroke="#a3e635" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
              <span class="usc-card-title">Audio (Verstärkung)</span>
            </span>
            <span class="usc-card-badge usc-vol-badge" id="usc-panel-vol-val">100%</span>
          </div>
          <div class="usc-card-body">
            <input type="range" class="usc-slider" id="usc-vol-slider" min="0" max="600" step="10" value="100">
          </div>
        </div>
      </div>
    `;

    if (referenceNode && referenceNode.parentNode === targetParent) {
      targetParent.insertBefore(overlay, referenceNode);
      targetParent.insertBefore(backdrop, overlay);
    } else {
      targetParent.appendChild(backdrop);
      targetParent.appendChild(overlay);
    }

    // Keep reference but use CSS-only approach
    overlay._forceStyleSliders = null;

    const badge = overlay.querySelector('#usc-badge');
    const panel = overlay.querySelector('#usc-panel');
    const speedSlider = overlay.querySelector('#usc-speed-slider');
    const volSlider = overlay.querySelector('#usc-vol-slider');
    const speedValBadge = overlay.querySelector('#usc-badge-val');
    const speedValPanel = overlay.querySelector('#usc-panel-speed-val');
    const volValPanel = overlay.querySelector('#usc-panel-vol-val');
    const extIcon = overlay.querySelector('.usc-ext-icon');
    const inlineSvg = overlay.querySelector('.usc-icon');

    // Set extension icon src (must use chrome.runtime.getURL in content scripts)
    if (extIcon && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      extIcon.src = chrome.runtime.getURL('icons/icon48.png');
    }

    // On Netflix / Crunchyroll: show the extension icon, hide the inline SVG
    if ((isNetflix || isCrunchyroll) && extIcon && inlineSvg) {
      extIcon.style.setProperty('display', 'block', 'important');
      inlineSvg.style.setProperty('display', 'none', 'important');
    }


    function setOverlayOpen(open) {
      const isVisible = panel.classList.contains('usc-visible');
      if (isVisible === open) return;

      panel.classList.toggle('usc-visible', open);
      backdrop.classList.toggle('usc-visible', open);

      if (open) {
        if (pauseOnOpenSetting) {
          const video = findMainVideo();
          if (video && !video.paused) {
            wasPlayingOnOpen = true;
            video.pause();
          } else {
            wasPlayingOnOpen = false;
          }
        } else {
          wasPlayingOnOpen = false;
        }
      } else {
        if (pauseOnOpenSetting && wasPlayingOnOpen) {
          const video = findMainVideo();
          if (video) {
            resumeUniversalVideo(video);
          }
        }
        wasPlayingOnOpen = false;
      }
    }

    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !panel.classList.contains('usc-visible');
      setOverlayOpen(open);
    });

    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      setOverlayOpen(false);
    });

    document.addEventListener('click', (e) => {
      if (!overlay.contains(e.target) && e.target !== backdrop) {
        setOverlayOpen(false);
      }
    });

    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    function updateUI(speed, vol) {
      if (speed !== undefined) {
        const maxVal = speed > 3.0 ? 10.0 : 3.0;
        speedSlider.max = maxVal;
        speedSlider.value = speed;
        speedValBadge.textContent = speed.toFixed(2) + '×';
        speedValPanel.textContent = speed.toFixed(2) + 'x';

        const pct = Math.max(0, Math.min(100, ((speed - 0.25) / (maxVal - 0.25)) * 100));
        speedSlider.style.setProperty('--pct', pct + '%', 'important');
      }
      if (vol !== undefined) {
        const volPct = Math.round(vol * 100);
        volSlider.value = volPct;
        volValPanel.textContent = volPct + '%';

        const pct = Math.max(0, Math.min(100, (volPct / 600) * 100));
        volSlider.style.setProperty('--vpct', pct + '%', 'important');
      }
    }

    overlay._updateUI = updateUI;
    updateUI(currentSpeed, currentVolume);

    function saveSpeed(s) {
      const maxVal = currentSpeed > 3.0 ? 10.0 : 3.0;
      const targetSpeed = clamp(s, SPEED_MIN, maxVal);
      currentSpeed = targetSpeed;
      updateUI(targetSpeed, undefined);
      if (myTabId) {
        chrome.storage.local.get(['tab_speeds'], (res) => {
          const tabSpeeds = res.tab_speeds || {};
          const activeSettings = tabSpeeds[myTabId] || {};
          tabSpeeds[myTabId] = {
            ...activeSettings,
            speed: targetSpeed
          };
          chrome.storage.local.set({ tab_speeds: tabSpeeds });
        });
      }
    }

    function saveVolume(v) {
      const targetVolume = clamp(v, VOL_MIN, VOL_MAX);
      currentVolume = targetVolume;
      updateUI(undefined, targetVolume);
      if (myTabId) {
        chrome.storage.local.get(['tab_speeds'], (res) => {
          const tabSpeeds = res.tab_speeds || {};
          const activeSettings = tabSpeeds[myTabId] || {};
          tabSpeeds[myTabId] = {
            ...activeSettings,
            volume: targetVolume
          };
          chrome.storage.local.set({ tab_speeds: tabSpeeds });
        });
      }
    }

    speedSlider.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (Math.abs(val - 1.0) <= 0.07) {
        val = 1.0;
        e.target.value = "1.0";
      }
      saveSpeed(val);
    });

    volSlider.addEventListener('input', (e) => {
      let val = parseInt(e.target.value);
      if (Math.abs(val - 100) <= 12) {
        val = 100;
        e.target.value = "100";
      }
      saveVolume(val / 100);
    });

    speedSlider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = 0.05;
      saveSpeed(currentSpeed + (e.deltaY < 0 ? step : -step));
    }, { passive: false });

    volSlider.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = 0.1;
      saveVolume(currentVolume + (e.deltaY < 0 ? step : -step));
    }, { passive: false });
  }

  function autoSkipTick() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    ensureYouTubeSpeedControls();
    ensureYouTubeVolumeBoost();
    ensureOverlay();
    if (!autoSkipEnabled) return;
    // YouTube reuses .ytp-next-button's class (from NEXT_SELECTORS, meant
    // for other sites' "next episode" buttons) for the Shorts player's own
    // "next short" arrow. That made this generic auto-advance logic
    // randomly skip Shorts on its own. Shorts aren't episodic content this
    // feature makes sense for anyway, so skip it there entirely.
    if (location.pathname.startsWith('/shorts')) return;
    const now = Date.now();
    const main = findMainVideo();
    if (!main || main.offsetWidth < 50) return;

    if (!main.paused && (now - lastSkipTime) > SKIP_COOLDOWN) {
      const btn = findSkippable(SKIP_SELECTORS, SKIP_TEXTS);
      if (btn) {
        if (!btn._detectedAt) btn._detectedAt = now;
        if (now - btn._detectedAt >= autoSkipDelay * 1000) {
          lastSkipTime = now;
          robustClick(btn);
          showToast('⏭ Intro übersprungen');
        }
        return;
      }

      const nb = findSkippable(NEXT_SELECTORS, NEXT_TEXTS);
      if (nb && location.href !== lastNextHref) {
        if (!nb._detectedAt) nb._detectedAt = now;
        if (now - nb._detectedAt >= autoSkipDelay * 1000) {
          lastNextHref = location.href;
          showToast('▶ Nächste Folge');
          robustClick(nb);
        }
      }
    }
  }

  const host = window.location.hostname;
  const isNetflix = host.includes('netflix.com');
  const isPrimeVideo = host.includes('primevideo.com') || host.includes('amazon.');

  if (isNetflix || isPrimeVideo) {
    const platformTick = () => {
      try {
        // Re-attach the overlay reactively on every relevant DOM mutation, not
        // just on the 800ms poll below — Netflix re-renders its controls bar
        // often enough that the badge could sit detached/misplaced for most of
        // that window, making its click silently miss.
        ensureOverlay();
        const video = findMainVideo();
        if (isNetflix) {
          runNetflixSkipper();
          checkNetflixAds(video);
        } else if (isPrimeVideo) {
          runAmazonSkipper(video);
        }
      } catch (e) {
        console.error("NINA platform skipper error:", e);
      }
    };

    const observer = new MutationObserver(platformTick);
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-uia']
    });

    setInterval(platformTick, 200);

    // Also run the general setup for overlay
    setInterval(() => {
      ensureYouTubeSpeedControls();
      ensureYouTubeVolumeBoost();
      ensureOverlay();
    }, 800);
  } else {
    setInterval(autoSkipTick, 800);
  }

  // ── Message handling for Thanks & Download button toggle ────────────────────
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'toggleThanksDownload') {
      if (request.enabled) {
        document.body.classList.add('nina-show-thanks-download');
        document.documentElement.classList.add('nina-show-thanks-download');
      } else {
        document.body.classList.remove('nina-show-thanks-download');
        document.documentElement.classList.remove('nina-show-thanks-download');
      }
      sendResponse({ ok: true });
    }
  });
})();
