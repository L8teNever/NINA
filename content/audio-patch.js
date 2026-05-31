// audio-patch.js — MAIN world, all frames, document_start.
// Universal volume boost via WebAudio GainNode (up to 6x native).
//
// Receives target gain via window.postMessage({ __uscVolume: <number> }) from
// frame-speed.js / popup.js. Lazily creates an AudioContext + per-video gain
// node on first request and resumes the context on user interaction (browser
// autoplay policy).

(function () {
  'use strict';

  if (window.__uscAudioPatchLoaded) return;
  window.__uscAudioPatchLoaded = true;

  window.__uscAudioCtx  = null;
  window.__uscGainNodes = new WeakMap();
  let currentGain = 1;
  let hasUserGesture = false;

  function ensureCtx() {
    if (window.__uscAudioCtx) return window.__uscAudioCtx;
    if (!hasUserGesture) return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      window.__uscAudioCtx = new Ctor();
    } catch (_) {
      return null;
    }
    return window.__uscAudioCtx;
  }

  function resumeOnInteraction() {
    hasUserGesture = true;
    try {
      const ctx = window.__uscAudioCtx;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (_) {}
  }
  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, resumeOnInteraction, { capture: true });
  });

  function setupVideo(video) {
    if (window.__uscGainNodes.has(video)) return window.__uscGainNodes.get(video);
    const ctx = ensureCtx();
    if (!ctx) return null;
    try {
      const src = ctx.createMediaElementSource(video);
      const gn  = ctx.createGain();
      src.connect(gn);
      gn.connect(ctx.destination);
      window.__uscGainNodes.set(video, gn);
      return gn;
    } catch (_) {
      // createMediaElementSource throws if the element was already piped
      // through another AudioContext, or for some CORS-tainted media.
      return null;
    }
  }

  function collectVideos(root, out = []) {
    if (!root) return out;
    try {
      const vids = root.querySelectorAll('video');
      for (const v of vids) out.push(v);
    } catch (_) {}
    try {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) collectVideos(el.shadowRoot, out);
      }
    } catch (_) {}
    return out;
  }

  function applyGain(gain) {
    const videos = collectVideos(document);
    videos.forEach((v) => {
      const gn = setupVideo(v);
      if (gn) {
        gn.gain.value = gain > 1 ? gain : 1;
      }
      try {
        if (gain <= 1) {
          v.volume = gain;
        } else {
          v.volume = 1;
        }
      } catch (_) {}
    });
  }


  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.__uscVolume !== 'number') return;
    currentGain = e.data.__uscVolume;
    applyGain(currentGain);
  });

  // Re-apply when new <video> elements appear (SPA nav, lazy mount).
  try {
    new MutationObserver(() => {
      if (hasUserGesture && currentGain !== 1) applyGain(currentGain);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Periodic scanner to catch dynamically mounted video elements in Shadow DOMs
  setInterval(() => {
    if (hasUserGesture && currentGain !== 1) applyGain(currentGain);
  }, 1500);

  window.__uscDiagnoseAudio = function () {
    const ctx = window.__uscAudioCtx;
    const videos = [];
    const vids = collectVideos(document);
    vids.forEach((v) => {
      const gn = window.__uscGainNodes.get(v);
      videos.push({ gain: gn ? gn.gain.value : null, nativeVolume: v.volume });
    });
    return {
      ctxState: ctx ? ctx.state : 'none',
      targetGain: currentGain,
      videos,
    };
  };
})();
