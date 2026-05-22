// speed-patch.js — MAIN world · all frames · document_start
//
// Single source of truth for playback rate enforcement in this frame.
//
//   1. Patches HTMLMediaElement.prototype.playbackRate + defaultPlaybackRate
//      so player code cannot reset the user's chosen rate.
//   2. Attaches one capture-phase listener per <video> for ratechange/play/seeked
//      so resets snap back instantly — no polling.
//   3. Discovers new <video> elements via a microtask-batched MutationObserver
//      (no per-event tree walks, shadow-DOM aware).
//   4. Receives target rate via window.postMessage({__joynSpeed:<n>}) from the
//      ISOLATED-world bridge (frame-speed.js).
//   5. Seeds initial rate from localStorage so persistence survives reloads
//      even before chrome.storage resolves.

(function () {
  'use strict';
  if (window.__uscSpeedPatchLoaded) return;
  window.__uscSpeedPatchLoaded = true;

  const KEY = 'joyn_speed_value';
  const EPSILON = 0.01;
  const RATE_EVENTS = ['ratechange', 'play', 'playing', 'seeked', 'loadeddata'];

  function readLocalRate() {
    try {
      const v = parseFloat(localStorage.getItem(KEY));
      return isFinite(v) && v > 0 ? v : 1;
    } catch (_) { return 1; }
  }

  let targetRate = readLocalRate();
  const enforced = new WeakSet();

  // ── 1. Prototype patch ───────────────────────────────────────────────────────
  const proto    = HTMLMediaElement.prototype;
  const rateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  const origGet  = rateDesc && rateDesc.get ? rateDesc.get : null;
  const origSet  = rateDesc && rateDesc.set ? rateDesc.set : null;

  if (origSet) {
    Object.defineProperty(proto, 'playbackRate', {
      get() { return origGet.call(this); },
      set(val) {
        if (this._uscForce) { this._uscForce = false; origSet.call(this, val); return; }
        if (Math.abs(targetRate - 1) < EPSILON) origSet.call(this, val);
        else origSet.call(this, targetRate);
      },
      configurable: true,
      enumerable: true,
    });

    const defDesc = Object.getOwnPropertyDescriptor(proto, 'defaultPlaybackRate');
    if (defDesc && defDesc.set) {
      const origDefSet = defDesc.set;
      Object.defineProperty(proto, 'defaultPlaybackRate', {
        get: defDesc.get,
        set(val) {
          if (Math.abs(targetRate - 1) < EPSILON) origDefSet.call(this, val);
          else origDefSet.call(this, targetRate);
        },
        configurable: true,
        enumerable: true,
      });
    }
  }

  // ── 2. Per-video enforcement ─────────────────────────────────────────────────
  function readRate(video) {
    try { return origGet ? origGet.call(video) : video.playbackRate; }
    catch (_) { return 1; }
  }

  function forceRate(video, rate) {
    try {
      if (origSet) { video._uscForce = true; origSet.call(video, rate); }
      else { video.playbackRate = rate; }
    } catch (_) {}
  }

  function snapBack(video) {
    if (Math.abs(targetRate - 1) < EPSILON) return;
    if (Math.abs(readRate(video) - targetRate) > EPSILON) forceRate(video, targetRate);
  }

  function attach(video) {
    if (enforced.has(video)) return;
    enforced.add(video);
    const handler = function () { snapBack(this); };
    for (const evt of RATE_EVENTS) video.addEventListener(evt, handler, true);
    snapBack(video);
  }

  // ── 3. Discovery (microtask-batched, shadow-DOM aware) ───────────────────────
  function collectVideos(root, out) {
    try {
      const vids = root.querySelectorAll('video');
      for (const v of vids) out.push(v);
    } catch (_) {}
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) collectVideos(el.shadowRoot, out);
    } catch (_) {}
    return out;
  }

  function scan() {
    const found = collectVideos(document, []);
    for (const v of found) attach(v);
  }

  let scanQueued = false;
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => { scanQueued = false; scan(); });
  }

  scan();
  document.addEventListener('DOMContentLoaded', scan, { once: true });

  try {
    new MutationObserver(scheduleScan).observe(
      document.documentElement || document,
      { childList: true, subtree: true }
    );
  } catch (_) {}

  // ── 4. External rate updates ─────────────────────────────────────────────────
  function applyRate(rate) {
    const r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    targetRate = r;
    try { localStorage.setItem(KEY, r); } catch (_) {}
    const found = collectVideos(document, []);
    const enforce = Math.abs(targetRate - 1) >= EPSILON;
    for (const v of found) {
      attach(v);
      if (enforce) forceRate(v, r);
    }
  }

  window.__joynForceSpeed = applyRate;

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (typeof e.data.__joynSpeed === 'number') applyRate(e.data.__joynSpeed);
  });

  // ── 5. Diagnostics ───────────────────────────────────────────────────────────
  // Inspected by popup.js via chrome.scripting.executeScript in all frames.
  window.__uscDiagnose = function () {
    const found = collectVideos(document, []);
    return {
      url: location.href,
      origin: location.origin,
      targetRate,
      interceptActive: !!origSet,
      videoCount: found.length,
      videos: found.map((v) => ({
        rate: readRate(v),
        paused: v.paused,
        readyState: v.readyState,
        hasSrc: !!(v.currentSrc || v.src),
        width: v.offsetWidth,
        height: v.offsetHeight,
        duration: isFinite(v.duration) ? v.duration : null,
        currentTime: v.currentTime,
      })),
    };
  };
})();
