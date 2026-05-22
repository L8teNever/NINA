// frame-speed.js — ISOLATED world · all frames · document_start
//
// Pure chrome.storage ↔ window.postMessage bridge for this frame. All rate
// enforcement lives in speed-patch.js (MAIN world). This file also handles
// the Joyn-specific overlay-hiding, which has to run in cross-origin frames
// (the glomex player iframe).

(function () {
  'use strict';
  if (window.__uscFrameBridgeLoaded) return;
  window.__uscFrameBridgeLoaded = true;

  const KEY_SPEED   = 'joyn_speed';
  const KEY_VOLUME  = 'joyn_volume';
  const CACHE_KEY   = 'joyn_speed_value';
  const IS_JOYN_CTX =
    location.hostname.includes('joyn.de') || location.hostname.includes('glomex');

  function pushRate(rate) {
    const r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    try { localStorage.setItem(CACHE_KEY, r); } catch (_) {}
    try { window.postMessage({ __joynSpeed: r }, '*'); } catch (_) {}
  }

  function pushVolume(gain) {
    const g = parseFloat(gain);
    if (!isFinite(g) || g < 0) return;
    try { window.postMessage({ __uscVolume: g }, '*'); } catch (_) {}
  }

  // ── Initial sync ─────────────────────────────────────────────────────────────
  try {
    chrome.storage.local.get([KEY_SPEED, KEY_VOLUME], (res) => {
      if (chrome.runtime.lastError) return;
      if (res[KEY_SPEED]  !== undefined) pushRate(res[KEY_SPEED]);
      if (res[KEY_VOLUME] !== undefined) pushVolume(res[KEY_VOLUME]);
    });
  } catch (_) {}

  // ── Live updates ─────────────────────────────────────────────────────────────
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[KEY_SPEED]  && changes[KEY_SPEED].newValue  !== undefined) pushRate(changes[KEY_SPEED].newValue);
      if (changes[KEY_VOLUME] && changes[KEY_VOLUME].newValue !== undefined) pushVolume(changes[KEY_VOLUME].newValue);
    });
  } catch (_) {}

  // ── Joyn overlay hiding (only when we're in a Joyn or Glomex frame) ──────────
  if (IS_JOYN_CTX) {
    const SELECTORS = [
      '[class*="overlay"]', '[class*="Overlay"]',
      '[class*="pause-screen"]', '[class*="PauseScreen"]',
      '[class*="bento"]', '[class*="Bento"]',
      '[class*="player-ui"]', '[class*="PlayerUI"]',
      '[class*="hover-controls"]', '[class*="HoverControls"]',
    ];
    const PROTECTED = '#usc-overlay, #usc-panel, #usc-sb-skip-btn';

    function injectCSS(root) {
      if (!root || root._uscOverlayCSS) return;
      root._uscOverlayCSS = true;
      try {
        const style = document.createElement('style');
        style.textContent =
          '[class*="overlay" i], [class*="pause" i][class*="screen" i],' +
          '[class*="bento" i], [class*="controls-overlay" i],' +
          '[class*="player-ui" i], [class*="hover" i][class*="overlay" i] {' +
          '  display: none !important; opacity: 0 !important;' +
          '  visibility: hidden !important; pointer-events: none !important; }';
        (root.head || root).appendChild(style);
      } catch (_) {}
    }

    function hide(root) {
      injectCSS(root);
      for (const sel of SELECTORS) {
        let hits;
        try { hits = root.querySelectorAll(sel); } catch (_) { continue; }
        for (const el of hits) {
          if (el.closest && el.closest(PROTECTED)) continue;
          el.style.setProperty('display', 'none', 'important');
          el.style.setProperty('opacity', '0', 'important');
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
        }
      }
      try {
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) hide(el.shadowRoot);
        }
      } catch (_) {}
    }

    setInterval(() => hide(document), 3000);
    hide(document);
  }
})();
