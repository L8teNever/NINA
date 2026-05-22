// youtube-dislike.js — Dislike count (RYD) + SponsorBlock markers + Skip button

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    /* ── Dislike count ── */
    .usc-dislike-text {
      font-size: 14px !important;
      font-weight: 500 !important;
      color: var(--yt-spec-text-primary, #0f0f0f) !important;
      pointer-events: none !important;
      margin-left: 6px !important;
      line-height: 20px !important;
      white-space: nowrap !important;
    }

    /* ── Progress bar segments ── */
    .usc-sb-segment {
      position: absolute;
      top: 0;
      height: 100%;
      opacity: 0.65;
      pointer-events: none;
      z-index: 51;
      border-radius: 2px;
      transition: opacity 0.15s;
    }
    .ytp-progress-bar:hover .usc-sb-segment { opacity: 0.9; }

    /* ── Hover tooltip ── */
    #usc-sb-tooltip {
      position: fixed;
      display: none;
      padding: 5px 10px 5px 12px;
      background: rgba(18, 18, 18, 0.93);
      color: #fff;
      font-family: 'Google Sans', 'Roboto', sans-serif;
      font-size: 12px;
      font-weight: 500;
      border-radius: 4px;
      border-left: 3px solid #fff;
      pointer-events: none;
      z-index: 99999;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }

    /* ── Skip button (Material 3) ── */
    #usc-sb-skip-btn {
      position: absolute;
      bottom: 80px;
      right: 20px;
      z-index: 200;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 11px 22px;
      background-color: #211f26;
      border: 1px solid #938f99;
      border-radius: 28px;
      color: #d0bcff;
      font-family: 'Google Sans', 'Roboto', sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,0.55);
      transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.15s;
      animation: usc-skip-in 0.25s cubic-bezier(0.4,0,0.2,1);
      user-select: none;
    }
    #usc-sb-skip-btn:hover {
      background-color: #2b2930;
      box-shadow: 0 4px 20px rgba(208,188,255,0.25);
    }
    #usc-sb-skip-btn:active {
      transform: scale(0.96);
      background-color: #d0bcff;
      color: #381e72;
    }
    #usc-sb-skip-btn .usc-skip-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #usc-sb-skip-btn .usc-skip-arrow {
      font-size: 16px;
      margin-left: 2px;
      opacity: 0.8;
    }
    @keyframes usc-skip-in {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);

  // ── Singleton UI elements ─────────────────────────────────────────────────────

  const sbTooltip = document.createElement('div');
  sbTooltip.id = 'usc-sb-tooltip';
  document.body.appendChild(sbTooltip);

  const skipBtn = document.createElement('button');
  skipBtn.id = 'usc-sb-skip-btn';
  skipBtn.innerHTML =
    '<span class="usc-skip-dot"></span>' +
    '<span class="usc-skip-label"></span>' +
    '<span class="usc-skip-arrow">›</span>';

  skipBtn.addEventListener('click', function () {
    const video = document.querySelector('video');
    const to = parseFloat(skipBtn.dataset.skipTo);
    if (video && !isNaN(to)) video.currentTime = to;
    skipBtn.style.display = 'none';
  });

  // ── Data maps ─────────────────────────────────────────────────────────────────

  const SEGMENT_COLORS = {
    sponsor:        '#00d400',
    selfpromo:      '#ffff00',
    interaction:    '#cc00ff',
    intro:          '#00ffff',
    outro:          '#0202ed',
    preview:        '#008fd6',
    music_offtopic: '#ff9900',
    filler:         '#7300FF',
  };

  const SEGMENT_LABELS = {
    sponsor:        'Werbung (Sponsor)',
    selfpromo:      'Eigenwerbung',
    interaction:    'Interaktionsaufforderung',
    intro:          'Intro',
    outro:          'Outro',
    preview:        'Vorschau',
    music_offtopic: 'Musik (Off-Topic)',
    filler:         'Füller',
  };

  const SEGMENT_SKIP_LABELS = {
    sponsor:        'Sponsor überspringen',
    selfpromo:      'Eigenwerbung überspringen',
    interaction:    'Überspringen',
    intro:          'Intro überspringen',
    outro:          'Outro überspringen',
    preview:        'Vorschau überspringen',
    music_offtopic: 'Überspringen',
    filler:         'Füller überspringen',
  };

  // ── Tooltip ───────────────────────────────────────────────────────────────────

  function showTooltip(e, seg) {
    sbTooltip.textContent = SEGMENT_LABELS[seg.category] || seg.category;
    sbTooltip.style.borderLeftColor = SEGMENT_COLORS[seg.category] || '#fff';
    sbTooltip.style.display = 'block';
    sbTooltip.style.left = (e.clientX + 14) + 'px';
    sbTooltip.style.top  = (e.clientY - 38) + 'px';
  }

  function hideTooltip() { sbTooltip.style.display = 'none'; }

  // ── SponsorBlock ──────────────────────────────────────────────────────────────

  let sbSegments = [];
  let sbVideoId  = '';

  async function fetchSegments(videoId) {
    const cats = encodeURIComponent(JSON.stringify(Object.keys(SEGMENT_COLORS)));
    const res = await fetch(
      'https://sponsor.ajay.app/api/skipSegments?videoID=' + videoId + '&categories=' + cats
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error('SB ' + res.status);
    return res.json();
  }

  function attachBarTooltipListener(bar) {
    if (bar._uscTooltipAttached) return;
    bar._uscTooltipAttached = true;
    bar.addEventListener('mousemove', function (e) {
      const video = document.querySelector('video');
      if (!video || !video.duration || !sbSegments.length) { hideTooltip(); return; }
      const rect = bar.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = pct * video.duration;
      const seg  = sbSegments.find(function (s) { return time >= s.segment[0] && time <= s.segment[1]; });
      if (seg) showTooltip(e, seg); else hideTooltip();
    });
    bar.addEventListener('mouseleave', hideTooltip);
  }

  function renderSegments() {
    const video = document.querySelector('video');
    const bar   = document.querySelector('.ytp-progress-bar');
    if (!video || !bar || !video.duration || !isFinite(video.duration)) return;

    document.querySelectorAll('.usc-sb-segment').forEach(function (el) { el.remove(); });

    const dur = video.duration;
    sbSegments.forEach(function (seg) {
      const [start, end] = seg.segment;
      if (end <= start) return;
      const marker = document.createElement('div');
      marker.className        = 'usc-sb-segment';
      marker.style.left       = (start / dur * 100) + '%';
      marker.style.width      = ((end - start) / dur * 100) + '%';
      marker.style.background = SEGMENT_COLORS[seg.category] || '#fff';
      bar.appendChild(marker);
    });

    attachBarTooltipListener(bar);
  }

  // ── Skip button ───────────────────────────────────────────────────────────────

  let activeSegKey = '';

  function checkSkipButton() {
    const video = document.querySelector('video');
    if (!video || !sbSegments.length) { skipBtn.style.display = 'none'; return; }

    const t = video.currentTime;
    const seg = sbSegments.find(function (s) { return t >= s.segment[0] && t < s.segment[1]; });

    if (!seg) {
      skipBtn.style.display = 'none';
      activeSegKey = '';
      return;
    }

    const key = seg.category + seg.segment[0];
    if (key === activeSegKey && skipBtn.style.display === 'flex') return; // already shown
    activeSegKey = key;

    // Attach to player
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player && !player.contains(skipBtn)) player.appendChild(skipBtn);

    const color = SEGMENT_COLORS[seg.category] || '#938f99';
    skipBtn.querySelector('.usc-skip-dot').style.background   = color;
    skipBtn.querySelector('.usc-skip-label').textContent      = SEGMENT_SKIP_LABELS[seg.category] || 'Überspringen';
    skipBtn.style.borderColor = color;
    skipBtn.style.setProperty('box-shadow', '0 2px 12px rgba(0,0,0,0.55), 0 0 0 1px ' + color + '33');
    skipBtn.dataset.skipTo = seg.segment[1];
    skipBtn.style.display = 'flex';

    // Re-trigger animation
    skipBtn.style.animation = 'none';
    skipBtn.offsetHeight; // reflow
    skipBtn.style.animation = '';
  }

  // ── Dislike (Return YouTube Dislike) ─────────────────────────────────────────

  let dislikeVideoId = '';
  let cachedCount    = null;

  function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000)   return Math.round(n / 1000) + 'K';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  async function fetchDislikes(videoId) {
    const res = await fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + videoId);
    if (!res.ok) throw new Error('RYD ' + res.status);
    return (await res.json()).dislikes;
  }

  function findDislikeButton() {
    const byAria = document.querySelector(
      'button[aria-label*="dislike" i], ' +
      'button[aria-label*="nicht mögen" i], ' +
      'button[aria-label*="Mag das nicht" i], ' +
      'button[aria-label*="Don\'t like" i], ' +
      'button[aria-label*="pas aimer" i]'
    );
    if (byAria) return byAria;
    const group = document.querySelector(
      'segmented-like-dislike-button-view-model, ' +
      '#segmented-like-dislike-button, ' +
      'ytd-segmented-like-dislike-button-renderer'
    );
    if (group) {
      const btns = group.querySelectorAll('button');
      if (btns.length >= 2) return btns[1];
    }
    return null;
  }

  function injectDislikeLabel(btn, count) {
    let label = btn.querySelector('.usc-dislike-text');
    if (!label) {
      label = document.createElement('span');
      label.className = 'usc-dislike-text';
      const iconWrapper = btn.querySelector('.yt-spec-button-shape-next__icon');
      if (iconWrapper) iconWrapper.after(label);
      else {
        const icon = btn.querySelector('yt-icon, svg');
        if (icon) icon.after(label); else btn.appendChild(label);
      }
    }
    label.textContent = formatCount(count);
  }

  async function updateDislikes(videoId) {
    const btn = findDislikeButton();
    if (!btn) return;
    const existing = btn.querySelector('.usc-dislike-text');
    if (existing && videoId === dislikeVideoId) return;
    if (videoId === dislikeVideoId && cachedCount !== null) { injectDislikeLabel(btn, cachedCount); return; }
    if (window.__uscFetchingDislikes === videoId) return;
    window.__uscFetchingDislikes = videoId;
    try {
      cachedCount    = await fetchDislikes(videoId);
      dislikeVideoId = videoId;
      injectDislikeLabel(btn, cachedCount);
    } catch (_) {}
    window.__uscFetchingDislikes = null;
  }

  // ── Auto-Like ─────────────────────────────────────────────────────────────────

  let autoLikeEnabled = true;
  let autoLikeThreshold = 10; // percent
  const autoLikedSession = new Set();

  chrome.storage.local.get(['joyn_autolike_enabled', 'joyn_autolike_threshold'], (res) => {
    if (res.joyn_autolike_enabled !== undefined) autoLikeEnabled = !!res.joyn_autolike_enabled;
    const t = parseFloat(res.joyn_autolike_threshold);
    if (isFinite(t)) autoLikeThreshold = Math.max(1, Math.min(100, t));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.joyn_autolike_enabled && changes.joyn_autolike_enabled.newValue !== undefined) {
      autoLikeEnabled = !!changes.joyn_autolike_enabled.newValue;
    }
    if (changes.joyn_autolike_threshold && changes.joyn_autolike_threshold.newValue !== undefined) {
      const t = parseFloat(changes.joyn_autolike_threshold.newValue);
      if (isFinite(t)) autoLikeThreshold = Math.max(1, Math.min(100, t));
    }
  });

  function findLikeButton() {
    const group = document.querySelector(
      'segmented-like-dislike-button-view-model, ' +
      '#segmented-like-dislike-button, ' +
      'ytd-segmented-like-dislike-button-renderer'
    );
    if (group) {
      const btns = group.querySelectorAll('button');
      if (btns.length >= 2) return btns[0];
    }
    const candidates = document.querySelectorAll(
      'button[aria-label*="like" i], button[aria-label*="mag" i]'
    );
    for (const c of candidates) {
      const label = (c.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('dislike') || label.includes('mag das nicht') || label.includes('nicht mögen')) continue;
      return c;
    }
    return null;
  }

  function isAlreadyLiked(btn) {
    if (!btn) return false;
    if (btn.getAttribute('aria-pressed') === 'true') return true;
    const parent = btn.closest('like-button-view-model, ytd-toggle-button-renderer, ytd-segmented-like-dislike-button-renderer');
    if (parent && parent.classList && parent.classList.contains('style-default-active')) return true;
    return false;
  }

  function showAutoLikeToast() {
    const t = document.createElement('div');
    t.className = 'usc-toast';
    t.textContent = '👍 Automatisch geliked';
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.classList.add('usc-toast-show');
      setTimeout(() => {
        t.classList.remove('usc-toast-show');
        setTimeout(() => t.remove(), 400);
      }, 1800);
    });
  }

  function maybeAutoLike(videoId) {
    if (!autoLikeEnabled) return;
    if (!videoId) return;
    if (autoLikedSession.has(videoId)) return;

    const video = document.querySelector('video');
    if (!video || !isFinite(video.duration) || video.duration <= 0) return;

    const pct = (video.currentTime / video.duration) * 100;
    if (pct < autoLikeThreshold) return;

    const btn = findLikeButton();
    if (!btn) return;

    if (isAlreadyLiked(btn)) {
      autoLikedSession.add(videoId);
      return;
    }

    btn.click();
    autoLikedSession.add(videoId);
    showAutoLikeToast();
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────

  async function update() {
    if (!location.pathname.startsWith('/watch')) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    if (videoId !== sbVideoId) {
      sbVideoId  = videoId;
      sbSegments = [];
      activeSegKey = '';
      skipBtn.style.display = 'none';
      try { sbSegments = await fetchSegments(videoId); } catch (_) {}
    }

    renderSegments();
    checkSkipButton();
    maybeAutoLike(videoId);
    await updateDislikes(videoId);
  }

  // Frequent check for skip button (every 500ms)
  setInterval(checkSkipButton, 500);
  // Full update every 1.5s (segments + dislike + auto-like)
  setInterval(update, 1500);
  update();
})();
