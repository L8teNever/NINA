// youtube-watch-status.js — Tracks per-video watch progress on YouTube.
// Marks a video "Angefangen" once playback starts and "Gesehen" once the
// configured percentage of the video has been watched. Status is cached in
// chrome.storage.local (fast, per-device) and synced through Google Drive
// (lib/google-drive.js / window.NinaDrive) so it carries over across devices
// signed into the same Google account, the same way notes already do.

(function () {
  'use strict';

  if (window.__uscYtWatchStatusLoaded) return;
  window.__uscYtWatchStatusLoaded = true;

  const LOCAL_KEY = 'nina_yt_watch_status';
  const STATUS_STARTED = 'started';
  const STATUS_WATCHED = 'watched';
  const LABELS = { [STATUS_STARTED]: 'Angefangen', [STATUS_WATCHED]: 'Gesehen' };

  let enabled = true;
  let watchedThreshold = 90; // percent
  let statusMap = {}; // videoId -> { status, progress, updatedAt }

  // ── Styles ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .usc-watch-frame {
      position: relative !important;
    }
    .usc-watch-frame-box {
      position: absolute;
      pointer-events: none;
      border-radius: 12px;
      box-shadow: none;
      transition: box-shadow 0.15s ease;
    }
    .usc-watch-frame-box.usc-watch-frame-started {
      box-shadow:
        inset 0 4px 0 0 #f5a623,
        inset 4px 0 0 0 #f5a623,
        inset -4px 0 0 0 #f5a623;
    }
    .usc-watch-frame-box.usc-watch-frame-watched {
      box-shadow:
        inset 0 4px 0 0 #3dd16f,
        inset 4px 0 0 0 #3dd16f,
        inset -4px 0 0 0 #3dd16f;
    }
    .usc-watch-badge {
      position: absolute;
      z-index: 3;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      font-family: 'Roboto', 'Google Sans', sans-serif;
      color: #0b0b0b;
      pointer-events: none;
      line-height: 1.4;
      white-space: nowrap;
    }
    .usc-watch-badge-started {
      background: #f5a623;
    }
    .usc-watch-badge-watched {
      background: #3dd16f;
    }
    .usc-watch-status-badge {
      display: inline-flex;
      align-items: center;
      margin-right: 8px;
      padding: 0 14px;
      height: 36px;
      border-radius: 18px;
      font-size: 14px;
      font-weight: 500;
      font-family: 'Roboto', 'Google Sans', sans-serif;
      color: #0b0b0b;
      white-space: nowrap;
    }
    .usc-watch-status-started {
      background: #f5a623;
    }
    .usc-watch-status-watched {
      background: #3dd16f;
    }
    .usc-watch-resume-marker {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 2px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.55);
      pointer-events: none;
      z-index: 40;
    }
  `;
  document.head.appendChild(style);

  // ── Settings ───────────────────────────────────────────────────────────
  function loadSettings(cb) {
    chrome.storage.local.get(
      ['joyn_yt_watch_status_enabled', 'joyn_yt_watched_threshold', LOCAL_KEY],
      (res) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
        const r = res || {};
        enabled = r.joyn_yt_watch_status_enabled !== undefined ? !!r.joyn_yt_watch_status_enabled : true;
        const t = parseFloat(r.joyn_yt_watched_threshold);
        watchedThreshold = isFinite(t) ? Math.max(1, Math.min(100, t)) : 90;
        statusMap = r[LOCAL_KEY] || {};
        cb && cb();
      }
    );
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
    if (area !== 'local') return;
    if (changes.joyn_yt_watch_status_enabled) {
      enabled = !!changes.joyn_yt_watch_status_enabled.newValue;
      refreshAllBadges();
    }
    if (changes.joyn_yt_watched_threshold) {
      const t = parseFloat(changes.joyn_yt_watched_threshold.newValue);
      if (isFinite(t)) watchedThreshold = Math.max(1, Math.min(100, t));
    }
  });

  function persistLocal() {
    chrome.storage.local.set({ [LOCAL_KEY]: statusMap });
  }

  // ── Drive sync ─────────────────────────────────────────────────────────
  // Newer-wins merge by updatedAt, same rule notes-overlay.js uses for notes.
  function mergeStatusMaps(a, b) {
    const merged = { ...a };
    for (const id in b) {
      const existing = merged[id];
      const incoming = b[id];
      if (!existing) {
        merged[id] = incoming;
        continue;
      }
      // Newer wins for status/updatedAt, but lastPosition is a high-water
      // mark: take whichever is further, regardless of which side is
      // "newer" — otherwise syncing from a device that only briefly
      // reopened the video could erase real progress made elsewhere.
      const winner = (incoming.updatedAt || 0) >= (existing.updatedAt || 0) ? incoming : existing;
      const loser = winner === incoming ? existing : incoming;
      const furthest = isFinite(winner.lastPosition) && isFinite(loser.lastPosition)
        ? Math.max(winner.lastPosition, loser.lastPosition)
        : (winner.lastPosition ?? loser.lastPosition);
      merged[id] = { ...winner, lastPosition: furthest };
    }
    return merged;
  }

  let driveDirty = false;
  let driveSyncTimer = null;

  function scheduleDriveSync() {
    driveDirty = true;
    clearTimeout(driveSyncTimer);
    driveSyncTimer = setTimeout(pushToDrive, 3000);
  }

  async function pushToDrive() {
    if (!driveDirty) return;
    driveDirty = false;
    if (!window.NinaDrive || !window.NinaDrive.isConnected()) return;
    try {
      const remote = await window.NinaDrive.getWatchStatus();
      const merged = mergeStatusMaps(remote || {}, statusMap);
      statusMap = merged;
      persistLocal();
      await window.NinaDrive.saveWatchStatus(merged);
    } catch (_) {}
  }

  async function pullFromDriveOnce() {
    if (!window.NinaDrive) return;
    try {
      if (!window.NinaDrive.isConnected() && window.NinaDrive.tryAutoConnect) {
        await window.NinaDrive.tryAutoConnect();
      }
      if (!window.NinaDrive.isConnected()) return;
      const remote = await window.NinaDrive.getWatchStatus();
      if (remote) {
        statusMap = mergeStatusMaps(statusMap, remote);
        persistLocal();
      }
    } catch (_) {}
  }

  // ── Status transitions ────────────────────────────────────────────────
  // Only the status itself is tracked (not a live percentage) — timeupdate
  // fires several times a second, so persisting/rescanning the whole
  // thumbnail grid on every 1% tick would be wasteful. This only writes on
  // an actual state change: unset -> started -> watched.
  function setStatus(videoId, status) {
    if (!videoId || !enabled) return;
    const existing = statusMap[videoId];
    // Never downgrade an already-watched video back to "started".
    if (existing && existing.status === STATUS_WATCHED && status === STATUS_STARTED) return;
    if (existing && existing.status === status) return;
    statusMap[videoId] = { ...existing, status, updatedAt: Date.now() };
    persistLocal();
    scheduleDriveSync();
    refreshAllBadges();
  }

  // Exact resume position, so the progress bar can show a "you got this far
  // last time" marker. Throttled to every 5s during playback (instead of
  // every timeupdate tick) plus a forced flush on pause/leaving the video,
  // so the final position is never more than a few seconds stale.
  let lastPositionSaveAt = 0;
  function savePosition(videoId, position, duration, force) {
    if (!videoId || !enabled || !isFinite(position) || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (!force && now - lastPositionSaveAt < 5000) return;
    lastPositionSaveAt = now;
    const existing = statusMap[videoId];
    // The marker tracks the furthest point ever reached, not just the last
    // one — rewinding, or reloading and starting from 0, shouldn't erase it.
    const furthest = existing && isFinite(existing.lastPosition) ? Math.max(existing.lastPosition, position) : position;
    if (existing && furthest === existing.lastPosition && existing.duration === duration) return;
    statusMap[videoId] = { ...existing, lastPosition: furthest, duration, updatedAt: Date.now() };
    persistLocal();
    scheduleDriveSync();
    renderResumeMarker();
  }

  function forceSaveCurrentPosition() {
    if (!trackedVideo || !trackedVideoId) return;
    savePosition(trackedVideoId, trackedVideo.currentTime, trackedVideo.duration, true);
    pushToDrive();
  }

  // ── Watch-page progress tracking ─────────────────────────────────────
  let trackedVideo = null;
  let trackedVideoId = null;

  function getCurrentVideoId() {
    if (!location.pathname.startsWith('/watch')) return null;
    return new URLSearchParams(location.search).get('v');
  }

  function onTimeUpdate() {
    if (!enabled) return;
    const video = trackedVideo;
    const videoId = trackedVideoId;
    if (!video || !videoId || !isFinite(video.duration) || video.duration <= 0) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (pct >= watchedThreshold) {
      setStatus(videoId, STATUS_WATCHED);
    } else if (video.currentTime > 2) {
      // Absolute seconds, not percent: 0.5% of a 1h15 video is 22+ seconds,
      // so "started" would never fire for a short viewing session on a long
      // video even though a position (and therefore a statusMap entry
      // without a status) had already been saved below.
      setStatus(videoId, STATUS_STARTED);
    }
    savePosition(videoId, video.currentTime, video.duration, false);
  }

  function attachTracking() {
    const videoId = getCurrentVideoId();
    if (!videoId) {
      if (trackedVideo) {
        forceSaveCurrentPosition();
        trackedVideo.removeEventListener('timeupdate', onTimeUpdate);
        trackedVideo.removeEventListener('pause', forceSaveCurrentPosition);
      }
      trackedVideo = null;
      trackedVideoId = null;
      updateWatchButton();
      removeResumeMarker();
      return;
    }
    const video = document.querySelector('video');
    if (!video || (trackedVideo === video && trackedVideoId === videoId)) return;

    if (trackedVideo) {
      forceSaveCurrentPosition();
      trackedVideo.removeEventListener('timeupdate', onTimeUpdate);
      trackedVideo.removeEventListener('pause', forceSaveCurrentPosition);
    }
    trackedVideo = video;
    trackedVideoId = videoId;
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('pause', forceSaveCurrentPosition);
    onTimeUpdate();
    updateWatchButton();
    renderResumeMarker();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      forceSaveCurrentPosition();
    } else {
      // Coming back to the tab: pull the latest state from Drive (in case
      // another device changed something while this tab sat inactive) and
      // re-render everything, so the status is fresh without needing a
      // full page reload.
      pullFromDriveOnce().then(refreshAllBadges);
    }
  });

  // ── Progress-bar "resume point" marker ────────────────────────────────
  // A thin gray line along the bottom edge of YouTube's own progress bar
  // (not protruding below it into the controls row), showing how far the
  // video had been watched as of the last saved position — not the live
  // playhead (YouTube already shows that in red), but the saved one, so it
  // stays visible/useful even before you've resumed playback.
  function removeResumeMarker() {
    const marker = document.querySelector('.usc-watch-resume-marker');
    if (marker) marker.remove();
  }

  function renderResumeMarker() {
    if (!enabled) return;
    const videoId = getCurrentVideoId();
    const entry = videoId ? statusMap[videoId] : null;
    const bar = document.querySelector('.ytp-progress-bar');

    if (!bar || !entry || !entry.lastPosition || !entry.duration || entry.duration <= 0) {
      removeResumeMarker();
      return;
    }

    const pct = Math.max(0, Math.min(100, (entry.lastPosition / entry.duration) * 100));
    let marker = bar.querySelector('.usc-watch-resume-marker');
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'usc-watch-resume-marker';
      bar.appendChild(marker);
    }
    marker.style.width = pct + '%';
  }

  // ── Watch-page status button (left of like/dislike) ──────────────────
  function findLikeDislikeGroup() {
    const activeWatch = document.querySelector('ytd-watch-flexy:not([hidden])');
    const root = activeWatch || document;
    return root.querySelector(
      'segmented-like-dislike-button-view-model, #segmented-like-dislike-button, ' +
      'ytd-segmented-like-dislike-button-renderer, yt-segmented-button-layout, ' +
      'like-dislike-button-view-model'
    );
  }

  // A statusMap entry can (from before onTimeUpdate's absolute-seconds fix,
  // or a merge from an older Drive snapshot) have a saved position but no
  // `status` — e.g. a short viewing session on a long video. Treat "has a
  // position" as "started" so those entries still render instead of an
  // empty/broken badge.
  function effectiveStatus(entry) {
    if (!entry) return null;
    if (entry.status) return entry.status;
    return entry.lastPosition ? STATUS_STARTED : null;
  }

  function updateWatchButton() {
    const existing = document.getElementById('usc-watch-status-btn');
    const videoId = getCurrentVideoId();
    const entry = videoId ? statusMap[videoId] : null;
    const status = effectiveStatus(entry);

    if (!enabled || !status) {
      if (existing) existing.remove();
      return;
    }

    const group = findLikeDislikeGroup();
    if (!group || !group.parentElement) return;

    let btn = existing;
    if (!btn || btn.parentElement !== group.parentElement) {
      if (btn) btn.remove();
      btn = document.createElement('div');
      btn.id = 'usc-watch-status-btn';
      group.parentElement.insertBefore(btn, group);
    }
    btn.className = 'usc-watch-status-badge usc-watch-status-' + status;
    btn.textContent = LABELS[status] || '';
  }

  // ── Thumbnail grid badges ────────────────────────────────────────────
  // Shorts are deliberately excluded from tracking entirely — there are far
  // too many of them scrolled past to make "started/watched" meaningful.
  function extractVideoId(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      if (url.pathname === '/watch') return url.searchParams.get('v');
    } catch (_) {}
    return null;
  }

  function applyBadge(container, videoId) {
    const entry = statusMap[videoId];
    const status = effectiveStatus(entry);
    let frame = container.querySelector(':scope > .usc-watch-frame-box');
    let badge = container.querySelector(':scope > .usc-watch-badge');

    if (!status) {
      if (frame) frame.remove();
      if (badge) badge.remove();
      container.classList.remove('usc-watch-frame');
      return;
    }

    container.classList.add('usc-watch-frame');

    // The chosen link (container) can be taller than the actual thumbnail
    // image — e.g. an extra hit-area below it — which made the frame hang
    // off the bottom past the picture. Measure the real <img> and position
    // the frame/badge to match it exactly instead of filling the container.
    const img = container.querySelector('img');
    const containerRect = container.getBoundingClientRect();
    const imgRect = img ? img.getBoundingClientRect() : null;
    const useRect = (imgRect && imgRect.width > 0 && imgRect.height > 0) ? imgRect : containerRect;
    const left = useRect.left - containerRect.left;
    const top = useRect.top - containerRect.top;

    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'usc-watch-frame-box';
      // Appended last (on top) so it's actually visible over the opaque
      // thumbnail image — inserting it first hid it completely behind the
      // image. The frame has no bottom edge (see the CSS above), so it
      // doesn't cover YouTube's own red "watched" progress line down there
      // regardless of stacking order.
      container.appendChild(frame);
    }
    frame.style.left = left + 'px';
    frame.style.top = top + 'px';
    frame.style.width = useRect.width + 'px';
    frame.style.height = useRect.height + 'px';
    frame.className = 'usc-watch-frame-box usc-watch-frame-' + status;

    if (!badge) {
      badge = document.createElement('div');
      container.appendChild(badge);
    }
    badge.style.left = (left + 4) + 'px';
    badge.style.top = (top + useRect.height - 22) + 'px';
    badge.className = 'usc-watch-badge usc-watch-badge-' + status;
    badge.textContent = LABELS[status] || '';
  }

  function scanThumbnails() {
    if (!enabled) return;
    // YouTube keeps changing the custom element that wraps a thumbnail
    // (ytd-thumbnail, yt-thumbnail-view-model, ...) depending on the page
    // and rollout — chasing element names is a losing game. Instead: every
    // video shows up as *two* links to the same href, a big thumbnail one
    // and a small title-text one. Find all matching links, keep only the
    // largest-rendered one per video id, and use that as the badge target —
    // works regardless of whatever wraps it.
    const links = document.querySelectorAll('a[href*="/watch?v="]');
    const bestByVideoId = new Map();
    for (const a of links) {
      const videoId = extractVideoId(a.getAttribute('href'));
      if (!videoId) continue;
      const rect = a.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area < 2000) continue; // too small to be the thumbnail image itself
      const current = bestByVideoId.get(videoId);
      if (!current || area > current.area) {
        bestByVideoId.set(videoId, { el: a, area });
      }
    }
    for (const [videoId, best] of bestByVideoId) {
      applyBadge(best.el, videoId);
    }
  }

  function refreshAllBadges() {
    scanThumbnails();
    updateWatchButton();
    renderResumeMarker();
  }

  // ── Main loop ─────────────────────────────────────────────────────────
  loadSettings(() => {
    refreshAllBadges();
    pullFromDriveOnce().then(refreshAllBadges);
  });

  document.addEventListener('yt-navigate-finish', () => {
    attachTracking();
    refreshAllBadges();
  });

  // YouTube's grid mutates constantly (lazy thumbnails, view counts, etc.);
  // rAF-debounce so a burst of mutations only triggers one scan per frame.
  let scanPending = false;
  function triggerScan() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      scanPending = false;
      scanThumbnails();
    });
  }

  const observer = new MutationObserver(triggerScan);
  observer.observe(document.body, { childList: true, subtree: true });

  // Also re-render the resume marker periodically on its own, independent of
  // attachTracking()'s "same video, do nothing" short-circuit — the player
  // can recreate .ytp-progress-bar (quality changes, ads) while staying on
  // the same video.
  setInterval(() => {
    attachTracking();
    renderResumeMarker();
  }, 1000);
  attachTracking();
})();
