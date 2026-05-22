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
  const VOL_MIN   = 0,    VOL_MAX   = 6,  VOL_STEP   = 0.1;

  let currentSpeed    = 1;
  let currentVolume   = 1;
  let autoSkipEnabled = true;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 100) / 100));

  // ── Storage sync ─────────────────────────────────────────────────────────────
  chrome.storage.local.get(['joyn_speed', 'joyn_volume', 'joyn_autoskip'], (res) => {
    const s = parseFloat(res.joyn_speed);
    const v = parseFloat(res.joyn_volume);
    currentSpeed    = isFinite(s) ? clamp(s, SPEED_MIN, SPEED_MAX) : 1;
    currentVolume   = isFinite(v) ? clamp(v, VOL_MIN,   VOL_MAX)   : 1;
    autoSkipEnabled = res.joyn_autoskip !== undefined ? !!res.joyn_autoskip : true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.joyn_speed && changes.joyn_speed.newValue !== undefined) {
      const s = parseFloat(changes.joyn_speed.newValue);
      if (isFinite(s)) currentSpeed = clamp(s, SPEED_MIN, SPEED_MAX);
    }
    if (changes.joyn_volume && changes.joyn_volume.newValue !== undefined) {
      const v = parseFloat(changes.joyn_volume.newValue);
      if (isFinite(v)) currentVolume = clamp(v, VOL_MIN, VOL_MAX);
    }
    if (changes.joyn_autoskip && changes.joyn_autoskip.newValue !== undefined) {
      autoSkipEnabled = !!changes.joyn_autoskip.newValue;
    }
  });

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function bumpSpeed(delta) {
    const s = clamp(currentSpeed + delta, SPEED_MIN, SPEED_MAX);
    if (s === currentSpeed) return;
    currentSpeed = s;
    chrome.storage.local.set({ joyn_speed: s });
    showToast('⚡ ' + s.toFixed(2) + '×');
  }

  function bumpVolume(delta) {
    const v = clamp(currentVolume + delta, VOL_MIN, VOL_MAX);
    if (v === currentVolume) return;
    currentVolume = v;
    chrome.storage.local.set({ joyn_volume: v });
    showToast('🔊 ' + Math.round(v * 100) + '%');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(document.activeElement)) return;
    const key = e.key.toLowerCase();
    if (key === 'd')             bumpSpeed( SPEED_STEP);
    else if (key === 'a')        bumpSpeed(-SPEED_STEP);
    else if (e.key === 'ArrowUp')   bumpVolume( VOL_STEP);
    else if (e.key === 'ArrowDown') bumpVolume(-VOL_STEP);
  });

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
  const SKIP_SELECTORS = [
    '.skip-intro', '.skipIntro', '[data-uia="skip-intro"]',
    '.ytp-ad-skip-button', '.ytp-skip-ad-button', '[class*="skip-ad"]',
    '.vjs-skip-button', '.skip-button',
    '[class*="skip_intro"]', '[class*="skipIntro"]', '[data-testid*="skip"]',
    '[class*="skipButton"]', '[id*="skipButton"]',
    '[aria-label*="intro" i]', '[aria-label*="skip" i]',
  ];
  const SKIP_TEXTS = [
    'skip intro', 'intro überspringen', 'vorspann überspringen',
    'opening skip', 'skip opening', 'intro skippen',
  ];
  const NEXT_SELECTORS = [
    '[data-uia="next-episode-seamless-button"]', '[data-uia="next-episode"]',
    '.ytp-next-button',
    '[class*="nextEpisode"]', '[class*="next-episode"]',
    '[id*="nextEpisode"]',
    '[data-testid*="next-episode"]', '[aria-label*="next episode" i]',
    '[aria-label*="nächste folge" i]',
  ];
  const NEXT_TEXTS = [
    'nächste folge', 'next episode', 'next video', 'weiter zu', 'zur nächsten', 'play next',
  ];

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    try { return el.getBoundingClientRect().width > 0; } catch (_) { return false; }
  }

  function textMatches(el, phrases) {
    const t = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase().trim();
    for (const p of phrases) if (t.includes(p)) return true;
    return false;
  }

  function findSkippable(selectors, texts) {
    for (const sel of selectors) {
      let hits;
      try { hits = document.querySelectorAll(sel); } catch (_) { continue; }
      for (const el of hits) if (isVisible(el)) return el;
    }
    try {
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        if (isVisible(el) && textMatches(el, texts)) return el;
      }
    } catch (_) {}
    return null;
  }

  function findMainVideo() {
    const vids = document.querySelectorAll('video');
    let best = null;
    for (const v of vids) {
      if (v.offsetWidth > 300 && v.offsetHeight > 150 && !v.paused) { best = v; break; }
    }
    return best || vids[0] || null;
  }

  const SKIP_COOLDOWN = 5000;
  let lastSkipTime = 0;
  let lastNextHref = null;

  function autoSkipTick() {
    if (!autoSkipEnabled) return;
    const now = Date.now();
    const main = findMainVideo();
    if (!main || main.offsetWidth < 50) return;

    if (!main.paused && (now - lastSkipTime) > SKIP_COOLDOWN) {
      const btn = findSkippable(SKIP_SELECTORS, SKIP_TEXTS);
      if (btn) {
        lastSkipTime = now;
        btn.click();
        showToast('⏭ Intro übersprungen');
        return;
      }
    }

    if (main.duration > 10 && (main.currentTime / main.duration) > 0.85) {
      const nb = findSkippable(NEXT_SELECTORS, NEXT_TEXTS);
      if (nb && location.href !== lastNextHref) {
        lastNextHref = location.href;
        showToast('▶ Nächste Folge');
        nb.click();
      }
    }
  }

  setInterval(autoSkipTick, 800);
})();
