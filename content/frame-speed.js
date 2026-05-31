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
  const KEY_FF_SPEED = 'joyn_ff_speed';
  const CACHE_KEY   = 'joyn_speed_value';
  const CACHE_FF_KEY = 'joyn_ff_speed_value';
  const IS_JOYN_CTX =
    location.hostname.includes('joyn.de') || location.hostname.includes('glomex');

  let lastPushedRate = null;
  let lastPushedFFRate = null;
  let lastPushedVolume = null;

  function pushRate(rate) {
    const r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    if (r === lastPushedRate) return;
    lastPushedRate = r;
    try { localStorage.setItem(CACHE_KEY, r); } catch (_) {}
    try { window.postMessage({ __joynSpeed: r }, '*'); } catch (_) {}
  }

  function pushFFRate(rate) {
    const r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    if (r === lastPushedFFRate) return;
    lastPushedFFRate = r;
    try { localStorage.setItem(CACHE_FF_KEY, r); } catch (_) {}
    try { window.postMessage({ __joynFFSpeed: r }, '*'); } catch (_) {}
  }

  function pushVolume(gain) {
    const g = parseFloat(gain);
    if (!isFinite(g) || g < 0) return;
    if (g === lastPushedVolume) return;
    lastPushedVolume = g;
    try { window.postMessage({ __uscVolume: g }, '*'); } catch (_) {}
  }

  let myTabId = null;

  // ── Initial sync ─────────────────────────────────────────────────────────────
  try {
    chrome.runtime.sendMessage({ type: 'GET_TAB_SETTINGS' }, (res) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      if (chrome.runtime.lastError) return;
      if (res) {
        myTabId = res.tabId;
        if (res.speed !== undefined) pushRate(res.speed);
        if (res.volume !== undefined) pushVolume(res.volume);
        if (res.ffSpeed !== undefined) pushFFRate(res.ffSpeed);
      }
    });

    chrome.storage.local.get([
      'joyn_hide_xray',
      'joyn_hide_prime_controls',
      'joyn_hide_prime_topbar',
      'joyn_hide_prime_nextup',
      'joyn_hide_prime_settings'
    ], (res) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      if (chrome.runtime.lastError) return;
      const resSafe = res || {};
      if (resSafe.joyn_hide_xray) document.documentElement.classList.add('nina-hide-xray');
      if (resSafe.joyn_hide_prime_controls) document.documentElement.classList.add('nina-hide-prime-controls');
      if (resSafe.joyn_hide_prime_topbar) document.documentElement.classList.add('nina-hide-prime-topbar');
      if (resSafe.joyn_hide_prime_nextup) document.documentElement.classList.add('nina-hide-prime-nextup');
      if (resSafe.joyn_hide_prime_settings) document.documentElement.classList.add('nina-hide-prime-settings');
    });
  } catch (_) {}

  // ── Live updates ─────────────────────────────────────────────────────────────
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      if (area !== 'local') return;
      if (changes.tab_speeds && myTabId) {
        const newTabSettings = changes.tab_speeds.newValue[myTabId];
        const oldTabSettings = changes.tab_speeds.oldValue ? changes.tab_speeds.oldValue[myTabId] : null;
        if (newTabSettings) {
          if (!oldTabSettings || newTabSettings.speed !== oldTabSettings.speed) {
            pushRate(newTabSettings.speed);
          }
          if (!oldTabSettings || newTabSettings.volume !== oldTabSettings.volume) {
            pushVolume(newTabSettings.volume);
          }
        }
      }
      if (changes[KEY_FF_SPEED] && changes[KEY_FF_SPEED].newValue !== undefined) {
        pushFFRate(changes[KEY_FF_SPEED].newValue);
      }
      if (changes.joyn_hide_xray !== undefined) {
        const val = !!changes.joyn_hide_xray.newValue;
        document.documentElement.classList.toggle('nina-hide-xray', val);
      }
      if (changes.joyn_hide_prime_controls !== undefined) {
        const val = !!changes.joyn_hide_prime_controls.newValue;
        document.documentElement.classList.toggle('nina-hide-prime-controls', val);
      }
      if (changes.joyn_hide_prime_topbar !== undefined) {
        const val = !!changes.joyn_hide_prime_topbar.newValue;
        document.documentElement.classList.toggle('nina-hide-prime-topbar', val);
      }
      if (changes.joyn_hide_prime_nextup !== undefined) {
        const val = !!changes.joyn_hide_prime_nextup.newValue;
        document.documentElement.classList.toggle('nina-hide-prime-nextup', val);
      }
      if (changes.joyn_hide_prime_settings !== undefined) {
        const val = !!changes.joyn_hide_prime_settings.newValue;
        document.documentElement.classList.toggle('nina-hide-prime-settings', val);
      }
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
