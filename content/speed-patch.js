// speed-patch.js — MAIN world · all frames · document_start
//
// Completely refactored, rock-solid video speed enforcement engine.
// Handles aggressive player fightbacks using playbackRate virtualization (spoofing).
// Spoofs the getter to return what the player set, while enforcing the user's target speed on the hardware.

(function () {
  'use strict';
  if (window.__uscSpeedPatchLoaded) return;
  window.__uscSpeedPatchLoaded = true;

  const KEY = 'joyn_speed_value';
  const KEY_FF = 'joyn_ff_speed_value';
  const EPSILON = 0.01;
  const RATE_EVENTS = ['ratechange', 'play', 'playing', 'seeked', 'loadeddata'];

  // Read stored speed rate
  function readLocalRate() {
    try {
      const v = parseFloat(localStorage.getItem(KEY));
      return isFinite(v) && v > 0 ? v : 1;
    } catch (_) { return 1; }
  }

  // Read stored fast-forward speed
  function readLocalFFRate() {
    try {
      const v = parseFloat(localStorage.getItem(KEY_FF));
      return isFinite(v) && v > 0 ? v : 2.0;
    } catch (_) { return 2.0; }
  }

  let targetRate = readLocalRate();
  let targetFFRate = readLocalFFRate();
  const enforced = new WeakSet();

  // Keep track of the speeds the video player/page intended to set
  const intendedRates = new WeakMap();
  const intendedDefaultRates = new WeakMap();

  // Helper to detect typing in input fields
  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
  }

  // Helper to detect if an element or its ancestors are player UI control elements
  function isControlElement(el) {
    if (!el) return false;
    let curr = el;
    while (curr && curr !== document.body) {
      const tag = curr.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea') {
        return true;
      }
      const cl = curr.className;
      const classStr = typeof cl === 'string' ? cl.toLowerCase() : '';
      const role = (curr.getAttribute('role') || '').toLowerCase();
      const id = (curr.id || '').toLowerCase();
      if (
        classStr.includes('control') ||
        classStr.includes('progress') ||
        classStr.includes('slider') ||
        classStr.includes('menu') ||
        classStr.includes('button') ||
        classStr.includes('bar') ||
        classStr.includes('timeline') ||
        classStr.includes('chapter') ||
        role.includes('button') ||
        role.includes('slider') ||
        role.includes('progressbar') ||
        id.includes('control') ||
        id.includes('progress')
      ) {
        return true;
      }
      // Traverse Shadow DOM boundary if present
      curr = curr.parentElement || (curr.parentNode && curr.parentNode.host) || curr.parentNode || curr.host;
    }
    return false;
  }

  // Toggle play/pause for active video
  function togglePlayPause() {
    const videos = collectVideos(document, []);
    let targetVideo = null;
    for (const v of videos) {
      if (v.offsetWidth > 50 && v.offsetHeight > 50) {
        targetVideo = v;
        break;
      }
    }
    if (!targetVideo && videos.length > 0) {
      targetVideo = videos[0];
    }
    if (targetVideo) {
      if (targetVideo.paused) {
        targetVideo.play().catch(() => {});
      } else {
        targetVideo.pause();
      }
    }
  }

  // State variables for Universal Hold-to-Fast-Forward
  let isUniversalFFActive = false;
  let isPointerDown = false;
  const isYouTube = location.hostname.includes('youtube.com') || location.hostname.includes('youtu.be');

  function setUniversalFF(active) {
    isUniversalFFActive = active;
    const found = collectVideos(document, []);
    for (const v of found) {
      attach(v);
      const rateToSet = getEffectiveRate(v);
      forceRate(v, rateToSet);
      try {
        v.dispatchEvent(new Event('ratechange'));
      } catch (_) {}
    }
  }

  // ── Keyboard Hold-to-Fast-Forward (Spacebar) ───────────────────────────────
  let spaceTimer = null;
  let isSpaceDown = false;
  let isSpaceFFActive = false;

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      if (isTyping()) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.repeat) return;

      isSpaceDown = true;
      isSpaceFFActive = false;

      clearTimeout(spaceTimer);
      spaceTimer = setTimeout(() => {
        if (isSpaceDown) {
          isSpaceFFActive = true;
          setUniversalFF(true);
        }
      }, 350);
    }
  }, { capture: true });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      if (isTyping()) return;

      isSpaceDown = false;
      clearTimeout(spaceTimer);

      if (isSpaceFFActive) {
        isSpaceFFActive = false;
        setUniversalFF(false);
      } else {
        togglePlayPause();
      }

      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

  // ── Mouse & Touch Hold-to-Fast-Forward ─────────────────────────────────────
  let mouseTimer = null;
  let isMouseDown = false;
  let isMouseFFActive = false;
  let preventNextClick = false;

  function cancelMouseHold() {
    isMouseDown = false;
    clearTimeout(mouseTimer);
    if (isMouseFFActive) {
      isMouseFFActive = false;
      setUniversalFF(false);
      preventNextClick = true;
      setTimeout(() => { preventNextClick = false; }, 200);
    }
  }

  if (isYouTube) {
    // YouTube's native hold-to-2.0x detection helper
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) isPointerDown = true;
    }, { capture: true, passive: true });
    window.addEventListener('mouseup', () => { isPointerDown = false; }, { capture: true, passive: true });
    window.addEventListener('mouseleave', () => { isPointerDown = false; }, { capture: true, passive: true });

    window.addEventListener('touchstart', () => { isPointerDown = true; }, { capture: true, passive: true });
    window.addEventListener('touchend', () => { isPointerDown = false; }, { capture: true, passive: true });
    window.addEventListener('touchcancel', () => { isPointerDown = false; }, { capture: true, passive: true });
  } else {
    // Universal mouse/touch hold detection for Netflix, Joyn, etc.
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (isControlElement(e.target)) return;
      const videos = collectVideos(document, []);
      if (videos.length === 0) return;

      isMouseDown = true;
      isMouseFFActive = false;

      clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => {
        if (isMouseDown) {
          isMouseFFActive = true;
          setUniversalFF(true);
        }
      }, 350);
    }, { capture: true });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      cancelMouseHold();
      if (preventNextClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });

    window.addEventListener('mouseleave', () => {
      cancelMouseHold();
    }, { capture: true });

    window.addEventListener('click', (e) => {
      if (preventNextClick) {
        e.preventDefault();
        e.stopPropagation();
        preventNextClick = false;
      }
    }, { capture: true });

    window.addEventListener('touchstart', (e) => {
      if (isControlElement(e.target)) return;
      const videos = collectVideos(document, []);
      if (videos.length === 0) return;

      isMouseDown = true;
      isMouseFFActive = false;

      clearTimeout(mouseTimer);
      mouseTimer = setTimeout(() => {
        if (isMouseDown) {
          isMouseFFActive = true;
          setUniversalFF(true);
        }
      }, 350);
    }, { capture: true });

    window.addEventListener('touchend', (e) => {
      cancelMouseHold();
      if (preventNextClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });

    window.addEventListener('touchcancel', () => {
      cancelMouseHold();
    }, { capture: true });
  }

  function getEffectiveRate(video) {
    if (video && video.getAttribute('data-usc-ad') === 'true') {
      return location.hostname.includes('netflix.com') ? (navigator.userAgent.includes('Edg') ? 3 : 8) : 1;
    }
    if (isUniversalFFActive) {
      return targetFFRate;
    }
    if (isYouTube && isPointerDown) {
      const intended = intendedRates.get(video);
      if (intended !== undefined && Math.abs(intended - 2.0) < EPSILON) {
        return targetFFRate;
      }
    }
    return Math.abs(targetRate - 1) >= EPSILON ? targetRate : (intendedRates.get(video) ?? 1.0);
  }

  // Get original descriptors
  const proto = HTMLMediaElement.prototype;
  
  const rateDesc = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
  const origGet  = rateDesc && rateDesc.get ? rateDesc.get : null;
  const origSet  = rateDesc && rateDesc.set ? rateDesc.set : null;

  const defaultDesc = Object.getOwnPropertyDescriptor(proto, 'defaultPlaybackRate');
  const origDefaultGet = defaultDesc && defaultDesc.get ? defaultDesc.get : null;
  const origDefaultSet = defaultDesc && defaultDesc.set ? defaultDesc.set : null;

  // Custom getter / setter logic
  function getPlaybackRate() {
    const actualIntended = intendedRates.get(this);
    if (Math.abs(targetRate - 1) >= EPSILON) {
      // If we are overriding speed, make the player believe it is running at its intended speed (or 1.0 by default)
      return actualIntended !== undefined ? actualIntended : 1.0;
    }
    // Otherwise return what is actually set
    return origGet ? origGet.call(this) : (actualIntended !== undefined ? actualIntended : 1.0);
  }

  function setPlaybackRate(val) {
    const r = parseFloat(val);
    if (!isFinite(r) || r <= 0) return;

    intendedRates.set(this, r);

    // Apply effective speed rate (taking fast-forward hold into account)
    const rateToSet = getEffectiveRate(this);

    if (origSet) {
      origSet.call(this, rateToSet);
    } else {
      // Fallback
      rateDesc.set.call(this, rateToSet);
    }
  }

  // Same logic for defaultPlaybackRate
  function getDefaultPlaybackRate() {
    const actualIntended = intendedDefaultRates.get(this);
    if (Math.abs(targetRate - 1) >= EPSILON) {
      return actualIntended !== undefined ? actualIntended : 1.0;
    }
    return origDefaultGet ? origDefaultGet.call(this) : (actualIntended !== undefined ? actualIntended : 1.0);
  }

  function setDefaultPlaybackRate(val) {
    const r = parseFloat(val);
    if (!isFinite(r) || r <= 0) return;

    intendedDefaultRates.set(this, r);

    const rateToSet = Math.abs(targetRate - 1) >= EPSILON ? targetRate : r;

    if (origDefaultSet) {
      origDefaultSet.call(this, rateToSet);
    } else {
      defaultDesc.set.call(this, rateToSet);
    }
  }

  // 1. Prototype override
  if (origSet && origGet) {
    Object.defineProperty(proto, 'playbackRate', {
      get: getPlaybackRate,
      set: setPlaybackRate,
      configurable: true,
      enumerable: true,
    });
  }

  if (origDefaultSet && origDefaultGet) {
    Object.defineProperty(proto, 'defaultPlaybackRate', {
      get: getDefaultPlaybackRate,
      set: setDefaultPlaybackRate,
      configurable: true,
      enumerable: true,
    });
  }

  // Define properties directly on instance to prevent shadow overrides
  function definePropertiesOnInstance(el) {
    if (el._uscPropsDefined) return;
    el._uscPropsDefined = true;

    try {
      Object.defineProperty(el, 'playbackRate', {
        get: getPlaybackRate,
        set: setPlaybackRate,
        configurable: true,
        enumerable: true,
      });

      Object.defineProperty(el, 'defaultPlaybackRate', {
        get: getDefaultPlaybackRate,
        set: setDefaultPlaybackRate,
        configurable: true,
        enumerable: true,
      });
    } catch (_) {}
  }

  // Force physical speed on the hardware level
  function forceRate(video, rate) {
    try {
      if (origSet) {
        origSet.call(video, rate);
      } else {
        video.playbackRate = rate;
      }
    } catch (_) {}
  }

  function snapBack(video) {
    const desired = getEffectiveRate(video);
    const isOverriding = isUniversalFFActive || Math.abs(targetRate - 1) >= EPSILON || (isYouTube && isPointerDown && Math.abs((intendedRates.get(video) ?? 1.0) - 2.0) < EPSILON);
    if (!isOverriding) return;

    const current = origGet ? origGet.call(video) : video.playbackRate;
    if (Math.abs(current - desired) > EPSILON) {
      forceRate(video, desired);
    }
  }

  function attach(video) {
    if (enforced.has(video)) return;
    enforced.add(video);

    definePropertiesOnInstance(video);

    const handler = function () { snapBack(this); };
    for (const evt of RATE_EVENTS) {
      video.addEventListener(evt, handler, true);
    }
    snapBack(video);
  }

  // 2. Element creation interception
  try {
    const origCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function (tagName, options) {
      const el = origCreateElement.call(this, tagName, options);
      if (el && typeof tagName === 'string') {
        const tag = tagName.toLowerCase();
        if (tag === 'video' || tag === 'audio') {
          definePropertiesOnInstance(el);
          // Wait slightly for src and other initializations
          setTimeout(() => attach(el), 0);
        }
      }
      return el;
    };
  } catch (_) {}

  // 3. Dynamic scan via MutationObserver
  function collectVideos(root, out) {
    if (!root) return out;
    try {
      const vids = root.querySelectorAll('video, audio');
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

  function scan() {
    const found = collectVideos(document, []);
    for (const v of found) attach(v);
  }

  let scanQueued = false;
  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      scan();
    });
  }

  scan();
  document.addEventListener('DOMContentLoaded', scan, { once: true });

  try {
    new MutationObserver(scheduleScan).observe(
      document.documentElement || document,
      { childList: true, subtree: true }
    );
  } catch (_) {}

  // Periodic scanner to catch dynamically mounted video elements in Shadow DOMs
  setInterval(scan, 1500);

  // 4. External rate updates from ISOLATED world (popup/bridge)
  function applyRate(rate) {
    const r = parseFloat(rate);
    if (!isFinite(r) || r <= 0) return;
    targetRate = r;
    
    try { localStorage.setItem(KEY, r); } catch (_) {}
    
    const found = collectVideos(document, []);
    for (const v of found) {
      attach(v);
      const rateToSet = getEffectiveRate(v);
      forceRate(v, rateToSet);
    }
  }

  window.__joynForceSpeed = applyRate;

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (typeof e.data.__joynSpeed === 'number') {
      applyRate(e.data.__joynSpeed);
    }
    if (typeof e.data.__joynFFSpeed === 'number') {
      const ff = parseFloat(e.data.__joynFFSpeed);
      if (isFinite(ff) && ff > 0) {
        targetFFRate = ff;
        try { localStorage.setItem(KEY_FF, ff); } catch (_) {}
        
        // Re-apply rate to active video if we're holding it
        const found = collectVideos(document, []);
        for (const v of found) {
          if (isUniversalFFActive) {
            forceRate(v, targetFFRate);
            try { v.dispatchEvent(new Event('ratechange')); } catch (_) {}
          } else if (isYouTube && isPointerDown) {
            const intended = intendedRates.get(v);
            if (intended !== undefined && Math.abs(intended - 2.0) < EPSILON) {
              forceRate(v, targetFFRate);
              try { v.dispatchEvent(new Event('ratechange')); } catch (_) {}
            }
          }
        }
      }
    }
  });

  // 5. Diagnostics
  window.__uscDiagnose = function () {
    const found = collectVideos(document, []);
    return {
      url: location.href,
      origin: location.origin,
      targetRate,
      interceptActive: !!origSet,
      videoCount: found.length,
      videos: found.map((v) => ({
        rate: origGet ? origGet.call(v) : v.playbackRate,
        intendedRate: intendedRates.get(v) || null,
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
