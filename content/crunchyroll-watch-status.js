// crunchyroll-watch-status.js — Tracks per-episode watch progress on
// Crunchyroll, same idea as youtube-watch-status.js: marks an episode
// "Angefangen" once playback starts and "Gesehen" once the configured
// percentage has been watched. Status is cached in chrome.storage.local and
// synced through Google Drive (lib/google-drive.js / window.NinaDrive) so it
// carries over across devices.
//
// Crunchyroll's exact DOM (element/component names) isn't something this was
// built against live — the selectors here are best-effort and, like the
// YouTube version originally, will likely need real-world adjustment.

(function () {
  'use strict';

  if (window.__uscCrWatchStatusLoaded) return;
  window.__uscCrWatchStatusLoaded = true;

  const LOCAL_KEY = 'nina_cr_watch_status';
  const STATUS_STARTED = 'started';
  const STATUS_WATCHED = 'watched';
  const LABELS = { [STATUS_STARTED]: 'Angefangen', [STATUS_WATCHED]: 'Gesehen' };

  let enabled = true;
  // Shared with YouTube's setting (joyn_yt_watched_threshold) — "% of a
  // video that counts as watched" isn't a YouTube-specific preference.
  let watchedThreshold = 90; // percent
  let statusMap = {}; // episodeId -> { status, lastPosition, duration, updatedAt }

  // ── Styles (identical scheme to the YouTube version, different prefix) ──
  const style = document.createElement('style');
  style.textContent = `
    .usc-cr-watch-frame {
      position: relative !important;
    }
    .usc-cr-watch-frame-box {
      position: absolute;
      pointer-events: none;
      border-radius: 10px;
      box-shadow: none;
      transition: box-shadow 0.15s ease;
    }
    .usc-cr-watch-frame-box.usc-cr-watch-frame-started {
      box-shadow:
        inset 0 4px 0 0 #f5a623,
        inset 4px 0 0 0 #f5a623,
        inset -4px 0 0 0 #f5a623;
    }
    .usc-cr-watch-frame-box.usc-cr-watch-frame-watched {
      box-shadow:
        inset 0 4px 0 0 #3dd16f,
        inset 4px 0 0 0 #3dd16f,
        inset -4px 0 0 0 #3dd16f;
    }
    .usc-cr-watch-badge {
      position: absolute;
      z-index: 3;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      color: #0b0b0b;
      pointer-events: none;
      line-height: 1.4;
      white-space: nowrap;
    }
    .usc-cr-watch-badge-started { background: #f5a623; }
    .usc-cr-watch-badge-watched { background: #3dd16f; }
    /* Show posters (e.g. "Vorschläge für dich") — separate class names from
       the episode frame above so the episode-frame cleanup sweep doesn't
       treat these as stale episode badges and remove them. */
    .usc-cr-series-frame {
      position: relative !important;
    }
    .usc-cr-series-frame-box {
      position: absolute;
      pointer-events: none;
      border-radius: 10px;
      box-shadow:
        inset 0 4px 0 0 #f5a623,
        inset 4px 0 0 0 #f5a623,
        inset -4px 0 0 0 #f5a623;
    }
    .usc-cr-watch-status-badge {
      display: inline-flex;
      align-items: center;
      margin-right: 8px;
      padding: 0 14px;
      height: 32px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: #0b0b0b;
      white-space: nowrap;
    }
    .usc-cr-watch-status-started { background: #f5a623; }
    .usc-cr-watch-status-watched { background: #3dd16f; }
    .usc-cr-watch-resume-marker {
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
      ['joyn_cr_watch_status_enabled', 'joyn_yt_watched_threshold', LOCAL_KEY],
      (res) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
        const r = res || {};
        enabled = r.joyn_cr_watch_status_enabled !== undefined ? !!r.joyn_cr_watch_status_enabled : true;
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
    if (changes.joyn_cr_watch_status_enabled) {
      enabled = !!changes.joyn_cr_watch_status_enabled.newValue;
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
  function mergeStatusMaps(a, b) {
    const merged = { ...a };
    for (const id in b) {
      const existing = merged[id];
      const incoming = b[id];
      if (!existing) {
        merged[id] = incoming;
        continue;
      }
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
      const remote = await window.NinaDrive.getCrunchyrollWatchStatus();
      const merged = mergeStatusMaps(remote || {}, statusMap);
      statusMap = merged;
      persistLocal();
      await window.NinaDrive.saveCrunchyrollWatchStatus(merged);
    } catch (_) {}
  }

  async function pullFromDriveOnce() {
    if (!window.NinaDrive) return;
    try {
      if (!window.NinaDrive.isConnected() && window.NinaDrive.tryAutoConnect) {
        await window.NinaDrive.tryAutoConnect();
      }
      if (!window.NinaDrive.isConnected()) return;
      const remote = await window.NinaDrive.getCrunchyrollWatchStatus();
      if (remote) {
        statusMap = mergeStatusMaps(statusMap, remote);
        persistLocal();
      }
    } catch (_) {}
  }

  // ── Status transitions ────────────────────────────────────────────────
  function setStatus(episodeId, status) {
    if (!episodeId || !enabled) return;
    const existing = statusMap[episodeId];
    if (existing && existing.status === STATUS_WATCHED && status === STATUS_STARTED) return;
    if (existing && existing.status === status) return;
    statusMap[episodeId] = { ...existing, status, updatedAt: Date.now() };
    persistLocal();
    scheduleDriveSync();
    refreshAllBadges();
  }

  let lastPositionSaveAt = 0;
  function savePosition(episodeId, position, duration, force) {
    if (!episodeId || !enabled || !isFinite(position) || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (!force && now - lastPositionSaveAt < 5000) return;
    lastPositionSaveAt = now;
    const existing = statusMap[episodeId];
    const furthest = existing && isFinite(existing.lastPosition) ? Math.max(existing.lastPosition, position) : position;
    if (existing && furthest === existing.lastPosition && existing.duration === duration) return;
    statusMap[episodeId] = { ...existing, lastPosition: furthest, duration, updatedAt: Date.now() };
    persistLocal();
    scheduleDriveSync();
    renderResumeMarker();
  }

  function forceSaveCurrentPosition() {
    if (!trackedVideo || !trackedEpisodeId) return;
    savePosition(trackedEpisodeId, trackedVideo.currentTime, trackedVideo.duration, true);
    pushToDrive();
  }

  // ── Watch-page progress tracking ─────────────────────────────────────
  let trackedVideo = null;
  let trackedEpisodeId = null;

  function getCurrentEpisodeId() {
    const idx = location.pathname.indexOf('/watch/');
    if (idx === -1) return null;
    const rest = location.pathname.slice(idx + '/watch/'.length);
    const id = rest.split('/')[0];
    return id || null;
  }

  function onTimeUpdate() {
    if (!enabled) return;
    const video = trackedVideo;
    const episodeId = trackedEpisodeId;
    if (!video || !episodeId || !isFinite(video.duration) || video.duration <= 0) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (pct >= watchedThreshold) {
      setStatus(episodeId, STATUS_WATCHED);
    } else if (video.currentTime > 2) {
      setStatus(episodeId, STATUS_STARTED);
    }
    savePosition(episodeId, video.currentTime, video.duration, false);
  }

  function attachTracking() {
    const episodeId = getCurrentEpisodeId();
    if (!episodeId) {
      if (trackedVideo) {
        forceSaveCurrentPosition();
        trackedVideo.removeEventListener('timeupdate', onTimeUpdate);
        trackedVideo.removeEventListener('pause', forceSaveCurrentPosition);
      }
      trackedVideo = null;
      trackedEpisodeId = null;
      updateWatchButton();
      removeResumeMarker();
      return;
    }
    const video = document.querySelector('video');
    if (!video || (trackedVideo === video && trackedEpisodeId === episodeId)) return;

    if (trackedVideo) {
      forceSaveCurrentPosition();
      trackedVideo.removeEventListener('timeupdate', onTimeUpdate);
      trackedVideo.removeEventListener('pause', forceSaveCurrentPosition);
    }
    trackedVideo = video;
    trackedEpisodeId = episodeId;
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
      pullFromDriveOnce().then(refreshAllBadges);
    }
  });

  // ── Progress-bar "resume point" marker ────────────────────────────────
  // Crunchyroll's player (Vilos) doesn't have one single, confirmed stable
  // progress-bar selector the way YouTube's .ytp-progress-bar is known —
  // try a few plausible candidates and just skip the marker if none match,
  // rather than guessing wrong and breaking something.
  function findProgressBar() {
    const candidates = [
      '[data-testid="vilos-progress_bar"]',
      '[data-testid="vilos-progress-bar"]',
      '[class*="progress-bar" i]',
      '[class*="ProgressBar" i]'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 50) return el;
    }
    return null;
  }

  function removeResumeMarker() {
    const marker = document.querySelector('.usc-cr-watch-resume-marker');
    if (marker) marker.remove();
  }

  function renderResumeMarker() {
    if (!enabled) return;
    const episodeId = getCurrentEpisodeId();
    const entry = episodeId ? statusMap[episodeId] : null;
    const bar = findProgressBar();

    if (!bar || !entry || !entry.lastPosition || !entry.duration || entry.duration <= 0) {
      removeResumeMarker();
      return;
    }

    const pct = Math.max(0, Math.min(100, (entry.lastPosition / entry.duration) * 100));
    let marker = bar.querySelector(':scope > .usc-cr-watch-resume-marker');
    if (!marker) {
      bar.style.position = bar.style.position || 'relative';
      marker = document.createElement('div');
      marker.className = 'usc-cr-watch-resume-marker';
      bar.appendChild(marker);
    }
    marker.style.width = pct + '%';
  }

  // ── Watch-page status button ──────────────────────────────────────────
  // Best-effort: park it near whatever looks like the player's bottom-right
  // controls cluster. If nothing matches, the badge just doesn't show on
  // the watch page — the thumbnail badges/frames still work either way.
  function findControlsAnchor() {
    return document.querySelector(
      '[data-testid="bottom-right-controls-stack"], [data-testid="vilos-settings-button"], [data-testid="vilos-fullscreen-button"]'
    );
  }

  function updateWatchButton() {
    const existing = document.getElementById('usc-cr-watch-status-btn');
    const episodeId = getCurrentEpisodeId();
    const entry = episodeId ? statusMap[episodeId] : null;

    if (!enabled || !entry) {
      if (existing) existing.remove();
      return;
    }

    const anchor = findControlsAnchor();
    if (!anchor || !anchor.parentElement) return;

    let btn = existing;
    if (!btn || btn.parentElement !== anchor.parentElement) {
      if (btn) btn.remove();
      btn = document.createElement('div');
      btn.id = 'usc-cr-watch-status-btn';
      anchor.parentElement.insertBefore(btn, anchor);
    }
    btn.className = 'usc-cr-watch-status-badge usc-cr-watch-status-' + entry.status;
    btn.textContent = LABELS[entry.status] || '';
  }

  // A card can contain more than one <img> — the poster/thumbnail plus a
  // small bookmark/rating/flag icon. querySelector('img') just grabs
  // whichever comes first in the DOM, which is sometimes the small icon,
  // sizing our frame to a tiny corner instead of the whole artwork. Always
  // take the largest-rendered one instead.
  function findLargestImg(container) {
    const imgs = container.querySelectorAll('img');
    let best = null;
    let bestArea = 0;
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = img;
      }
    }
    return best;
  }

  // Loose match for show titles: lowercase, strip punctuation/whitespace
  // differences so e.g. "Mushoku Tensei: Jobless Reincarnation" (episode
  // thumbnail alt text) still matches "Mushoku Tensei: Jobless
  // Reincarnation Season 3" (a poster's alt text) via substring check.
  function normalizeSeriesHint(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // ── Episode grid badges ───────────────────────────────────────────────
  function extractEpisodeId(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      const idx = url.pathname.indexOf('/watch/');
      if (idx === -1) return null;
      const rest = url.pathname.slice(idx + '/watch/'.length);
      return rest.split('/')[0] || null;
    } catch (_) {
      return null;
    }
  }

  function applyBadge(container, episodeId) {
    const entry = statusMap[episodeId];
    let frame = container.querySelector(':scope > .usc-cr-watch-frame-box');
    let badge = container.querySelector(':scope > .usc-cr-watch-badge');

    if (!entry) {
      if (frame) frame.remove();
      if (badge) badge.remove();
      container.classList.remove('usc-cr-watch-frame');
      return;
    }

    const img = findLargestImg(container);
    const containerRect = container.getBoundingClientRect();
    const imgRect = img ? img.getBoundingClientRect() : null;

    // Hovering a card can expand it into a preview with title/date/
    // description/"Erneut anschauen" below the (now much smaller relative)
    // image. Our badge is positioned off the image's own size, so in that
    // expanded state it ends up floating over the description text instead
    // of sitting on the thumbnail. Hide it whenever the image no longer
    // makes up most of the card's height — a reliable enough signal that
    // we're looking at the expanded state rather than the plain thumbnail.
    if (imgRect && containerRect.height > 0 && imgRect.height / containerRect.height < 0.6) {
      if (frame) frame.remove();
      if (badge) badge.remove();
      container.classList.remove('usc-cr-watch-frame');
      return;
    }

    container.classList.add('usc-cr-watch-frame');

    // Best-effort link from this episode to its show, for the "started"
    // frame on show posters below — read once, keep whatever we first saw.
    if (img && img.alt && !entry.seriesHint) {
      entry.seriesHint = normalizeSeriesHint(img.alt);
      persistLocal();
    }

    const useRect = (imgRect && imgRect.width > 0 && imgRect.height > 0) ? imgRect : containerRect;
    const left = useRect.left - containerRect.left;
    const top = useRect.top - containerRect.top;

    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'usc-cr-watch-frame-box';
      container.appendChild(frame);
    }
    frame.style.left = left + 'px';
    frame.style.top = top + 'px';
    frame.style.width = useRect.width + 'px';
    frame.style.height = useRect.height + 'px';
    frame.className = 'usc-cr-watch-frame-box usc-cr-watch-frame-' + entry.status;

    if (!badge) {
      badge = document.createElement('div');
      container.appendChild(badge);
    }
    badge.style.left = (left + 4) + 'px';
    badge.style.top = (top + useRect.height - 22) + 'px';
    badge.className = 'usc-cr-watch-badge usc-cr-watch-badge-' + entry.status;
    badge.textContent = LABELS[entry.status] || '';
  }

  // episodeId -> the <a> currently carrying the badge. Kept across scans on
  // purpose: Crunchyroll's hover-preview card (same href, a second link)
  // sits close enough in size to the original tile that re-picking "the
  // biggest one" fresh every scan flipped between the two, tearing the
  // badge down and rebuilding it elsewhere every time — the flicker. Once
  // an element is chosen for an episode, keep it until it's actually gone;
  // only then pick again.
  const chosenElements = new Map();

  // Crunchyroll's own "Geschaut" label appears once an episode is finished
  // — whether from actually watching it or from marking it watched in
  // Crunchyroll's own UI. We don't know exactly how deep it's nested
  // relative to the thumbnail link (guessing that by climbing ancestors
  // was unreliable), so find every such label on the page and match it to
  // a thumbnail purely by screen position instead — that holds regardless
  // of Crunchyroll's internal component structure.
  function findGeschautLabelRects() {
    const rects = [];
    const all = document.querySelectorAll('span, div, p, a');
    for (const el of all) {
      if (el.children.length > 0) continue; // only leaf nodes carry just the label text
      const text = (el.textContent || '').trim();
      if (text !== 'Geschaut' && text !== 'Watched') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    return rects;
  }

  function isNearAnyLabel(containerRect, labelRects) {
    for (const label of labelRects) {
      const verticalNear = label.top < containerRect.bottom + 40 && label.bottom > containerRect.top - 10;
      const horizontalOverlap = label.left < containerRect.right && label.right > containerRect.left;
      if (verticalNear && horizontalOverlap) return true;
    }
    return false;
  }

  function scanThumbnails() {
    if (!enabled) return;
    const links = document.querySelectorAll('a[href*="/watch/"]');
    const candidatesByEpisodeId = new Map();
    for (const a of links) {
      const episodeId = extractEpisodeId(a.getAttribute('href'));
      if (!episodeId) continue;
      // A real thumbnail link always wraps the episode's <img>. CTA buttons
      // like "Erneut anschauen" (hero banners, "continue watching" cards)
      // also link to /watch/<id> and could be the largest match, but don't
      // contain an image — just an icon + text label. (Checking for "no
      // visible text" instead doesn't work: Crunchyroll's own "Geschaut"
      // label can sit inside the same link as the thumbnail image.)
      if (!a.querySelector('img')) continue;
      const rect = a.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area < 2000) continue;
      let list = candidatesByEpisodeId.get(episodeId);
      if (!list) candidatesByEpisodeId.set(episodeId, (list = []));
      list.push({ el: a, area });
    }

    const chosenByEpisodeId = new Map();
    for (const [episodeId, candidates] of candidatesByEpisodeId) {
      const previous = chosenElements.get(episodeId);
      const stillValid = previous && candidates.some((c) => c.el === previous);
      let chosen;
      if (stillValid) {
        chosen = previous;
      } else {
        chosen = candidates.reduce((a, b) => (b.area > a.area ? b : a)).el;
        chosenElements.set(episodeId, chosen);
      }
      chosenByEpisodeId.set(episodeId, chosen);
    }

    // Clean up badges left behind on elements that aren't the chosen one
    // for their episode anymore (or whose episode no longer has any
    // candidate at all, e.g. scrolled out of the DOM).
    const stale = document.querySelectorAll('.usc-cr-watch-frame-box, .usc-cr-watch-badge');
    for (const el of stale) {
      const container = el.parentElement;
      if (!container || container.tagName !== 'A') continue;
      const episodeId = extractEpisodeId(container.getAttribute('href'));
      const chosen = episodeId ? chosenByEpisodeId.get(episodeId) : null;
      if (chosen !== container) {
        el.remove();
        container.classList.remove('usc-cr-watch-frame');
      }
    }

    // Pick up anything Crunchyroll itself already considers watched. Update
    // the map directly (not via setStatus(), which would trigger its own
    // refreshAllBadges() -> scanThumbnails() per newly-watched episode) and
    // do one persist/sync after the loop; applyBadge() below re-renders
    // each item with its fresh status in this same pass regardless.
    const labelRects = findGeschautLabelRects();
    let changed = false;
    for (const [episodeId, chosen] of chosenByEpisodeId) {
      if (isNearAnyLabel(chosen.getBoundingClientRect(), labelRects)) {
        const existing = statusMap[episodeId];
        if (!existing || existing.status !== STATUS_WATCHED) {
          statusMap[episodeId] = { ...existing, status: STATUS_WATCHED, updatedAt: Date.now() };
          changed = true;
        }
      }
    }
    if (changed) {
      persistLocal();
      scheduleDriveSync();
    }

    for (const [episodeId, chosen] of chosenByEpisodeId) {
      applyBadge(chosen, episodeId);
    }
  }

  // Show posters (e.g. the "Vorschläge für dich" row): frame one orange
  // ("Angefangen") if we have any tracked episode for that show at all. We
  // don't know the total episode count for a show, so "fully watched" isn't
  // determined here — only whether it's been started.
  function scanSeriesPosters() {
    if (!enabled) return;
    const knownHints = new Set();
    for (const id in statusMap) {
      const hint = statusMap[id].seriesHint;
      if (hint) knownHints.add(hint);
    }

    // Collect distinct link containers first (not images directly) — a card
    // can have more than one <img alt> (poster + a small bookmark/rating
    // icon that also has alt text), and iterating images meant the icon's
    // tiny rect could overwrite the frame the poster image had just sized
    // correctly, whichever happened to be processed last.
    const links = new Set();
    for (const img of document.querySelectorAll('a img[alt]')) {
      const a = img.closest('a');
      if (a) links.add(a);
    }

    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (href.includes('/watch/')) continue; // handled by scanThumbnails

      const img = findLargestImg(a);
      const hint = img ? normalizeSeriesHint(img.alt) : '';
      let frame = a.querySelector(':scope > .usc-cr-series-frame-box');
      const matches = !!hint && knownHints.size > 0 &&
        [...knownHints].some((h) => hint.includes(h) || h.includes(hint));

      if (!matches) {
        if (frame) frame.remove();
        a.classList.remove('usc-cr-series-frame');
        continue;
      }

      a.classList.add('usc-cr-series-frame');
      const containerRect = a.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const useRect = (imgRect.width > 0 && imgRect.height > 0) ? imgRect : containerRect;
      if (!frame) {
        frame = document.createElement('div');
        frame.className = 'usc-cr-series-frame-box';
        a.appendChild(frame);
      }
      frame.style.left = (useRect.left - containerRect.left) + 'px';
      frame.style.top = (useRect.top - containerRect.top) + 'px';
      frame.style.width = useRect.width + 'px';
      frame.style.height = useRect.height + 'px';
    }
  }

  function refreshAllBadges() {
    scanThumbnails();
    scanSeriesPosters();
    updateWatchButton();
    renderResumeMarker();
  }

  // ── Main loop ─────────────────────────────────────────────────────────
  loadSettings(() => {
    refreshAllBadges();
    pullFromDriveOnce().then(refreshAllBadges);
  });

  let scanPending = false;
  function triggerScan() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      scanPending = false;
      scanThumbnails();
      scanSeriesPosters();
    });
  }

  const observer = new MutationObserver(triggerScan);
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    attachTracking();
    renderResumeMarker();
    scanSeriesPosters();
  }, 1000);
  attachTracking();
})();
