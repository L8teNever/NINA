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
    /* Episode thumbnails: same look as the show posters — the picture is
       grayed (strongly when watched, lightly when started) and a small dark
       pill sits top-left. Full color again while hovered. */
    .usc-cr-watch-frame-box {
      position: absolute;
      pointer-events: none;
      z-index: 2;
      transition: backdrop-filter .2s ease, -webkit-backdrop-filter .2s ease;
    }
    .usc-cr-watch-frame-box.usc-cr-watch-frame-started {
      -webkit-backdrop-filter: grayscale(.4) brightness(.85);
      backdrop-filter: grayscale(.4) brightness(.85);
    }
    .usc-cr-watch-frame-box.usc-cr-watch-frame-watched {
      -webkit-backdrop-filter: grayscale(.85) brightness(.6);
      backdrop-filter: grayscale(.85) brightness(.6);
    }
    html.nina-cr-nodim .usc-cr-watch-frame-box, html.nina-cr-nodim .usc-cr-series-frame-box {
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
    a:hover > .usc-cr-watch-frame-box {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    .usc-cr-watch-badge {
      position: absolute;
      z-index: 3;
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px 3px 6px;
      border-radius: 3px;
      background: rgba(0, 0, 0, .78);
      color: #fff;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .02em;
      text-transform: uppercase;
      line-height: 1.3;
      pointer-events: none;
      white-space: nowrap;
    }
    .usc-cr-watch-badge svg { width: 12px; height: 12px; flex: 0 0 auto; }
    .usc-cr-watch-badge-started svg { color: #f47521; }
    .usc-cr-watch-badge-watched svg { color: #3dd16f; }
    /* Show posters (e.g. "Vorschläge für dich") — separate class names from
       the episode frame above so the episode-frame cleanup sweep doesn't
       treat these as stale episode badges and remove them. */
    .usc-cr-series-frame {
      position: relative !important;
    }
    /* Poster marker: a small dark pill top-left (Crunchyroll's own overlay
       look) plus a thin progress bar along the bottom edge, like the bar
       Crunchyroll draws under started episodes. Orange = Crunchyroll orange. */
    .usc-cr-series-frame-box {
      position: absolute;
      pointer-events: none;
      overflow: hidden;
      z-index: 2;
    }
    .usc-cr-series-pill {
      position: absolute; top: 8px; left: 8px;
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px 3px 6px;
      background: rgba(0, 0, 0, .78);
      color: #fff;
      font: 700 11px/1.3 inherit;
      font-family: inherit;
      letter-spacing: .02em;
      text-transform: uppercase;
      border-radius: 3px;
      white-space: nowrap;
    }
    .usc-cr-series-pill svg { width: 12px; height: 12px; flex: 0 0 auto; }
    .usc-cr-series-small .usc-cr-series-pill { display: none; }
    .usc-cr-series-bar {
      position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
      background: rgba(255, 255, 255, .25);
    }
    .usc-cr-series-bar > div { height: 100%; background: #f47521; }
    .usc-cr-series-frame-watched .usc-cr-series-bar > div { background: #3dd16f; }
    /* Watched shows: poster grayed out and dimmed, so they stand back
       from the rest of the row; back to full color while hovered. */
    /* Started shows: the same, but lighter. */
    .usc-cr-series-frame-box {
      -webkit-backdrop-filter: grayscale(.4) brightness(.85);
      backdrop-filter: grayscale(.4) brightness(.85);
      transition: backdrop-filter .2s ease, -webkit-backdrop-filter .2s ease;
    }
    .usc-cr-series-frame-box.usc-cr-series-frame-watched {
      -webkit-backdrop-filter: grayscale(.85) brightness(.6);
      backdrop-filter: grayscale(.85) brightness(.6);
    }
    a:hover > .usc-cr-series-frame-box {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    .usc-cr-series-frame-watched .usc-cr-series-pill svg { color: #3dd16f; }
    .usc-cr-series-pill svg { color: #f47521; }
    /* "Neue Folge": orange tag under the status pill (own box, not dimmed). */
    .usc-cr-new-box { position: absolute; pointer-events: none; z-index: 3; }
    .usc-cr-new-pill {
      position: absolute; left: 8px; top: 8px;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 8px;
      background: #f47521; color: #000;
      font: 800 11px/1.3 inherit; font-family: inherit;
      letter-spacing: .03em; text-transform: uppercase;
      border-radius: 3px; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0, 0, 0, .45);
    }
    .usc-cr-new-pill::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%; background: #000;
      animation: usc-cr-new-pulse 1.6s ease-in-out infinite;
    }
    @keyframes usc-cr-new-pulse { 50% { opacity: .25; } }
    .usc-cr-new-box.below-pill .usc-cr-new-pill { top: 34px; }
    .usc-cr-new-box.small .usc-cr-new-pill { top: 4px; left: 4px; padding: 1px 5px; font-size: 9px; }
    /* Next to the season title: same dark tag look as Crunchyroll's own
       labels (e.g. the age rating), colored icon instead of a colored pill. */
    .usc-cr-season-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 14px;
      padding: 4px 10px 4px 8px;
      border-radius: 4px;
      background: #23252b;
      color: #fff;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
      vertical-align: middle;
      white-space: nowrap;
    }
    .usc-cr-season-badge svg { width: 14px; height: 14px; flex: 0 0 auto; }
    .usc-cr-season-badge-started svg { color: #f47521; }
    .usc-cr-season-badge-watched svg { color: #3dd16f; }
    .usc-cr-season-badge .usc-cr-season-count { color: #a0a0a0; font-weight: 600; }
    /* Player control bar: looks like Crunchyroll's own controls ("1.5x",
       subtitles …) — no colored pill, white text at the controls' dimmed
       opacity, a small colored icon, round hover background. */
    .usc-cr-watch-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 44px;
      padding: 0 12px;
      border-radius: 9999px;
      color: #fff;
      opacity: .75;
      font-family: inherit;
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
      cursor: default;
      pointer-events: none; /* display only: no hover effect, no tooltip */
    }
    .usc-cr-watch-status-badge svg { width: 20px; height: 20px; flex: 0 0 auto; }
    .usc-cr-watch-status-started svg { color: #f47521; }
    .usc-cr-watch-status-watched svg { color: #3dd16f; }
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
  // Crunchyroll switches from NINA's settings page (section "Crunchyroll"),
  // one object in chrome.storage.sync so it follows the Google account.
  const CR_OPTIONS_KEY = 'nina_cr_options';
  const CR_DEFAULTS = {
    episodeMarks: true,   // markers on episode thumbnails
    posterMarks: true,    // markers on show posters
    dimWatched: true,     // gray out watched/started pictures
    seasonCounts: true,   // "20/25" in the season dropdown
    playerStatus: true,   // status button in the player controls
    resumeMarker: true,   // furthest-point marker on the progress bar
    historySync: true,    // read Crunchyroll's watch history in the background
    seriesSync: true,     // load all seasons when opening a show page
    autoExpand: true,     // press "Mehr anzeigen" to judge long seasons
    planOnOpen: true,     // watchlist show -> AniList "Geplant" when opened
    resumePlayback: false, // continue an episode where you stopped
    // languages under show cards (see langConfig): langAudio / langSubs =
    // 'picked' | 'all' | 'off', langPickAudio / langPickSubs = chosen codes
    langShowRest: true    // "+6" for the languages not shown
  };
  let crOpt = { ...CR_DEFAULTS };
  function applyCrOptions(value) {
    crOpt = { ...CR_DEFAULTS, ...(value || {}) };
    document.documentElement.classList.toggle('nina-cr-nodim', !crOpt.dimWatched);
  }
  chrome.storage.sync.get([CR_OPTIONS_KEY], (r) => {
    applyCrOptions(r[CR_OPTIONS_KEY]);
    refreshAllBadges();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[CR_OPTIONS_KEY]) return;
    applyCrOptions(changes[CR_OPTIONS_KEY].newValue);
    refreshAllBadges();
    decorateSeasonMenu();
    scanLanguages();
  });

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
      // Loser first so metadata (title etc.) survives if only one side has it.
      merged[id] = { ...loser, ...winner, lastPosition: furthest };
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
  // Episode title/show of the episode on this page, for the overview in the
  // options page. Only filled when the id is the one being watched here.
  function pageMeta(episodeId) {
    const m = /\/watch\/([^/?#]+)/.exec(location.pathname);
    if (!m || m[1] !== episodeId) return {};
    const meta = {};
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) meta.title = h1.textContent.trim();
    const series = document.querySelector('a[href*="/series/"] h4, a[href*="/series/"]');
    if (series && series.textContent.trim()) meta.series = series.textContent.trim();
    const seriesLink = document.querySelector('a[href*="/series/"]');
    const sid = seriesLink && /\/series\/([^/?#]+)/.exec(seriesLink.getAttribute('href'));
    if (sid) meta.seriesId = sid[1];
    return meta;
  }

  function setStatus(episodeId, status) {
    if (!episodeId || !enabled) return;
    const existing = statusMap[episodeId];
    if (existing && existing.status === STATUS_WATCHED && status === STATUS_STARTED) return;
    if (existing && existing.status === status) return;
    statusMap[episodeId] = { ...existing, ...pageMeta(episodeId), status, updatedAt: Date.now() };
    persistLocal();
    scheduleDriveSync();
    refreshAllBadges();
    maybeAutoLike(episodeId, status);
  }

  // Optional (settings: "Folgen automatisch liken"): press Crunchyroll's own
  // "Gefällt mir" on the episode being watched once it's "Angefangen" or
  // "Gesehen". Only if neither like nor dislike is set yet, once per episode
  // — the button toggles, so it's never pressed a second time.
  const K_AUTOLIKE = 'nina_cr_autolike'; // 'off' | 'started' | 'watched'
  const autoLiked = new Set();
  function maybeAutoLike(episodeId, status) {
    if (episodeId !== getCurrentEpisodeId() || autoLiked.has(episodeId)) return;
    chrome.storage.sync.get([K_AUTOLIKE], (res) => {
      const mode = res[K_AUTOLIKE] || 'off';
      const want = mode === 'started' ? (status === STATUS_STARTED || status === STATUS_WATCHED)
        : mode === 'watched' ? status === STATUS_WATCHED : false;
      if (!want || autoLiked.has(episodeId)) return;
      const like = document.querySelector('button[aria-label="Gefällt mir"], button[aria-label="Like"]');
      const dislike = document.querySelector('button[aria-label="Gefällt mir nicht"], button[aria-label="Dislike"]');
      if (!like) return; // rating buttons not rendered yet; next status change retries
      autoLiked.add(episodeId);
      const applied = (b) => !!b && /is-applied/.test(b.className || '');
      if (applied(like) || applied(dislike)) return;
      like.click();
    });
  }

  let lastPositionSaveAt = 0;
  function savePosition(episodeId, position, duration, force) {
    if (!episodeId || !enabled || !isFinite(position) || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (!force && now - lastPositionSaveAt < 5000) return;
    lastPositionSaveAt = now;
    const existing = statusMap[episodeId];
    const furthest = existing && isFinite(existing.lastPosition) ? Math.max(existing.lastPosition, position) : position;
    // resumeAt = where you actually stopped (can be before the furthest point),
    // used to continue there when the episode is opened again.
    if (existing && furthest === existing.lastPosition && existing.duration === duration && existing.title &&
        isFinite(existing.resumeAt) && Math.abs(existing.resumeAt - position) < 2) return;
    statusMap[episodeId] = { ...existing, ...pageMeta(episodeId), lastPosition: furthest, resumeAt: position, duration, updatedAt: Date.now() };
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
    tryResume(video, episodeId);
    onTimeUpdate();
    updateWatchButton();
    renderResumeMarker();
  }

  // Settings "Dort weiterschauen, wo du aufgehört hast": jump to the saved
  // stop point when an episode is opened again. Not for finished episodes
  // (past the "Gesehen" threshold or in the last 30 s), not if the player
  // already resumed there itself, once per episode load. Checked again a
  // moment after playback starts, since the player can reset the time.
  const resumedFor = new Set();
  function tryResume(video, episodeId) {
    if (!crOpt.resumePlayback || resumedFor.has(episodeId)) return;
    const entry = statusMap[episodeId];
    const at = entry && entry.resumeAt;
    if (!isFinite(at) || at < 15) return;
    resumedFor.add(episodeId);
    let tries = 0;
    const apply = () => {
      if (getCurrentEpisodeId() !== episodeId || !isFinite(video.duration) || video.duration <= 0) return;
      if (at > video.duration - 30 || (at / video.duration) * 100 >= watchedThreshold) return;
      if (video.currentTime >= at - 5) return; // already there
      video.currentTime = at;
      tries++;
    };
    const onReady = () => {
      apply();
      setTimeout(() => { if (tries < 2) apply(); }, 1500);
    };
    if (video.readyState >= 1) onReady();
    else video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('playing', () => setTimeout(() => { if (tries < 2) apply(); }, 800), { once: true });
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
    if (!crOpt.resumeMarker) { removeResumeMarker(); return; }
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

    if (!enabled || !entry || !entry.status || !crOpt.playerStatus) {
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
    const cls = 'usc-cr-watch-status-badge usc-cr-watch-status-' + entry.status;
    if (btn.className !== cls) {
      btn.className = cls;
      btn.title = 'NINA: ' + (LABELS[entry.status] || '');
      btn.innerHTML = entry.status === STATUS_WATCHED ? CHECK_SVG : PLAY_SVG;
      btn.appendChild(document.createTextNode(LABELS[entry.status] || ''));
    }
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

    // status null = un-marked again (kept as an entry so the removal syncs).
    if (!entry || !entry.status || !crOpt.episodeMarks) {
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
    badge.style.left = (left + 8) + 'px';
    badge.style.top = (top + 8) + 'px';
    const badgeCls = 'usc-cr-watch-badge usc-cr-watch-badge-' + entry.status;
    if (badge.className !== badgeCls) {
      badge.className = badgeCls;
      badge.innerHTML = entry.status === STATUS_WATCHED ? CHECK_SVG : PLAY_SVG;
      badge.appendChild(document.createTextNode(LABELS[entry.status] || ''));
    }
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
    queueMicrotask(scanNewEpisodeBadges); // after the status pills below are placed
    if (!enabled) return;
    if (!crOpt.posterMarks) {
      for (const f of document.querySelectorAll('.usc-cr-series-frame-box')) f.remove();
      for (const a of document.querySelectorAll('.usc-cr-series-frame')) a.classList.remove('usc-cr-series-frame');
      return;
    }
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
    const seasonStatus = seriesSeasonStatus();
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
      // Seasons give an exact match by series id; the alt-text hint is the
      // fallback for shows whose page hasn't been opened yet.
      const seriesId = (/\/series\/([^/?#]+)/.exec(href) || [])[1];
      // NINA's own season data wins; then the imported AniList list; then
      // just "some episode of this show was tracked" (no progress known).
      const info = (seriesId ? seasonStatus.get(seriesId) : undefined) || anilistStatusFor(hint) ||
        ((!!hint && knownHints.size > 0 && [...knownHints].some((h) => hint.includes(h) || h.includes(hint)))
          ? { status: STATUS_STARTED, frac: null } : undefined);

      // Only real posters (portrait): not the title logo in the big hero
      // carousel or wide feed banners, which link to the show too.
      // Any show picture counts (portrait posters, the wide cards in search
      // and the A–Z browse list, small list thumbnails) — except the title
      // logo in the big hero carousel and wide feed banners.
      const imgBox = img && img.getBoundingClientRect();
      const inHeroOrBanner = !!a.closest('[class*="hero-card"], [class*="hero-carousel"], [class*="feed-banner"]');
      const isPoster = !!imgBox && !inHeroOrBanner && imgBox.width >= 40 && imgBox.height >= 40 && imgBox.width <= 700;
      if (!info || !isPoster) {
        // A collapsed hover copy (height 0) keeps its marker until it opens.
        if (!info || (imgBox && imgBox.height > 0)) {
          if (frame) frame.remove();
          a.classList.remove('usc-cr-series-frame');
        }
        continue;
      }
      const bySeason = info.status;

      a.classList.add('usc-cr-series-frame');
      const containerRect = a.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const useRect = (imgRect.width > 0 && imgRect.height > 0) ? imgRect : containerRect;
      if (!frame) {
        frame = document.createElement('div');
        a.appendChild(frame);
      }
      // Green once every known season of the show is watched.
      // Small list thumbnails (search 'Serien' list): no text badge, just gray + bar.
      const frameCls = 'usc-cr-series-frame-box' + (bySeason === STATUS_WATCHED ? ' usc-cr-series-frame-watched' : '') +
        (useRect.width < 130 ? ' usc-cr-series-small' : '');
      if (frame.className !== frameCls) frame.className = frameCls;
      renderSeriesMarker(frame, bySeason, info.frac);
      frame.style.left = (useRect.left - containerRect.left) + 'px';
      frame.style.top = (useRect.top - containerRect.top) + 'px';
      frame.style.width = useRect.width + 'px';
      frame.style.height = useRect.height + 'px';
    }
  }

  // ── AniList import ────────────────────────────────────────────────────
  // The list imported in the options page (lib/anilist-bg.js importList)
  // frames show posters by title: completed = green, being watched = orange.
  const ANILIST_LIST_KEY = 'nina_anilist_list';
  let anilistTitles = []; // [{ norm, status }]
  function loadAnilistList(value) {
    const entries = (value && value.entries) || [];
    anilistTitles = [];
    for (const e of entries) {
      if (e.status === 'PLANNING') continue;
      const status = e.status === 'COMPLETED' ? STATUS_WATCHED : STATUS_STARTED;
      const frac = e.status === 'COMPLETED' ? 1 : (e.episodes ? Math.min(1, (e.progress || 0) / e.episodes) : null);
      for (const t of e.titles || []) {
        const norm = normalizeSeriesHint(t);
        if (norm.length >= 4) anilistTitles.push({ norm, status, frac });
      }
    }
  }
  // { status, frac } for a poster's alt text; a started season beats a
  // completed one when a title matches several AniList entries.
  function anilistStatusFor(hint) {
    if (!hint || !anilistTitles.length) return undefined;
    let found;
    for (const t of anilistTitles) {
      if (hint === t.norm || hint.startsWith(t.norm + ' ') || t.norm.startsWith(hint + ' ')) {
        if (t.status === STATUS_STARTED) return { status: t.status, frac: t.frac };
        found = { status: t.status, frac: t.frac };
      }
    }
    return found;
  }
  // ── "Neue Folge" on posters ───────────────────────────────────────────
  // AniList's airing notifications (nina_anilist_notifs, fetched by the
  // background) put an orange "Neue Folge 12" tag on that show's posters —
  // only for shows whose news bell is on. Setting newEpBadge decides when it
  // goes away: 'watched' = AniList progress reached the episode, 'visited' =
  // the show's page was opened once since, false = never shown.
  const NEW_SEEN_KEY = 'nina_cr_new_seen'; // sync: { mediaId: last time the show page was opened }
  var newSrc = {};
  var newEp = { mode: 'off', list: [], bySeries: new Map(), byTitle: [] };
  const nrmU = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  function rebuildNewEpisodes() {
    const s = newSrc;
    const mode = crOpt.newEpBadge === false ? 'off' : (crOpt.newEpBadge || 'watched');
    const items = ((s.notifs && s.notifs.items) || [])
      .filter((n) => n.type === 'AIRING' && n.episode && Date.now() - n.createdAt < 21 * 864e5);
    // same bell rules as the new tab page and the desktop notifications
    const matches = (map, n) => Object.entries(map || {}).some(([id, m]) => Number(id) === n.mediaId ||
      (m && m.key && m.key.length >= 6 && [nrmU(n.title), nrmU(n.titleEn)].some((t) => t && (t === m.key || t.startsWith(m.key + ' ')))));
    const muted = (n) => (s.notifDefault === 'off' ? !matches(s.notifEnabled, n) : matches(s.notifMuted, n));
    const latest = new Map();
    for (const n of items) {
      if (muted(n)) continue;
      const local = (s.progress || {})[n.mediaId];
      const prog = Math.max(n.progress == null ? -1 : n.progress, local == null ? -1 : local);
      if (prog >= n.episode) continue;
      const cur = latest.get(n.mediaId);
      if (!cur || n.episode > cur.episode) latest.set(n.mediaId, n);
    }
    const list = [...latest.values()];
    const bySeries = new Map(), byTitle = [];
    for (const n of list) {
      for (const [key, link] of Object.entries(s.map || {})) {
        if (link && link.id === n.mediaId) bySeries.set(key.split('|')[0], n);
      }
      for (const t of [n.title, n.titleEn]) {
        const norm = normalizeSeriesHint(t);
        if (norm.length >= 4) byTitle.push({ norm, n });
      }
    }
    newEp = { mode, list, bySeries, byTitle };
  }

  function newEpisodeFor(href, altText) {
    const m = /\/series\/([^/?#]+)(?:\/([^/?#]+))?/.exec(href || '');
    if (m && newEp.bySeries.has(m[1])) return newEp.bySeries.get(m[1]);
    const hints = [normalizeSeriesHint(altText), m && m[2] ? normalizeSeriesHint(m[2].replace(/-/g, ' ')) : '']
      .filter((h) => h.length >= 4);
    for (const h of hints) {
      for (const t of newEp.byTitle) {
        if (h === t.norm || h.startsWith(t.norm + ' ') || t.norm.startsWith(h + ' ')) return t.n;
      }
    }
    return null;
  }
  const newEpHidden = (n) => newEp.mode === 'off' || (newEp.mode === 'visited' && ((newSrc.seen || {})[n.mediaId] || 0) >= n.createdAt);

  // Opening the show (its page or an episode of it) counts as "visited".
  function markShowVisited() {
    let href = '';
    if (/\/series\//.test(location.pathname)) href = location.pathname;
    else if (location.pathname.includes('/watch/')) {
      const link = document.querySelector('a[href*="/series/"]');
      href = link ? link.getAttribute('href') : '';
    }
    if (!href || !newEp.list.length) return;
    const n = newEpisodeFor(href, document.querySelector('h1') ? document.querySelector('h1').textContent : '');
    if (!n) return;
    const seen = newSrc.seen || {};
    if ((seen[n.mediaId] || 0) >= n.createdAt) return;
    seen[n.mediaId] = Date.now();
    // synced storage is small: forget visits older than the 21-day window
    for (const id in seen) if (Date.now() - seen[id] > 30 * 864e5) delete seen[id];
    newSrc.seen = seen;
    chrome.storage.sync.set({ [NEW_SEEN_KEY]: seen });
  }

  function scanNewEpisodeBadges() {
    markShowVisited();
    const keep = new Set();
    if (newEp.mode !== 'off' && newEp.list.length) {
      const links = new Set();
      for (const img of document.querySelectorAll('a[href*="/series/"] img[alt]')) {
        const a = img.closest('a');
        if (a) links.add(a);
      }
      for (const a of links) {
        const img = findLargestImg(a);
        const n = newEpisodeFor(a.getAttribute('href'), img ? img.alt : '');
        if (!n || newEpHidden(n) || !img) continue;
        const r = img.getBoundingClientRect();
        if (a.closest('[class*="hero-card"], [class*="hero-carousel"], [class*="feed-banner"]')) continue;
        if (r.width < 40 || r.height < 40 || r.width > 700) continue;
        let box = a.querySelector(':scope > .usc-cr-new-box');
        if (!box) {
          box = document.createElement('div');
          const pill = document.createElement('span');
          pill.className = 'usc-cr-new-pill';
          box.appendChild(pill);
          a.appendChild(box);
        }
        a.classList.add('usc-cr-series-frame'); // position: relative
        const cls = 'usc-cr-new-box' + (r.width < 130 ? ' small' : '') +
          (a.querySelector(':scope > .usc-cr-series-frame-box:not(.usc-cr-series-small)') ? ' below-pill' : '');
        if (box.className !== cls) box.className = cls;
        const text = r.width < 130 ? 'Neu' : 'Neue Folge ' + n.episode;
        if (box.firstChild.textContent !== text) box.firstChild.textContent = text;
        box.title = n.title + ': Folge ' + n.episode + ' ist erschienen';
        const ar = a.getBoundingClientRect();
        box.style.left = (r.left - ar.left) + 'px';
        box.style.top = (r.top - ar.top) + 'px';
        box.style.width = r.width + 'px';
        box.style.height = r.height + 'px';
        keep.add(box);
      }
    }
    for (const b of document.querySelectorAll('.usc-cr-new-box')) if (!keep.has(b)) b.remove();
  }

  const NEW_LOCAL_KEYS = ['nina_anilist_notifs', 'nina_anilist_map', 'nina_anilist_progress'];
  const NEW_SYNC_KEYS = ['nina_notif_default', 'nina_notif_muted', 'nina_notif_enabled', NEW_SEEN_KEY];
  function loadNewEpisodes() {
    chrome.storage.local.get(NEW_LOCAL_KEYS, (l) => {
      chrome.storage.sync.get(NEW_SYNC_KEYS, (sy) => {
        newSrc = {
          notifs: l.nina_anilist_notifs, map: l.nina_anilist_map, progress: l.nina_anilist_progress, seen: sy[NEW_SEEN_KEY],
          notifDefault: sy.nina_notif_default, notifMuted: sy.nina_notif_muted, notifEnabled: sy.nina_notif_enabled
        };
        rebuildNewEpisodes();
        scanNewEpisodeBadges();
      });
    });
  }
  loadNewEpisodes();
  chrome.storage.onChanged.addListener((changes, area) => {
    const keys = area === 'local' ? NEW_LOCAL_KEYS : area === 'sync' ? [...NEW_SYNC_KEYS, CR_OPTIONS_KEY] : [];
    if (keys.some((k) => changes[k])) loadNewEpisodes();
  });
  // Notifications older than 10 minutes: ask the background for fresh ones.
  chrome.storage.local.get(['nina_anilist_notifs'], (r) => {
    const st = r.nina_anilist_notifs;
    if (!st || !st.fetchedAt || Date.now() - st.fetchedAt > 10 * 60 * 1000) {
      try { chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op: 'notifications', data: {} }, () => void chrome.runtime.lastError); } catch (_) {}
    }
  });

  chrome.storage.local.get([ANILIST_LIST_KEY], (res) => { loadAnilistList(res[ANILIST_LIST_KEY]); scanSeriesPosters(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[ANILIST_LIST_KEY]) { loadAnilistList(changes[ANILIST_LIST_KEY].newValue); scanSeriesPosters(); }
  });

  // Lets anilist-crunchyroll.js (same page, same isolated world) mark
  // episodes as watched from AniList progress, through the normal
  // persist + Drive-sync path. Only ever upgrades, never un-marks.
  window.__ninaCrMarkWatched = (episodeIds) => {
    if (!enabled) return 0;
    let n = 0;
    for (const id of episodeIds) {
      const existing = statusMap[id];
      if (existing && existing.status === STATUS_WATCHED) continue;
      statusMap[id] = { ...existing, status: STATUS_WATCHED, fromAnilist: true, updatedAt: Date.now() };
      n++;
    }
    if (n) {
      persistLocal();
      scheduleDriveSync();
      refreshAllBadges();
    }
    return n;
  };

  // Undo marks that only came from AniList (e.g. after a wrong automatic
  // link was corrected). Episodes NINA tracked itself are never touched.
  window.__ninaCrUnmarkFromAnilist = (episodeIds) => {
    let n = 0;
    for (const id of episodeIds) {
      const existing = statusMap[id];
      if (!existing || !existing.fromAnilist || existing.status !== STATUS_WATCHED) continue;
      statusMap[id] = { ...existing, status: null, fromAnilist: false, updatedAt: Date.now() };
      n++;
    }
    if (n) {
      persistLocal();
      scheduleDriveSync();
      refreshAllBadges();
    }
    return n;
  };

  // ── Whole seasons ─────────────────────────────────────────────────────
  // On a show's page Crunchyroll lists every episode of the selected season
  // (.erc-season-episode-list) and puts the season's id on the season title
  // (<h4 currentseasonid="GS…">). When every listed episode is watched, the
  // season is stored as watched under "season:<id>" in the same map, so it
  // syncs through Drive like episodes do. New episodes of a running season
  // turn it back into "started".
  const SEASON_PREFIX = 'season:';
  let seasonScanSig = '';
  let seasonScanSince = 0;
  const autoExpanded = new Set(); // "<season>|<loaded count>" already expanded once
  const isSeasonKey = (k) => k.startsWith(SEASON_PREFIX);

  function seriesTitleFromPage() {
    const h1 = document.querySelector('h1');
    const t = (h1 && h1.textContent.trim()) || '';
    if (t) return t;
    return document.title.replace(/\s*-\s*Crunchyroll\s*$/i, '').replace(/\s+auf Deutsch\s*$/i, '').trim();
  }

  function scanSeasonCompletion() {
    if (!enabled || !location.pathname.includes('/series/')) return;
    // Single-season shows carry the season id on <h4 currentseasonid>;
    // multi-season shows only have a dropdown (.erc-seasons-select) with the
    // season's title, so that one is keyed by show id + title instead.
    const h4 = document.querySelector('[currentseasonid]');
    const dropdown = document.querySelector('.erc-seasons-select');
    const dropdownTitle = dropdown && dropdown.querySelector('.season-info span');
    const titleEl = h4 || (dropdownTitle ? dropdown : null);
    const list = document.querySelector('.erc-season-episode-list');
    if (!titleEl || !list) return;
    const seriesId = (h4 && h4.getAttribute('seriesid')) || (/\/series\/([^/?#]+)/.exec(location.pathname) || [])[1];
    const seasonTitleText = h4 ? (h4.getAttribute('seasontitle') || h4.textContent.trim()) : dropdownTitle.textContent.trim();
    // Keyed by show + season title for every show (same key the API sync
    // and the season dropdown use).
    const seasonId = seriesId && seasonTitleText ? seriesId + '|' + seasonTitleText.trim().toLowerCase() : null;
    if (!seasonId) return;

    const ids = new Set();
    for (const a of list.querySelectorAll('a[href*="/watch/"]')) {
      const id = extractEpisodeId(a.getAttribute('href'));
      if (id) ids.add(id);
    }
    if (!ids.size) return;
    // A paged list ("Mehr anzeigen") isn't the whole season yet.
    const container = list.parentElement || list;
    const moreBtn = [...container.querySelectorAll('button, [role="button"]')]
      .find((b) => /mehr anzeigen|show more|weitere/i.test(b.textContent || ''));

    let watched = 0, touched = 0;
    for (const id of ids) {
      const s = statusMap[id] && statusMap[id].status;
      if (s === STATUS_WATCHED) watched++;
      if (s) touched++;
    }
    // Everything loaded so far is watched but the list is paged: load the
    // rest once (Crunchyroll's own "Mehr anzeigen"), so the season can be
    // judged as a whole instead of staying "angefangen" forever.
    if (moreBtn && watched === ids.size && !autoExpanded.has(seasonId + '|' + ids.size)) {
      autoExpanded.add(seasonId + '|' + ids.size);
      if (crOpt.autoExpand) moreBtn.click();
      return; // re-evaluated once the next page of episodes is in
    }
    const status = (!moreBtn && watched === ids.size) ? STATUS_WATCHED : (touched ? STATUS_STARTED : null);

    // Switching seasons in the dropdown updates the title a moment before
    // the episode list, so the old season's (watched) episodes briefly sit
    // under the new title. Only trust a title + list combination that has
    // stayed the same for a while.
    const sig = seasonId + '#' + [...ids].join(',');
    if (seasonScanSig !== sig) {
      seasonScanSig = sig;
      seasonScanSince = Date.now();
    }
    const stable = Date.now() - seasonScanSince >= 1500;

    const key = SEASON_PREFIX + seasonId;
    const existing = statusMap[key];
    // An untouched season is still recorded (status null) once the show has
    // other tracked seasons: then the poster knows the show isn't complete.
    const showTracked = !status && !existing && Object.keys(statusMap).some((k) =>
      isSeasonKey(k) && statusMap[k] && statusMap[k].seriesId === seriesId && statusMap[k].status);
    const changed = !existing ? (!!status || showTracked)
      : existing.status !== status || (status && (existing.episodes !== ids.size || existing.watchedEpisodes !== watched));
    if (stable && changed) {
      // status null = nothing of this season watched (any older, wrong
      // "watched" for it is taken back, and the removal syncs too).
      statusMap[key] = {
        ...existing,
        type: 'season',
        status,
        seriesId,
        series: seriesTitleFromPage(),
        seasonTitle: seasonTitleText,
        episodes: ids.size,
        watchedEpisodes: watched,
        updatedAt: Date.now()
      };
      persistLocal();
      scheduleDriveSync();
    }

    // No badge next to the season title: the AniList bar and the episode
    // markers already show it. (Remove one left over from older versions.)
    const oldBadge = document.querySelector('.usc-cr-season-badge');
    if (oldBadge) oldBadge.remove();
  }

  // All seasons of a show at once (via content/cr-api-main.js in the page,
  // which reads Crunchyroll's own season/episode lists and "watched" flags):
  // every season gets its entry with watched/total, and episodes Crunchyroll
  // counts as fully watched are marked "Gesehen" in NINA too — the same
  // thing the "Geschaut" label detection does, just for all seasons.
  const apiSynced = new Map(); // seriesId -> timestamp of last sync
  let apiReq = 0;
  function apiCall(op, data, timeoutMs) {
    return new Promise((resolve) => {
      const reqId = 'nina-' + (++apiReq) + '-' + Date.now();
      const onMsg = (e) => {
        if (e.source !== window || !e.data || e.data.__ninaCrApiRes !== reqId) return;
        window.removeEventListener('message', onMsg);
        resolve(e.data.ok ? e.data : null);
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ ...data, __ninaCrApiReq: op, reqId }, location.origin);
      setTimeout(() => { window.removeEventListener('message', onMsg); resolve(null); }, timeoutMs || 60000);
    });
  }

  // Writes one entry per season ("season:<show>|<season title>") from the
  // API's season/episode lists, and marks episodes Crunchyroll counts as
  // fully watched. Returns whether anything changed.
  function applySeriesSeasons(seriesId, seriesTitle, seasons) {
    const now = Date.now();
    let changed = false;
    const showTouched = seasons.some((s) => s.episodes.some((ep) => ep.fw || (statusMap[ep.id] && statusMap[ep.id].status)));
    for (const s of seasons) {
      let watched = 0;
      for (const ep of s.episodes) {
        const existing = statusMap[ep.id];
        if (ep.fw && (!existing || existing.status !== STATUS_WATCHED)) {
          statusMap[ep.id] = { ...existing, status: STATUS_WATCHED, seriesId, series: (existing && existing.series) || seriesTitle, updatedAt: now };
          changed = true;
        }
        if (statusMap[ep.id] && statusMap[ep.id].status === STATUS_WATCHED) watched++;
      }
      const total = s.episodes.length;
      if (!total) continue;
      const touched = s.episodes.some((ep) => statusMap[ep.id] && statusMap[ep.id].status);
      const status = watched === total ? STATUS_WATCHED : (touched ? STATUS_STARTED : null);
      const key = SEASON_PREFIX + seriesId + '|' + String(s.title || '').trim().toLowerCase();
      const old = statusMap[key];
      // Untouched seasons are only recorded for shows you've watched
      // something of (so the show isn't shown as complete); unwatched shows
      // you merely opened leave no entries behind.
      if (!old && !status && !showTouched) continue;
      if (!old || old.status !== status || old.episodes !== total || old.watchedEpisodes !== watched) {
        statusMap[key] = {
          ...old, type: 'season', status, seriesId, series: seriesTitle,
          seasonTitle: s.title, episodes: total, watchedEpisodes: watched, updatedAt: now
        };
        changed = true;
      }
    }
    // Older versions keyed single-season shows by Crunchyroll's season id;
    // retire those so the show isn't counted twice.
    for (const k in statusMap) {
      if (isSeasonKey(k) && !k.includes('|') && statusMap[k].seriesId === seriesId && statusMap[k].status) {
        statusMap[k] = { ...statusMap[k], status: null, updatedAt: now };
        changed = true;
      }
    }
    return changed;
  }

  async function syncSeriesFromApi() {
    if (!enabled || !crOpt.seriesSync) return;
    const m = /\/series\/([^/?#]+)/.exec(location.pathname);
    if (!m) return;
    const seriesId = m[1];
    const last = apiSynced.get(seriesId);
    if (last && Date.now() - last < 5 * 60 * 1000) return; // at most every 5 min per show
    apiSynced.set(seriesId, Date.now());
    const res = await apiCall('seriesProgress', { seriesId });
    if (!res || !res.seasons || !res.seasons.length) { apiSynced.delete(seriesId); return; }
    if (applySeriesSeasons(seriesId, seriesTitleFromPage(), res.seasons)) {
      persistLocal();
      scheduleDriveSync();
      refreshAllBadges();
    }
    decorateSeasonMenu();
  }

  // ── Whole watch history, in the background ────────────────────────────
  // So posters everywhere show "Gesehen"/"Angefangen" without opening each
  // show: Crunchyroll's watch history (every 6 h) marks played episodes, and
  // every show in it then gets its seasons checked once (refreshed every 3
  // days), one show at a time while a Crunchyroll tab is visible.
  const HISTORY_KEY = 'nina_cr_history_sync'; // { at, series: { id: { at, title } } }
  const HISTORY_EVERY = 6 * 60 * 60 * 1000;
  const SERIES_EVERY = 3 * 24 * 60 * 60 * 1000;
  let historyBusy = false;

  async function syncWatchHistory() {
    if (!enabled || !crOpt.historySync || historyBusy || document.hidden) return;
    historyBusy = true;
    try {
      const state = (await new Promise((r) => chrome.storage.local.get([HISTORY_KEY], r)))[HISTORY_KEY] || { at: 0, series: {} };
      state.series = state.series || {};

      if (Date.now() - (state.at || 0) > HISTORY_EVERY) {
        const res = await apiCall('watchHistory', { maxPages: 30 }, 120000);
        if (res && res.items) {
          const now = Date.now();
          let changed = false;
          for (const it of res.items) {
            if (!it.id || !it.s) continue;
            if (!state.series[it.s]) state.series[it.s] = { at: 0, title: it.st };
            const existing = statusMap[it.id];
            const status = it.fw ? STATUS_WATCHED : (it.ph > 0 ? STATUS_STARTED : null);
            if (!status) continue;
            if (existing && (existing.status === STATUS_WATCHED || existing.status === status)) continue;
            statusMap[it.id] = {
              ...existing,
              status,
              seriesId: it.s,
              series: (existing && existing.series) || it.st,
              title: (existing && existing.title) || (it.n ? 'E' + it.n + ' - ' : '') + (it.t || ''),
              updatedAt: now
            };
            changed = true;
          }
          state.at = now;
          if (changed) { persistLocal(); scheduleDriveSync(); refreshAllBadges(); }
          await new Promise((r) => chrome.storage.local.set({ [HISTORY_KEY]: state }, r));
        }
      }

      // One show per run: its seasons, so the poster knows complete vs. started.
      const due = Object.keys(state.series).find((id) => Date.now() - (state.series[id].at || 0) > SERIES_EVERY);
      if (due) {
        const res = await apiCall('seriesProgress', { seriesId: due });
        state.series[due].at = Date.now();
        if (res && res.seasons && res.seasons.length) {
          if (applySeriesSeasons(due, state.series[due].title || '', res.seasons)) {
            persistLocal();
            scheduleDriveSync();
            scanSeriesPosters();
          }
        }
        await new Promise((r) => chrome.storage.local.set({ [HISTORY_KEY]: state }, r));
      }
    } catch (_) {
    } finally {
      historyBusy = false;
    }
  }

  // ── Crunchyroll watchlist ─────────────────────────────────────────────
  //  • "Geplant" on AniList for watchlist shows: started once by hand with
  //    the button in NINA's settings (bulk run with progress), afterwards
  //    live — a show added to the watchlist is planned right away. Only
  //    seasons with nothing watched and no AniList status at all.
  //  • a completely watched show is taken off the watchlist (checked when
  //    the watchlist is refreshed).
  const WATCHLIST_KEY = 'nina_cr_watchlist_sync';
  // { at, items, known: {id:1}, queue: [ids], planned: {id: at}, removed: {id: at},
  //   bulk: { total, done, running, current, finishedAt } }
  const BULK_REQUEST_KEY = 'nina_cr_watchlist_bulk_request'; // set by the options page
  const K_PLAN = 'nina_anilist_plan_watchlist';
  const K_CLEANUP = 'nina_cr_watchlist_cleanup';
  const WATCHLIST_EVERY = 6 * 60 * 60 * 1000;
  let watchlistBusy = false;
  let watchlistForce = false;
  let lastPlanAt = 0;
  let lastUrgentId = null;

  const syncGet = (keys) => new Promise((r) => chrome.storage.sync.get(keys, r));
  const anilist = (op, data) => new Promise((r) => {
    try {
      chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op, data }, (res) => r(chrome.runtime.lastError ? null : res));
    } catch (_) { r(null); }
  });

  // Crunchyroll's own "add to watchlist" (seen by cr-api-main.js): refresh now.
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__ninaCrWatchlistChanged) watchlistForce = true;
  });

  async function planShow(it) {
    const res = await apiCall('seriesProgress', { seriesId: it.s });
    if (!res || !res.seasons) return false;
    if (applySeriesSeasons(it.s, it.st || '', res.seasons)) { persistLocal(); scheduleDriveSync(); }
    for (const s of res.seasons) {
      if (!s.episodes.length) continue;
      // Anything watched in this season -> the normal progress sync owns it.
      if (s.episodes.some((ep) => ep.fw || (statusMap[ep.id] && statusMap[ep.id].status))) continue;
      const nums = s.episodes.map((ep) => ep.n).filter((n) => typeof n === 'number' && n > 0);
      const r = await anilist('planSeason', {
        key: it.s + '|' + String(s.title || '').trim().toLowerCase(),
        seriesTitle: it.st || '',
        seasonTitle: s.title || '',
        episodeCount: s.episodes.length,
        firstEpisode: nums.length ? Math.min(...nums) : undefined,
        altTitle: (it.slug || '').replace(/-+/g, ' ').trim()
      });
      if (!r || !r.ok) return false; // e.g. AniList rate limit: retry later
      await new Promise((w) => setTimeout(w, 4000));
    }
    return true;
  }

  async function syncWatchlist() {
    if (!enabled || watchlistBusy) return;
    watchlistBusy = true;
    try {
      const settings = await syncGet([K_PLAN, K_CLEANUP]);
      const plan = settings[K_PLAN] !== false;
      const cleanup = settings[K_CLEANUP] !== false;
      const local = await new Promise((r) => chrome.storage.local.get([WATCHLIST_KEY, BULK_REQUEST_KEY], r));
      const state = local[WATCHLIST_KEY] || {};
      state.items = state.items || [];
      state.known = state.known || null;
      state.queue = state.queue || [];
      state.planned = state.planned || {};
      state.removed = state.removed || {};
      const save = () => new Promise((r) => chrome.storage.local.set({ [WATCHLIST_KEY]: state }, r));
      const bulkRequested = local[BULK_REQUEST_KEY] && (!state.bulk || local[BULK_REQUEST_KEY] > (state.bulk.requestedAt || 0));
      if (!plan && !cleanup && !bulkRequested) return;
      if (document.hidden && !bulkRequested && !(state.bulk && state.bulk.running)) return;

      if (watchlistForce || bulkRequested || Date.now() - (state.at || 0) > WATCHLIST_EVERY) {
        watchlistForce = false;
        const res = await apiCall('watchlist', {}, 60000);
        if (!res || !res.items) return;
        state.items = res.items;
        state.at = Date.now();

        // Live: shows that are new on the watchlist since last time.
        const ids = state.items.map((it) => it.s);
        if (state.known && plan) {
          for (const id of ids) if (!state.known[id] && !state.planned[id] && !state.queue.includes(id)) state.queue.push(id);
        }
        state.known = Object.fromEntries(ids.map((id) => [id, 1]));

        // Finished shows off the watchlist.
        if (cleanup) {
          const bySeries = seriesSeasonStatus();
          for (const it of state.items) {
            const nina = bySeries.get(it.s);
            const done = it.fw || (nina && nina.status === STATUS_WATCHED && nina.frac === 1);
            // Still airing (newest episode < 30 days old): being caught up
            // isn't "finished" — keep it on the watchlist.
            const airing = it.aired && Date.now() - it.aired < 30 * 24 * 60 * 60 * 1000;
            if (!done || airing || state.removed[it.s]) continue;
            const r = await apiCall('watchlistRemove', { seriesId: it.s }, 30000);
            if (r) state.removed[it.s] = Date.now();
          }
          state.items = state.items.filter((it) => !state.removed[it.s]);
        }

        // Button in the settings: queue every show on the watchlist.
        if (bulkRequested) {
          const todo = state.items.filter((it) => !it.fw && !state.planned[it.s]).map((it) => it.s);
          for (const id of todo) if (!state.queue.includes(id)) state.queue.push(id);
          state.bulk = { requestedAt: local[BULK_REQUEST_KEY], total: todo.length, done: 0, running: true, current: '' };
        }
        await save();
      }

      // Opening a show's page: if it's on the watchlist and not planned yet,
      // it goes first in line and runs right away (no waiting for a bulk run).
      const page = /\/series\/([^/?#]+)/.exec(location.pathname);
      let urgent = false;
      if (plan && crOpt.planOnOpen && page && !state.planned[page[1]] && state.items.some((x) => x.s === page[1] && !x.fw)) {
        state.queue = [page[1], ...state.queue.filter((x) => x !== page[1])];
        // Skip the wait only on the first try for this show (no hammering
        // AniList if it fails, e.g. rate limit).
        urgent = lastUrgentId !== page[1];
        lastUrgentId = page[1];
      }

      // Work the queue: one show per step.
      if (!state.queue.length) {
        if (state.bulk && state.bulk.running) { state.bulk.running = false; state.bulk.finishedAt = Date.now(); await save(); }
        return;
      }
      if (!urgent && Date.now() - lastPlanAt < 10000) return;
      lastPlanAt = Date.now();
      const status = await anilist('status');
      if (!status || !status.ok || !status.result.connected) return;

      const id = state.queue[0];
      const it = state.items.find((x) => x.s === id) || { s: id };
      if (state.bulk && state.bulk.running) { state.bulk.current = it.st || id; await save(); }
      if (await planShow(it)) {
        state.planned[id] = Date.now();
        state.queue.shift();
        if (state.bulk && state.bulk.running) state.bulk.done++;
        await save();
      }
    } catch (_) {
    } finally {
      watchlistBusy = false;
    }
  }

  // ── Languages on show cards ───────────────────────────────────────────
  // Crunchyroll only writes "Untertitel | Synchro" under each show. Replace
  // it (original kept, just hidden) with the actual languages:
  //   Synchro: DE, JA, EN +6
  //   Untertitel: DE, EN +12
  // 'short' = German/Japanese/English first plus a count, 'all' = every
  // language; the full list is always in the tooltip. Fetched in batches
  // from Crunchyroll and cached for a week.
  const LANG_CACHE_KEY = 'nina_cr_lang_cache';
  const LANG_TTL = 7 * 24 * 60 * 60 * 1000;
  const LANG_META_RE = /^(Untertitel|Synchro|Subtitled|Dubbed)(\s*\|\s*(Untertitel|Synchro|Subtitled|Dubbed))?$/;
  const LANG_NAMES = {
    'de-DE': 'Deutsch', 'ja-JP': 'Japanisch', 'en-US': 'Englisch', 'en-IN': 'Englisch (Indien)', 'fr-FR': 'Französisch',
    'es-ES': 'Spanisch (Spanien)', 'es-419': 'Spanisch (Lateinamerika)', 'it-IT': 'Italienisch', 'pt-BR': 'Portugiesisch (Brasilien)',
    'pt-PT': 'Portugiesisch', 'ru-RU': 'Russisch', 'ar-SA': 'Arabisch', 'pl-PL': 'Polnisch', 'hi-IN': 'Hindi', 'ta-IN': 'Tamil',
    'te-IN': 'Telugu', 'ko-KR': 'Koreanisch', 'zh-CN': 'Chinesisch', 'zh-HK': 'Chinesisch (Hongkong)', 'zh-TW': 'Chinesisch (Taiwan)',
    'th-TH': 'Thai', 'vi-VN': 'Vietnamesisch', 'id-ID': 'Indonesisch', 'ms-MY': 'Malaiisch', 'tr-TR': 'Türkisch'
  };
  let langCache = null;
  const langPending = new Set();
  let langBusy = false;

  const langCode = (l) => ({ 'es-419': 'ES-LA', 'pt-BR': 'PT-BR', 'zh-HK': 'ZH-HK', 'zh-TW': 'ZH-TW', 'en-IN': 'EN-IN' }[l] || String(l).split('-')[0].toUpperCase());
  // Synchro and Untertitel are configured separately in the settings:
  // 'picked' (only your chosen languages), 'all', or 'off'.
  const DEFAULT_PICK = { a: ['de-DE', 'ja-JP', 'en-US'], s: ['de-DE', 'en-US'] };
  function langConfig() {
    const legacyOff = crOpt.languages === false;
    const mode = (v) => (v === 'all' || v === 'off' || v === 'picked' ? v : null);
    const pickOf = (v, d) => (Array.isArray(v) && v.length ? v : d);
    return {
      a: { mode: mode(crOpt.langAudio) || (legacyOff ? 'off' : crOpt.languages === 'all' ? 'all' : 'picked'),
           pick: pickOf(crOpt.langPickAudio, Array.isArray(crOpt.langPick) && crOpt.langPick.length ? crOpt.langPick : DEFAULT_PICK.a) },
      s: { mode: mode(crOpt.langSubs) || (legacyOff ? 'off' : crOpt.languages === 'all' ? 'all' : 'picked'),
           pick: pickOf(crOpt.langPickSubs, Array.isArray(crOpt.langPick) && crOpt.langPick.length ? crOpt.langPick : DEFAULT_PICK.s) },
      rest: crOpt.langShowRest !== false
    };
  }

  function sortBy(list, pick) {
    return [...new Set(list)].sort((x, y) => {
      const ix = pick.indexOf(x), iy = pick.indexOf(y);
      if (ix !== -1 || iy !== -1) return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
      return langCode(x).localeCompare(langCode(y));
    });
  }

  function langLine(label, list, cfg, rest) {
    if (cfg.mode === 'off') return null;
    const sorted = sortBy(list, cfg.pick);
    if (!sorted.length) return label + ': –';
    const shown = cfg.mode === 'all' ? sorted : sorted.filter((l) => cfg.pick.includes(l));
    const n = sorted.length - shown.length;
    const more = n > 0 && rest ? (shown.length ? ' +' : '+') + n : '';
    if (!shown.length && !more) return label + ': –';
    return label + ': ' + shown.map(langCode).join(', ') + more;
  }

  function seriesIdForMeta(el) {
    for (let n = el.parentElement, i = 0; n && i < 8; n = n.parentElement, i++) {
      const a = n.querySelector('a[href*="/series/"]');
      if (a) return (/\/series\/([^/?#]+)/.exec(a.getAttribute('href')) || [])[1] || null;
    }
    return null;
  }

  async function scanLanguages() {
    const cfg = langConfig();
    if (cfg.a.mode === 'off' && cfg.s.mode === 'off') {
      for (const s of document.querySelectorAll('.usc-cr-langs')) s.remove();
      for (const o of document.querySelectorAll('[data-nina-lang-orig]')) {
        o.style.display = '';
        const row = o.closest('[class*="meta-tags"]:not([class*="tag-wrapper"])');
        if (row) row.style.display = '';
        o.removeAttribute('data-nina-lang-orig');
      }
      return;
    }
    if (!langCache) {
      langCache = (await new Promise((r) => chrome.storage.local.get([LANG_CACHE_KEY], r)))[LANG_CACHE_KEY] || {};
    }
    const now = Date.now();
    const cfgSig = JSON.stringify(cfg);
    const metas = [...document.querySelectorAll('[class*="meta-tags"] span, [data-nina-lang-orig]')]
      .filter((e) => e.children.length === 0 && LANG_META_RE.test((e.textContent || '').trim()));
    for (const el of metas) {
      const id = seriesIdForMeta(el);
      if (!id) continue;
      const data = langCache[id];
      if (!data || now - data.at > LANG_TTL) { langPending.add(id); if (!data) continue; }
      // Our block goes after Crunchyroll's meta-tags row (not inside it): that
      // row is clamped to one line on posters, which cut "Untertitel" off.
      const row = el.closest('[class*="meta-tags"]:not([class*="tag-wrapper"])') || el.parentElement;
      let ours = row.nextElementSibling && row.nextElementSibling.classList.contains('usc-cr-langs') ? row.nextElementSibling : null;
      const sig = cfgSig + '|' + data.a.join(',') + '|' + data.s.join(',');
      if (ours && ours.dataset.sig === sig) continue;
      if (!ours) {
        const cs = getComputedStyle(el);
        ours = document.createElement('div');
        ours.className = 'usc-cr-langs';
        ours.style.cssText = 'display:block;white-space:normal;overflow:visible;font-family:' + cs.fontFamily +
          ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight + ';line-height:' + cs.lineHeight + ';color:' + cs.color + ';';
        row.insertAdjacentElement('afterend', ours);
      }
      ours.dataset.sig = sig;
      ours.textContent = '';
      for (const line of [langLine('Synchro', data.a, cfg.a, cfg.rest), langLine('Untertitel', data.s, cfg.s, cfg.rest)]) {
        if (!line) continue;
        const l = document.createElement('div');
        l.textContent = line;
        ours.appendChild(l);
      }
      ours.title = 'Synchro: ' + sortBy(data.a, cfg.a.pick).map((x) => LANG_NAMES[x] || x).join(', ') +
        '\nUntertitel: ' + sortBy(data.s, cfg.s.pick).map((x) => LANG_NAMES[x] || x).join(', ');
      // Let the card grow for the extra line(s).
      for (let n = ours.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
        n.style.setProperty('overflow', 'visible', 'important');
        n.style.setProperty('max-height', 'none', 'important');
        n.style.setProperty('-webkit-line-clamp', 'unset', 'important');
      }
      el.setAttribute('data-nina-lang-orig', '1');
      el.style.display = 'none';
      // the row only held "Untertitel | Synchro": hide it entirely
      if (row !== el && row.textContent.trim() === el.textContent.trim()) row.style.display = 'none';
    }
    // Load what's missing, in one batch.
    if (langPending.size && !langBusy) {
      langBusy = true;
      const ids = [...langPending];
      langPending.clear();
      const res = await apiCall('seriesLocales', { ids }, 60000);
      langBusy = false;
      if (res && res.locales) {
        for (const id of Object.keys(res.locales)) langCache[id] = { ...res.locales[id], at: Date.now() };
        chrome.storage.local.set({ [LANG_CACHE_KEY]: langCache });
        scanLanguages();
      }
    }
  }

  // Season dropdown ("Staffel 1 · 25 Episoden"): put NINA's count in front
  // of Crunchyroll's episode count -> "20/25 Episoden", green when the
  // season is complete. Only for seasons NINA has seen (opened once).
  // Inserted as an extra span, so Crunchyroll's own text stays untouched.
  function decorateSeasonMenu() {
    if (!crOpt.seasonCounts) {
      for (const s of document.querySelectorAll('.usc-cr-season-progress')) s.remove();
      return;
    }
    const m = /\/series\/([^/?#]+)/.exec(location.pathname);
    if (!m) return;
    const seriesId = m[1];
    for (const opt of document.querySelectorAll('[role="option"]')) {
      const titleEl = opt.querySelector('[class*="extended-option__text"]');
      const descEl = opt.querySelector('[class*="extended-option__description"]');
      if (!titleEl || !descEl) continue;
      const total = Number((/(\d+)/.exec(descEl.textContent.replace(/^\d+\s*\//, '')) || [])[1]);
      const entry = statusMap[SEASON_PREFIX + seriesId + '|' + titleEl.textContent.trim().toLowerCase()];
      let span = descEl.querySelector('.usc-cr-season-progress');
      if (!entry || !entry.status || !total) {
        if (span) span.remove();
        continue;
      }
      const watched = entry.status === STATUS_WATCHED ? total : Math.min(total, entry.watchedEpisodes || 0);
      if (!span) {
        span = document.createElement('span');
        span.className = 'usc-cr-season-progress';
        descEl.insertBefore(span, descEl.firstChild);
      }
      const text = watched + '/';
      if (span.textContent !== text) span.textContent = text;
      span.style.color = watched >= total ? '#3dd16f' : '#f47521';
      span.style.fontWeight = '700';
    }
  }

  // Per show: 'watched' if every season we've seen of it is complete,
  // 'started' if any is only partly watched.
  // Per show: { status, frac } — 'watched' if every season NINA has seen of
  // it is complete, else 'started'; frac = watched / total episodes over
  // those seasons (for the poster's progress bar).
  function seriesSeasonStatus() {
    const acc = new Map();
    for (const k in statusMap) {
      if (!isSeasonKey(k)) continue;
      const e = statusMap[k];
      if (!e.seriesId) continue;
      // status null = a known season with nothing watched yet: the show
      // isn't complete, but it alone doesn't make the show 'started'.
      const a = acc.get(e.seriesId) || { allDone: true, any: false, watched: 0, total: 0 };
      if (e.status) a.any = true;
      if (e.status !== STATUS_WATCHED) a.allDone = false;
      if (e.episodes) {
        a.total += e.episodes;
        a.watched += e.status === STATUS_WATCHED ? e.episodes : (e.watchedEpisodes || 0);
      }
      acc.set(e.seriesId, a);
    }
    const bySeries = new Map();
    for (const [id, a] of acc) {
      if (!a.any) continue;
      bySeries.set(id, { status: a.allDone ? STATUS_WATCHED : STATUS_STARTED, frac: a.total ? a.watched / a.total : null });
    }
    return bySeries;
  }

  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function renderSeriesMarker(box, status, frac) {
    const watched = status === STATUS_WATCHED;
    const sig = (watched ? 'w' : 's') + '|' + (frac == null ? '' : Math.round(frac * 100));
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.textContent = '';
    const pill = document.createElement('span');
    pill.className = 'usc-cr-series-pill';
    pill.innerHTML = watched ? CHECK_SVG : PLAY_SVG;
    pill.appendChild(document.createTextNode(watched ? 'Gesehen' : 'Angefangen'));
    box.appendChild(pill);
    // Bar: full for watched shows, real share when known, else none.
    const share = watched ? 1 : frac;
    if (share != null) {
      const bar = document.createElement('div');
      bar.className = 'usc-cr-series-bar';
      const fill = document.createElement('div');
      fill.style.width = Math.max(4, Math.round(share * 100)) + '%';
      bar.appendChild(fill);
      box.appendChild(bar);
    }
  }

  function refreshAllBadges() {
    scanThumbnails();
    scanSeasonCompletion();
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
      scanSeasonCompletion();
      scanSeriesPosters();
      decorateSeasonMenu();
      scanLanguages();
    });
  }

  const observer = new MutationObserver(triggerScan);
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    attachTracking();
    // statusMap / settings may arrive after the video was attached
    if (trackedVideo && trackedEpisodeId) tryResume(trackedVideo, trackedEpisodeId);
    renderResumeMarker();
    scanSeasonCompletion();
    scanSeriesPosters();
    syncSeriesFromApi();
  }, 1000);

  // Watch history + one show per tick, gently in the background.
  setTimeout(syncWatchHistory, 4000);
  setInterval(syncWatchHistory, 5000);
  setTimeout(syncWatchlist, 8000);
  setInterval(syncWatchlist, 5000);
  attachTracking();
})();
