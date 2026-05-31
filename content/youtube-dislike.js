// youtube-dislike.js — Dislike count (RYD) + SponsorBlock markers + Skip button

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    /* ── Dislike count ── */
    .usc-dislike-wrapper {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 6px !important;
      pointer-events: none !important;
    }
    .usc-dislike-text {
      font-family: inherit !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      color: inherit !important;
      pointer-events: none !important;
      white-space: nowrap !important;
      line-height: normal !important;
    }
    /* Override YouTube's fixed-width constraints on the dislike button when count is displayed */
    button:has(.usc-dislike-wrapper),
    .yt-spec-button-shape-next:has(.usc-dislike-wrapper),
    dislike-button-view-model button,
    #segmented-dislike-button button {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      width: auto !important;
      min-width: 0 !important;
      padding-left: 12px !important;
      padding-right: 12px !important;
      display: inline-flex !important;
      align-items: center !important;
    }
    .usc-dislike-added,
    yt-button-shape:has(.usc-dislike-wrapper),
    dislike-button-view-model,
    #segmented-dislike-button,
    like-dislike-button-view-model,
    segmented-like-dislike-button-view-model,
    ytd-segmented-like-dislike-button-renderer,
    yt-segmented-button-layout,
    .yt-spec-button-shape-next__segmented-connector + * {
      width: auto !important;
      min-width: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
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

    /* ── Skip button ── */
    #usc-sb-skip-btn,
    .skip-button {
      position: absolute;
      bottom: 80px;
      right: 20px;
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.62);
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 15px;
      font-weight: 500;
      line-height: 1;
      padding: 10px 20px;
      border-radius: 9999px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: usc-skip-in 0.25s cubic-bezier(0.4,0,0.2,1);
      user-select: none;
    }
    #usc-sb-skip-btn:hover,
    .skip-button:hover {
      background-color: rgba(0, 0, 0, 0.77);
      transform: scale(1.03);
    }
    #usc-sb-skip-btn:active,
    .skip-button:active {
      background-color: rgba(0, 0, 0, 0.92);
      transform: scale(0.97);
    }
    .skip-icon-wrapper {
      display: inline-flex;
      align-items: center;
      margin-left: 10px;
    }
    @keyframes usc-skip-in {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }


    /* ── Hide extra action bar buttons on YouTube ── */
    #top-level-buttons-computed > yt-button-view-model,
    #top-level-buttons-computed > ytd-button-renderer,
    #top-level-buttons-computed > ytd-toggle-button-renderer {
      display: none !important;
    }
    ytd-watch-metadata ytd-menu-renderer #flexible-item-buttons,
    #actions ytd-menu-renderer #flexible-item-buttons {
      display: none !important;
    }

  `;
  document.head.appendChild(style);

  // ── Singleton UI elements ─────────────────────────────────────────────────────

  const sbTooltip = document.createElement('div');
  sbTooltip.id = 'usc-sb-tooltip';
  document.body.appendChild(sbTooltip);


  const skipBtn = document.createElement('button');
  skipBtn.id = 'usc-sb-skip-btn';
  skipBtn.className = 'skip-button';
  skipBtn.innerHTML =
    '<span class="skip-label">Überspringen</span>' +
    '<span class="skip-icon-wrapper">' +
    '<svg width="10" height="11" viewBox="0 0 10 11" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M0 0.5L7 5.5L0 10.5V0.5Z" fill="white"/>' +
    '<path d="M9 0.5V10.5" stroke="white" stroke-width="2"/>' +
    '</svg>' +
    '</span>';

  skipBtn.addEventListener('click', function () {
    const video = document.querySelector('video');
    const to = parseFloat(skipBtn.dataset.skipTo);
    if (video && !isNaN(to)) video.currentTime = to;
    skipBtn.style.display = 'none';
  });


  // ── Data maps ─────────────────────────────────────────────────────────────────

  const SEGMENT_COLORS = {
    sponsor: '#00d400',
    selfpromo: '#ffff00',
    interaction: '#cc00ff',
    intro: '#00ffff',
    outro: '#0202ed',
    preview: '#008fd6',
    music_offtopic: '#ff9900',
    filler: '#7300FF',
  };

  const SEGMENT_LABELS = {
    sponsor: 'Werbung (Sponsor)',
    selfpromo: 'Eigenwerbung',
    interaction: 'Interaktionsaufforderung',
    intro: 'Intro',
    outro: 'Outro',
    preview: 'Vorschau',
    music_offtopic: 'Musik (Off-Topic)',
    filler: 'Füller',
  };

  const SEGMENT_SKIP_LABELS = {
    sponsor: 'Sponsor überspringen',
    selfpromo: 'Eigenwerbung überspringen',
    interaction: 'Überspringen',
    intro: 'Intro überspringen',
    outro: 'Outro überspringen',
    preview: 'Vorschau überspringen',
    music_offtopic: 'Überspringen',
    filler: 'Füller überspringen',
  };

  // ── Tooltip ───────────────────────────────────────────────────────────────────

  function showTooltip(e, seg) {
    sbTooltip.textContent = SEGMENT_LABELS[seg.category] || seg.category;
    sbTooltip.style.borderLeftColor = SEGMENT_COLORS[seg.category] || '#fff';
    sbTooltip.style.display = 'block';
    sbTooltip.style.left = (e.clientX + 14) + 'px';
    sbTooltip.style.top = (e.clientY - 38) + 'px';
  }

  function hideTooltip() { sbTooltip.style.display = 'none'; }

  // ── SponsorBlock ──────────────────────────────────────────────────────────────

  let sbSegments = [];
  let sbVideoId = '';

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
      if (!sponsorBlockEnabled) { hideTooltip(); return; }
      const video = document.querySelector('video');
      if (!video || !video.duration || !sbSegments.length) { hideTooltip(); return; }
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = pct * video.duration;
      const seg = sbSegments.find(function (s) { return time >= s.segment[0] && time <= s.segment[1]; });
      if (seg) showTooltip(e, seg); else hideTooltip();
    });
    bar.addEventListener('mouseleave', hideTooltip);
  }

  function renderSegments() {
    if (!sponsorBlockEnabled) {
      cleanupSponsorBlock();
      return;
    }
    const video = document.querySelector('video');
    const bar = document.querySelector('.ytp-progress-bar');
    if (!video || !bar || !video.duration || !isFinite(video.duration)) return;

    document.querySelectorAll('.usc-sb-segment').forEach(function (el) { el.remove(); });

    const dur = video.duration;
    sbSegments.forEach(function (seg) {
      const [start, end] = seg.segment;
      if (end <= start) return;
      const marker = document.createElement('div');
      marker.className = 'usc-sb-segment';
      marker.style.left = (start / dur * 100) + '%';
      marker.style.width = ((end - start) / dur * 100) + '%';
      marker.style.background = SEGMENT_COLORS[seg.category] || '#fff';
      bar.appendChild(marker);
    });

    attachBarTooltipListener(bar);
  }

  // ── Skip button ───────────────────────────────────────────────────────────────

  let activeSegKey = '';

  function checkSkipButton() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (!sponsorBlockEnabled) {
      skipBtn.style.display = 'none';
      return;
    }
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
    if (player && !player.contains(speedUpBtn)) player.appendChild(speedUpBtn);
    if (player && !player.contains(speedDownBtn)) player.appendChild(speedDownBtn);

    const label = skipBtn.querySelector('.skip-label');
    if (label) label.textContent = SEGMENT_SKIP_LABELS[seg.category] || 'Überspringen';
    skipBtn.dataset.skipTo = seg.segment[1];
    skipBtn.style.display = 'flex';

    // Re-trigger animation
    skipBtn.style.animation = 'none';
    skipBtn.offsetHeight; // reflow
    skipBtn.style.animation = '';
  }

  // ── Dislike (Return YouTube Dislike) ─────────────────────────────────────────

  const dislikesCache = new Map();

  function formatCount(n) {
    const locale = document.documentElement.lang || navigator.language || 'en';
    const formatter = new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1
    });
    return formatter.format(n);
  }

  async function fetchDislikes(videoId) {
    const res = await fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + videoId);
    if (!res.ok) throw new Error('RYD ' + res.status);
    return (await res.json()).dislikes;
  }

  function findDislikeButton() {
    const isPlayerBtn = btn => btn.closest('#movie_player, .html5-video-player, .ytp-chrome-controls, .ytp-player-content');
    const isVisible = el => el.offsetWidth > 0 && el.offsetHeight > 0;

    // Helper to query elements, prioritizing the active watch page
    const queryActive = (selector) => {
      const activeWatch = document.querySelector('ytd-watch-flexy:not([hidden])');
      if (activeWatch) {
        const found = activeWatch.querySelectorAll(selector);
        if (found.length > 0) return found;
      }
      return document.querySelectorAll(selector);
    };

    // 1. Try modern dislike button view model
    const modernDislikes = queryActive('dislike-button-view-model button, #segmented-dislike-button button');
    for (const btn of modernDislikes) {
      if (!isPlayerBtn(btn) && isVisible(btn)) return btn;
    }

    // 2. Try by aria-label
    const byAria = queryActive(
      'button[aria-label*="dislike" i], ' +
      'button[aria-label*="nicht mögen" i], ' +
      'button[aria-label*="Mag das nicht" i], ' +
      'button[aria-label*="Mag ich nicht" i], ' +
      'button[aria-label*="negativ bewerten" i], ' +
      'button[aria-label*="negativ" i], ' +
      'button[aria-label*="Don\'t like" i], ' +
      'button[aria-label*="pas aimer" i], ' +
      'button[aria-label*="Je n\'aime pas" i]'
    );
    for (const btn of byAria) {
      if (!isPlayerBtn(btn) && isVisible(btn)) return btn;
    }

    // 3. Try by segmented button group (usually like is first, dislike is second)
    const groups = queryActive(
      'segmented-like-dislike-button-view-model, ' +
      '#segmented-like-dislike-button, ' +
      'ytd-segmented-like-dislike-button-renderer, ' +
      'yt-segmented-button-layout, ' +
      'like-dislike-button-view-model'
    );
    for (const group of groups) {
      if (isPlayerBtn(group) || !isVisible(group)) continue;
      const btns = group.querySelectorAll('button');
      if (btns.length >= 2 && isVisible(btns[1])) return btns[1];
    }
    return null;
  }

  function findClosestShadow(el, selector) {
    if (!el) return null;
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      if (curr.matches && curr.matches(selector)) {
        return curr;
      }
      curr = curr.parentElement || (curr.parentNode && curr.parentNode.host) || curr.host;
    }
    return null;
  }

  function ensureShadowStyle(shadowRoot) {
    if (!shadowRoot) return;
    if (shadowRoot.getElementById('nina-shadow-style')) return;
    const style = document.createElement('style');
    style.id = 'nina-shadow-style';
    style.textContent = `
      button,
      .yt-spec-button-shape-next {
        width: auto !important;
        min-width: 0 !important;
        display: inline-flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        align-items: center !important;
        justify-content: center !important;
        padding-left: 12px !important;
        padding-right: 12px !important;
        height: 36px !important;
      }
      .yt-spec-button-shape-next__icon {
        margin: 0 !important;
        margin-right: 6px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      .usc-dislike-wrapper {
        display: inline-flex !important;
        align-items: center !important;
        pointer-events: none !important;
        height: 100% !important;
      }
      .usc-dislike-text {
        font-family: inherit !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        color: inherit !important;
        pointer-events: none !important;
        white-space: nowrap !important;
        line-height: normal !important;
        display: inline-block !important;
      }
    `;
    shadowRoot.appendChild(style);
  }

  function ensureStyle(el, prop, val) {
    if (el.style.getPropertyValue(prop) !== val) {
      el.style.setProperty(prop, val, 'important');
    }
  }

  function ensureButtonStyles(btn) {
    const classes = Array.from(btn.classList);
    classes.forEach(cls => {
      if (cls.includes('icon-only')) {
        btn.classList.remove(cls);
      }
    });
    if (!btn.classList.contains('yt-spec-button-shape-next--icon-leading')) {
      btn.classList.add('yt-spec-button-shape-next--icon-leading');
    }
    ensureStyle(btn, 'width', 'auto');
    ensureStyle(btn, 'min-width', '0');
    ensureStyle(btn, 'display', 'inline-flex');
    ensureStyle(btn, 'align-items', 'center');
    ensureStyle(btn, 'flex-direction', 'row');
    ensureStyle(btn, 'flex-wrap', 'nowrap');
    ensureStyle(btn, 'padding-left', '12px');
    ensureStyle(btn, 'padding-right', '12px');
  }

  function ensureParentStyles(btn) {
    const ytButtonShape = findClosestShadow(btn, 'yt-button-shape');
    if (ytButtonShape) {
      if (!ytButtonShape.classList.contains('usc-dislike-added')) {
        ytButtonShape.classList.add('usc-dislike-added');
      }
      ensureStyle(ytButtonShape, 'width', 'auto');
      ensureStyle(ytButtonShape, 'min-width', '0');
      ensureStyle(ytButtonShape, 'display', 'inline-flex');
      ensureStyle(ytButtonShape, 'align-items', 'center');
    }
    const dislikeVM = findClosestShadow(btn, 'dislike-button-view-model, #segmented-dislike-button, like-dislike-button-view-model, segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
    if (dislikeVM) {
      if (!dislikeVM.classList.contains('usc-dislike-added')) {
        dislikeVM.classList.add('usc-dislike-added');
      }
      ensureStyle(dislikeVM, 'width', 'auto');
      ensureStyle(dislikeVM, 'min-width', '0');
      ensureStyle(dislikeVM, 'display', 'inline-flex');
      ensureStyle(dislikeVM, 'align-items', 'center');
    }
    const segmentedLayout = findClosestShadow(btn, 'yt-segmented-button-layout');
    if (segmentedLayout) {
      if (!segmentedLayout.classList.contains('usc-dislike-added')) {
        segmentedLayout.classList.add('usc-dislike-added');
      }
      ensureStyle(segmentedLayout, 'width', 'auto');
      ensureStyle(segmentedLayout, 'min-width', '0');
      ensureStyle(segmentedLayout, 'display', 'inline-flex');
      ensureStyle(segmentedLayout, 'align-items', 'center');
    }
  }

  function injectDislikeLabel(btn, count) {
    // 1. Inject scoped styles inside shadow DOM to bypass shadow boundary constraints
    const shadow = btn.getRootNode();
    if (shadow && shadow instanceof ShadowRoot) {
      ensureShadowStyle(shadow);
    }

    // 2. Adjust button styling from icon-only to icon-leading
    ensureButtonStyles(btn);

    // 3. Mark parents in the light DOM with class to allow width expansion
    ensureParentStyles(btn);

    // 4. Find or create the text wrapper inside shadow DOM
    let labelWrapper = btn.querySelector('.usc-dislike-wrapper');
    if (!labelWrapper) {
      labelWrapper = document.createElement('div');
      labelWrapper.className = 'usc-dislike-wrapper';

      const label = document.createElement('span');
      label.className = 'usc-dislike-text yt-core-attributed-string yt-core-attributed-string--link-inherit-color';
      label.setAttribute('role', 'text');

      labelWrapper.appendChild(label);

      // Inject after the icon
      const iconWrapper = btn.querySelector('.yt-spec-button-shape-next__icon');
      if (iconWrapper) {
        iconWrapper.after(labelWrapper);
      } else {
        const icon = btn.querySelector('yt-icon, svg');
        if (icon) {
          icon.after(labelWrapper);
        } else {
          btn.appendChild(labelWrapper);
        }
      }
    }

    // Apply inline styles to ensure the wrapper and label are styled correctly inside shadow DOM
    ensureStyle(labelWrapper, 'display', 'inline-flex');
    ensureStyle(labelWrapper, 'align-items', 'center');
    ensureStyle(labelWrapper, 'margin-left', '6px');
    ensureStyle(labelWrapper, 'pointer-events', 'none');
    ensureStyle(labelWrapper, 'height', '100%');

    const labelSpan = labelWrapper.querySelector('.usc-dislike-text');
    const expectedText = formatCount(count);
    if (labelSpan && labelSpan.textContent !== expectedText) {
      labelSpan.textContent = expectedText;
    }
    if (labelSpan) {
      ensureStyle(labelSpan, 'font-family', 'inherit');
      ensureStyle(labelSpan, 'font-size', '14px');
      ensureStyle(labelSpan, 'font-weight', '500');
      ensureStyle(labelSpan, 'color', 'inherit');
      ensureStyle(labelSpan, 'pointer-events', 'none');
      ensureStyle(labelSpan, 'white-space', 'nowrap');
      ensureStyle(labelSpan, 'line-height', 'normal');
      ensureStyle(labelSpan, 'display', 'inline-block');
    }
  }

  async function updateDislikes(videoId) {
    if (!showDislikes) {
      cleanupDislikes();
      return;
    }
    const btn = findDislikeButton();
    if (!btn) return;

    // Check if the current button already has the correct videoId and styling applied
    const existingVideoId = btn.dataset.uscVideoId;
    const hasLabel = btn.querySelector('.usc-dislike-wrapper') !== null;
    const isCorrectVideo = existingVideoId === videoId;

    if (isCorrectVideo && hasLabel) {
      // It's already injected, but let's make sure styles and classes are still applied
      const count = dislikesCache.get(videoId);
      if (count !== undefined) {
        injectDislikeLabel(btn, count);
      }
      return;
    }

    // If it's a different video or label is missing, clean/reset button state first
    if (!isCorrectVideo) {
      btn.removeAttribute('data-usc-video-id');
      const wrapper = btn.querySelector('.usc-dislike-wrapper');
      if (wrapper) wrapper.remove();
    }

    const cached = dislikesCache.get(videoId);
    if (cached !== undefined) {
      btn.dataset.uscVideoId = videoId;
      btn.dataset.uscDislikeCount = cached;
      injectDislikeLabel(btn, cached);
      return;
    }

    if (window.__uscFetchingDislikes === videoId) return;
    window.__uscFetchingDislikes = videoId;
    try {
      const count = await fetchDislikes(videoId);
      dislikesCache.set(videoId, count);

      // Re-query the button as it might have changed during fetch
      const activeBtn = findDislikeButton();
      if (activeBtn) {
        activeBtn.dataset.uscVideoId = videoId;
        activeBtn.dataset.uscDislikeCount = count;
        injectDislikeLabel(activeBtn, count);
      }
    } catch (_) { }
    window.__uscFetchingDislikes = null;
  }

  // ── Auto-Like & General Settings ──────────────────────────────────────────────

  let autoLikeEnabled = true;
  let autoLikeThreshold = 10; // percent
  const autoLikedSession = new Set();

  let showDislikes = true;
  let showTimer = true;
  let sponsorBlockEnabled = true;

  function cleanupDislikes() {
    const btn = findDislikeButton();
    if (btn) {
      btn.removeAttribute('data-usc-video-id');
      btn.removeAttribute('data-usc-dislike-count');
      const wrapper = btn.querySelector('.usc-dislike-wrapper');
      if (wrapper) wrapper.remove();
      if (btn.classList.contains('yt-spec-button-shape-next--icon-leading')) {
        btn.classList.remove('yt-spec-button-shape-next--icon-leading');
        btn.classList.add('yt-spec-button-shape-next--icon-only');
      }
      if (btn.classList.contains('yt-spec-button-shape-next--icon-leading-default')) {
        btn.classList.remove('yt-spec-button-shape-next--icon-leading-default');
        btn.classList.add('yt-spec-button-shape-next--icon-only-default');
      }
      btn.style.removeProperty('width');
      btn.style.removeProperty('display');
      btn.style.removeProperty('align-items');
      btn.style.removeProperty('padding-left');
      btn.style.removeProperty('padding-right');
      btn.style.removeProperty('min-width');
      btn.style.setProperty('flex-direction', '', 'important');
      btn.style.setProperty('flex-wrap', '', 'important');

      const ytButtonShape = findClosestShadow(btn, 'yt-button-shape');
      if (ytButtonShape) {
        ytButtonShape.classList.remove('usc-dislike-added');
        ytButtonShape.style.removeProperty('width');
        ytButtonShape.style.removeProperty('display');
        ytButtonShape.style.removeProperty('align-items');
        ytButtonShape.style.removeProperty('min-width');
      }
      const dislikeVM = findClosestShadow(btn, 'dislike-button-view-model, #segmented-dislike-button, like-dislike-button-view-model, segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
      if (dislikeVM) {
        dislikeVM.classList.remove('usc-dislike-added');
        dislikeVM.style.removeProperty('width');
        dislikeVM.style.removeProperty('display');
        dislikeVM.style.removeProperty('align-items');
        dislikeVM.style.removeProperty('min-width');
      }
      const segmentedLayout = findClosestShadow(btn, 'yt-segmented-button-layout');
      if (segmentedLayout) {
        segmentedLayout.classList.remove('usc-dislike-added');
        segmentedLayout.style.removeProperty('width');
        segmentedLayout.style.removeProperty('display');
        segmentedLayout.style.removeProperty('align-items');
        segmentedLayout.style.removeProperty('min-width');
      }
    }
  }

  function cleanupTimer() {
    const el = document.getElementById('grzojda_time');
    if (el) el.remove();
  }

  function cleanupSponsorBlock() {
    document.querySelectorAll('.usc-sb-segment').forEach(function (el) { el.remove(); });
    skipBtn.style.display = 'none';
    hideTooltip();
  }

  function applySettings() {
    if (!showDislikes) {
      cleanupDislikes();
    } else {
      const videoId = new URLSearchParams(location.search).get('v');
      if (videoId) updateDislikes(videoId);
    }

    if (!showTimer) {
      cleanupTimer();
    } else {
      checkAndInjectTimer();
    }

    if (!sponsorBlockEnabled) {
      cleanupSponsorBlock();
    } else {
      renderSegments();
      checkSkipButton();
    }
  }

  chrome.storage.local.get([
    'joyn_autolike_enabled',
    'joyn_autolike_threshold',
    'joyn_show_dislikes',
    'joyn_show_timer',
    'joyn_sponsorblock_enabled'
  ], (res) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const resSafe = res || {};
    if (resSafe.joyn_autolike_enabled !== undefined) autoLikeEnabled = !!resSafe.joyn_autolike_enabled;
    const t = parseFloat(resSafe.joyn_autolike_threshold);
    if (isFinite(t)) autoLikeThreshold = Math.max(1, Math.min(100, t));

    if (resSafe.joyn_show_dislikes !== undefined) showDislikes = !!resSafe.joyn_show_dislikes;
    if (resSafe.joyn_show_timer !== undefined) showTimer = !!resSafe.joyn_show_timer;
    if (resSafe.joyn_sponsorblock_enabled !== undefined) sponsorBlockEnabled = !!resSafe.joyn_sponsorblock_enabled;

    applySettings();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (area !== 'local') return;
    if (changes.joyn_autolike_enabled && changes.joyn_autolike_enabled.newValue !== undefined) {
      autoLikeEnabled = !!changes.joyn_autolike_enabled.newValue;
    }
    if (changes.joyn_autolike_threshold && changes.joyn_autolike_threshold.newValue !== undefined) {
      const t = parseFloat(changes.joyn_autolike_threshold.newValue);
      if (isFinite(t)) autoLikeThreshold = Math.max(1, Math.min(100, t));
    }

    let needsUpdate = false;
    if (changes.joyn_show_dislikes && changes.joyn_show_dislikes.newValue !== undefined) {
      showDislikes = !!changes.joyn_show_dislikes.newValue;
      needsUpdate = true;
    }
    if (changes.joyn_show_timer && changes.joyn_show_timer.newValue !== undefined) {
      showTimer = !!changes.joyn_show_timer.newValue;
      needsUpdate = true;
    }
    if (changes.joyn_sponsorblock_enabled && changes.joyn_sponsorblock_enabled.newValue !== undefined) {
      sponsorBlockEnabled = !!changes.joyn_sponsorblock_enabled.newValue;
      needsUpdate = true;
    }

    if (needsUpdate) {
      applySettings();
    }
  });

  function findLikeButton() {
    const isPlayerBtn = btn => btn.closest('#movie_player, .html5-video-player, .ytp-chrome-controls, .ytp-player-content');

    // Helper to query elements, prioritizing the active watch page
    const queryActive = (selector) => {
      const activeWatch = document.querySelector('ytd-watch-flexy:not([hidden])');
      if (activeWatch) {
        const found = activeWatch.querySelectorAll(selector);
        if (found.length > 0) return found;
      }
      return document.querySelectorAll(selector);
    };

    const groups = queryActive(
      'segmented-like-dislike-button-view-model, ' +
      '#segmented-like-dislike-button, ' +
      'ytd-segmented-like-dislike-button-renderer, ' +
      'yt-segmented-button-layout, ' +
      'like-dislike-button-view-model'
    );
    for (const group of groups) {
      if (isPlayerBtn(group)) continue;
      const btns = group.querySelectorAll('button');
      if (btns.length >= 2) return btns[0];
    }
    const candidates = queryActive(
      'button[aria-label*="like" i], button[aria-label*="mag" i]'
    );
    for (const c of candidates) {
      if (isPlayerBtn(c)) continue;
      const label = (c.getAttribute('aria-label') || '').toLowerCase();
      if (
        label.includes('dislike') ||
        label.includes('nicht') ||
        label.includes('negativ') ||
        label.includes('pas aimer') ||
        label.includes('je n\'aime pas')
      ) continue;
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

    if (typeof btn.click === 'function') {
      btn.click();
      autoLikedSession.add(videoId);
      showAutoLikeToast();
    }
  }

  // ── YouTube speed-adjusted remaining time duration ───────────────────────────

  function timeToStr(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);

    if (hrs > 0) {
      return hrs + ':' + mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    }
    return mins + ':' + secs.toString().padStart(2, '0');
  }

  function updateTimer(video) {
    const el = document.getElementById('grzojda_time');
    if (!el || !video) return;
    if (!showTimer) {
      if (el.textContent !== '') el.textContent = '';
      return;
    }

    const playbackRate = video.playbackRate;
    const duration = video.duration;

    let target = '';
    if (playbackRate !== 1 && isFinite(duration) && duration > 0) {
      target = ' [' + timeToStr(duration / playbackRate) + ']';
    }
    if (el.textContent !== target) {
      el.textContent = target;
    }
  }

  function checkAndInjectTimer() {
    if (!showTimer) {
      cleanupTimer();
      return;
    }
    const durationElement = document.querySelector('.ytp-time-duration');
    if (!durationElement) return;

    let newSpan = document.getElementById('grzojda_time');
    if (!newSpan) {
      newSpan = document.createElement('span');
      newSpan.id = 'grzojda_time';
      newSpan.style.color = '#ff8a00'; // Orange accent for modern and premium styling
      newSpan.style.marginLeft = '5px';
      newSpan.style.fontWeight = '500';
      durationElement.insertAdjacentElement('afterend', newSpan);
    }

    const video = document.querySelector('video');
    if (video) {
      if (!video._uscTimerListenersAttached) {
        video._uscTimerListenersAttached = true;
        const updateHandler = () => updateTimer(video);
        video.addEventListener('ratechange', updateHandler);
        video.addEventListener('durationchange', updateHandler);
        // Initial call
        updateHandler();
      } else {
        updateTimer(video);
      }
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────

  async function update() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (!location.pathname.startsWith('/watch')) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    if (videoId !== sbVideoId) {
      sbVideoId = videoId;
      sbSegments = [];
      activeSegKey = '';
      skipBtn.style.display = 'none';
      if (sponsorBlockEnabled) {
        try { sbSegments = await fetchSegments(videoId); } catch (_) { }
      }
    }

    if (sponsorBlockEnabled) {
      renderSegments();
      checkSkipButton();
    } else {
      cleanupSponsorBlock();
    }

    maybeAutoLike(videoId);

    if (showDislikes) {
      await updateDislikes(videoId);
    } else {
      cleanupDislikes();
    }

    if (showTimer) {
      checkAndInjectTimer();
    } else {
      cleanupTimer();
    }
  }

  function fastUpdate() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (!location.pathname.startsWith('/watch')) return;
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) return;

    if (showDislikes) {
      updateDislikes(videoId);
    }
    if (showTimer) {
      checkAndInjectTimer();
    }
  }

  let fastUpdatePending = false;
  function triggerFastUpdate() {
    if (fastUpdatePending) return;
    fastUpdatePending = true;
    requestAnimationFrame(() => {
      fastUpdate();
      fastUpdatePending = false;
    });
  }

  let lastNavigatedVideoId = new URLSearchParams(location.search).get('v') || '';

  function handleNavigate() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    const newVideoId = new URLSearchParams(location.search).get('v') || '';
    if (lastNavigatedVideoId && newVideoId && lastNavigatedVideoId !== newVideoId) {
      lastNavigatedVideoId = newVideoId;
      location.reload();
      return;
    }
    lastNavigatedVideoId = newVideoId;
    cleanupDislikes();
    update();
  }
  document.addEventListener('yt-navigate-finish', handleNavigate);

  // MutationObserver for instant layout and display restoration on DOM mutations
  const observer = new MutationObserver(() => {
    triggerFastUpdate();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden']
  });

  // Frequent check for skip button (every 500ms)
  setInterval(checkSkipButton, 500);
  // Full update every 1.5s (segments + dislike + auto-like)
  setInterval(update, 1500);
  update();
})();
