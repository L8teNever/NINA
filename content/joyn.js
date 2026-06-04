// joyn.js — Headless content script for joyn.de.
// Auto-skip toast handler only. Speed/volume enforcement lives in
// frame-speed.js + speed-patch.js.

(function () {
  'use strict';

  let autoSkipEnabled = true;
  let autoSkipDelay = 0;
  const SPEED_MIN = 0.25, SPEED_MAX = 10, SPEED_STEP = 0.25;
  const VOL_MIN = 0, VOL_MAX = 6, VOL_STEP = 0.1;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 100) / 100));

  let currentSpeed = 1;
  let currentVolume = 1;
  let myTabId = null;
  let pauseOnOpenSetting = false;
  let wasPlayingOnOpen = false;

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
    for (const sel of selectors) {
      const el = queryShadow(document, sel);
      if (el && el.offsetHeight > 100 && el.offsetWidth > 300) {
        return el;
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
      const btn = queryShadow(document, sel);
      if (btn) {
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

  function resumeJoynVideo(video) {
    if (!video) return;
    if (!video.paused) return;

    const selectors = [
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

  chrome.storage.local.get(['joyn_autoskip', 'joyn_autoskip_delay', 'joyn_pause_on_open'], (res) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const resSafe = res || {};
    autoSkipEnabled = resSafe.joyn_autoskip !== undefined ? !!resSafe.joyn_autoskip : true;
    const delay = parseInt(resSafe.joyn_autoskip_delay);
    autoSkipDelay = isFinite(delay) ? delay : 0;
    pauseOnOpenSetting = resSafe.joyn_pause_on_open !== undefined ? !!resSafe.joyn_pause_on_open : false;

    chrome.runtime.sendMessage({ type: 'GET_TAB_SETTINGS' }, (tabRes) => {
      if (tabRes) {
        myTabId = tabRes.tabId;
        if (tabRes.speed !== undefined) currentSpeed = clamp(tabRes.speed, SPEED_MIN, SPEED_MAX);
        if (tabRes.volume !== undefined) currentVolume = clamp(tabRes.volume, VOL_MIN, VOL_MAX);
      }
    });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (changes.joyn_autoskip && changes.joyn_autoskip.newValue !== undefined) {
      autoSkipEnabled = !!changes.joyn_autoskip.newValue;
    }
    if (changes.joyn_autoskip_delay && changes.joyn_autoskip_delay.newValue !== undefined) {
      autoSkipDelay = parseInt(changes.joyn_autoskip_delay.newValue) || 0;
    }
    if (changes.joyn_pause_on_open && changes.joyn_pause_on_open.newValue !== undefined) {
      pauseOnOpenSetting = !!changes.joyn_pause_on_open.newValue;
    }
    if (changes.tab_speeds && myTabId) {
      const newTabSettings = changes.tab_speeds.newValue[myTabId];
      if (newTabSettings) {
        if (newTabSettings.speed !== undefined) currentSpeed = clamp(newTabSettings.speed, SPEED_MIN, SPEED_MAX);
        if (newTabSettings.volume !== undefined) currentVolume = clamp(newTabSettings.volume, VOL_MIN, VOL_MAX);
        const overlay = document.getElementById('usc-overlay');
        if (overlay && typeof overlay._updateUI === 'function') {
          overlay._updateUI(currentSpeed, currentVolume);
        }
      }
    }
  });

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

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function bumpSpeed(delta) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const s = clamp(currentSpeed + delta, SPEED_MIN, SPEED_MAX);
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
    showToast('⚡ ' + s.toFixed(2) + '×');
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
    if (key === 'd') bumpSpeed(SPEED_STEP);
    else if (key === 'a') bumpSpeed(-SPEED_STEP);
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(VOL_STEP);
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      bumpVolume(-VOL_STEP);
    }
  });

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

  const SKIP_SELECTOR =
    '.skip-intro, .skipIntro, [data-uia="skip-intro"], [data-uia="player-skip-intro"], ' +
    '[data-uia="player-skip-credits"], [data-uia="skip-credits"], .skip-credits, ' +
    '[class*="skip-intro" i], [class*="skipIntro" i], [class*="skip-credits" i], ' +
    '[class*="skipCredits" i], [class*="skip-recap" i], [class*="skipRecap" i], ' +
    '[class*="skip-content" i], [class*="skipContent" i], [class*="skip-button" i], ' +
    '[class*="skipButton" i], [id*="skipButton" i], [data-testid*="skip" i], ' +
    '[aria-label*="intro" i], [aria-label*="credits" i], [aria-label*="skip" i], ' +
    '[aria-label*="überspringen" i], .vjs-skip-button, .skip-button, .skip__button, ' +
    '.atvwebplayersdk-skipelement-button, .adSkipButton, .skipMain';

  const NEXT_SELECTOR =
    '.next-episode-btn, [class*="next-episode" i], [class*="nextEpisode" i], ' +
    '[data-testid*="next-episode" i], [aria-label*="next episode" i], [aria-label*="nächste folge" i]';

  let lastSkipTime = 0;
  let lastNextHref = null;
  const SKIP_COOLDOWN = 5000;

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

  function robustClick(element) {
    if (!element) return;
    if (typeof element.click === 'function') {
      try { element.click(); } catch (_) {}
    }
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

  function isWatchPage() {
    const url = window.location.href;
    const host = window.location.hostname;
    
    if (host.includes('joyn.de')) {
      return url.includes('/play/') || url.includes('/live/');
    }
    if (url.includes('/play/') || url.includes('/live/')) {
      return true;
    }
    const video = document.querySelector('video');
    if (video && video.offsetWidth > 300 && video.offsetHeight > 150) {
      return true;
    }
    return false;
  }

  function ensureOverlay() {
    if (!isWatchPage()) {
      const existing = document.getElementById('usc-overlay');
      if (existing) {
        existing.style.setProperty('display', 'none', 'important');
      }
      const existingBackdrop = document.getElementById('usc-backdrop');
      if (existingBackdrop) {
        existingBackdrop.style.setProperty('display', 'none', 'important');
      }
      return;
    }

    let overlay = document.getElementById('usc-overlay');
    let backdrop = document.getElementById('usc-backdrop');
    let targetParent = document.body;
    const fullscreenEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (fullscreenEl) {
      const controls = findControlsContainer();
      if (controls) {
        targetParent = controls;
      } else {
        const video = findMainVideo();
        if (video && video.parentElement) {
          targetParent = video.parentElement;
        } else {
          targetParent = fullscreenEl;
        }
      }
      if (targetParent.tagName === 'VIDEO' || targetParent.tagName === 'IFRAME') {
        targetParent = document.body;
      }
    }

    if (overlay && backdrop) {
      overlay.style.setProperty('display', 'block', 'important');
      backdrop.style.setProperty('display', 'block', 'important');
      if (overlay.parentNode !== targetParent) {
        targetParent.appendChild(overlay);
      }
      if (backdrop.parentNode !== targetParent) {
        targetParent.insertBefore(backdrop, overlay);
      }
      return;
    }

    if (overlay) overlay.remove();
    if (backdrop) backdrop.remove();

    backdrop = document.createElement('div');
    backdrop.id = 'usc-backdrop';
    backdrop.style.setProperty('display', 'block', 'important');

    overlay = document.createElement('div');
    overlay.id = 'usc-overlay';
    overlay.style.setProperty('display', 'block', 'important');

    const host = window.location.hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      overlay.classList.add('usc-youtube');
    } else if (host.includes('netflix.com')) {
      overlay.classList.add('usc-netflix');
    } else if (host.includes('primevideo.com') || host.includes('amazon.')) {
      overlay.classList.add('usc-prime');
    } else if (host.includes('disneyplus.com')) {
      overlay.classList.add('usc-disney');
    } else if (host.includes('joyn.de')) {
      overlay.classList.add('usc-joyn');
    } else if (host.includes('crunchyroll.com')) {
      overlay.classList.add('usc-crunchyroll');
    }
    
    overlay.innerHTML = `
      <div id="usc-badge" title="NINA Player-Steuerung">
        <svg viewBox="0 0 24 24" class="usc-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
          <rect x="3" y="3" width="18" height="18" rx="6" stroke="currentColor" stroke-width="2.2" fill="none" />
          <path d="M9 17V7l6 10V7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
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

    targetParent.appendChild(backdrop);
    targetParent.appendChild(overlay);

    const badge = overlay.querySelector('#usc-badge');
    const panel = overlay.querySelector('#usc-panel');
    const speedSlider = overlay.querySelector('#usc-speed-slider');
    const volSlider = overlay.querySelector('#usc-vol-slider');
    const speedValBadge = overlay.querySelector('#usc-badge-val');
    const speedValPanel = overlay.querySelector('#usc-panel-speed-val');
    const volValPanel = overlay.querySelector('#usc-panel-vol-val');

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
            resumeJoynVideo(video);
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
        
        const pct = ((speed - 0.25) / (maxVal - 0.25)) * 100;
        speedSlider.style.setProperty('--pct', pct + '%');
      }
      if (vol !== undefined) {
        const volPct = Math.round(vol * 100);
        volSlider.value = volPct;
        volValPanel.textContent = volPct + '%';

        const pct = (volPct / 600) * 100;
        volSlider.style.setProperty('--pct', pct + '%');
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
    ensureOverlay();
    if (!autoSkipEnabled) return;
    const now = Date.now();
    const main = findMainVideo();
    if (!main || main.offsetWidth < 50) return;

    if (!main.paused && (now - lastSkipTime) > SKIP_COOLDOWN) {
      const skip = queryShadow(document, SKIP_SELECTOR);
      if (skip && isVisible(skip)) {
        if (!skip._detectedAt) skip._detectedAt = now;
        if (now - skip._detectedAt >= autoSkipDelay * 1000) {
          lastSkipTime = now;
          robustClick(skip);
          showToast('⏭ Intro übersprungen');
        }
        return;
      }
    }

    if (main.duration > 10 && (main.currentTime / main.duration) > 0.75) {
      const nextBtn = queryShadow(document, NEXT_SELECTOR);
      if (nextBtn && isVisible(nextBtn) && location.href !== lastNextHref) {
        if (!nextBtn._detectedAt) nextBtn._detectedAt = now;
        if (now - nextBtn._detectedAt >= autoSkipDelay * 1000) {
          lastNextHref = location.href;
          showToast('▶ Nächste Folge');
          robustClick(nextBtn);
        }
      }
    }
  }

  setInterval(autoSkipTick, 800);
})();
