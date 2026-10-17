// stream-watch.js — "Gesehen & Angefangen" for series on Prime Video,
// Disney+, Joyn and Netflix, like NINA does on Crunchyroll and YouTube.
//
// While a video plays, the show, season and episode are read from the
// player (Prime/Disney+/Netflix: title + subtitle in the player overlay,
// Joyn: the /play/serien/<show>/<season>-<episode>-… address). An episode
// is "started" after some real playback and "watched" from the same
// percentage as on YouTube/Crunchyroll (settings → YouTube Features).
//
// Stored in chrome.storage.local.nina_stream_watch_status and merged with
// Google Drive (NINA/stream-watch-status.json) when Drive is connected.
// A watched episode of a show that is on the user's AniList list moves
// its AniList progress forward (only shows already on the list).
// Switches per service: settings → Streaming-Plattformen (nina_stream_track).

(function () {
  'use strict';
  if (window.__ninaStreamWatch) return;
  window.__ninaStreamWatch = true;

  const PLATFORM = (() => {
    const h = location.hostname;
    if (/(^|\.)(primevideo\.com|amazon\.(de|com|co\.uk))$/i.test(h)) return 'prime';
    if (/(^|\.)disneyplus\.com$/i.test(h)) return 'disney';
    if (/(^|\.)joyn\.(de|at|ch)$/i.test(h)) return 'joyn';
    if (/(^|\.)netflix\.com$/i.test(h)) return 'netflix';
    return null;
  })();
  if (!PLATFORM) return;

  const LOCAL_KEY = 'nina_stream_watch_status';
  const OPT_KEY = 'nina_stream_track'; // sync: { prime: { track, anilist }, … }
  const STARTED_AFTER = 20; // seconds of real playback

  let opts = { track: true, anilist: true };
  let libSync = {};
  chrome.storage.sync.get(['nina_library_settings'], (r) => { libSync = r.nina_library_settings || {}; });
  chrome.storage.onChanged.addListener((c, a) => { if (a === 'sync' && c.nina_library_settings) libSync = c.nina_library_settings.newValue || {}; });
  let watchedThreshold = 90;
  let statusMap = {};
  const readOpts = (v) => { opts = { track: true, anilist: true, ...((v || {})[PLATFORM] || {}) }; };
  chrome.storage.sync.get([OPT_KEY], (r) => readOpts(r[OPT_KEY]));
  chrome.storage.local.get([LOCAL_KEY, 'joyn_yt_watched_threshold'], (r) => {
    statusMap = r[LOCAL_KEY] || {};
    const t = parseFloat(r.joyn_yt_watched_threshold);
    if (isFinite(t)) watchedThreshold = Math.max(1, Math.min(100, t));
    pullFromDriveOnce();
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c[OPT_KEY]) readOpts(c[OPT_KEY].newValue);
    if (area === 'local' && c[LOCAL_KEY] && c[LOCAL_KEY].newValue) statusMap = { ...c[LOCAL_KEY].newValue, ...pendingLocal() };
    if (area === 'local' && c.joyn_yt_watched_threshold) {
      const t = parseFloat(c.joyn_yt_watched_threshold.newValue);
      if (isFinite(t)) watchedThreshold = Math.max(1, Math.min(100, t));
    }
  });
  // the entry being written right now must not be overwritten by an echo
  let current = null;
  const pendingLocal = () => (current && statusMap[current.key] ? { [current.key]: statusMap[current.key] } : {});

  // ── What is playing ───────────────────────────────────────────────────
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // "S2 F1 Titel", "S1:F1 Titel", "Staffel 2, Folge 1: Titel", "Season 2, Ep. 1 Title", "F1 Titel"
  function parseEpisode(text) {
    text = clean(text);
    // also Netflix' "St. 1: Fg. 4 Titel"
    let m = /^(?:S(?:t|taffel|eason)?\.?\s*(\d+)\s*[,:.]?\s*)?(?:F(?:g|olge)?|E(?:p(?:isode)?)?|Ep)\.?\s*(\d+)\s*[:.\-–]?\s*(.*)$/i.exec(text);
    if (m) return { season: m[1] ? +m[1] : null, episode: +m[2], title: clean(m[3]) };
    m = /(?:Staffel|Season)\s*(\d+).*?(?:Folge|Episode|Ep\.?)\s*(\d+)\s*[:.\-–]?\s*(.*)$/i.exec(text);
    if (m) return { season: +m[1], episode: +m[2], title: clean(m[3]) };
    return null;
  }

  function deepQuery(selector) {
    const found = [];
    (function walk(root) {
      found.push(...root.querySelectorAll(selector));
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    })(document);
    return found.map((e) => clean(e.textContent)).find(Boolean) || '';
  }

  const READERS = {
    prime() {
      const series = clean((document.querySelector('.atvwebplayersdk-title-text') || {}).textContent);
      const sub = clean((document.querySelector('.atvwebplayersdk-subtitle-text') || {}).textContent);
      return { series, ep: parseEpisode(sub), movie: !sub };
    },
    disney() {
      const sub = deepQuery('.subtitle-field');
      return { series: deepQuery('.title-field'), ep: parseEpisode(sub), movie: !sub };
    },
    joyn() {
      const fm = /^\/play\/(?:filme|movies?)\/([^/?#]+)/.exec(location.pathname);
      if (fm) {
        const ms0 = navigator.mediaSession && navigator.mediaSession.metadata;
        const t0 = /^(.*?)\s*(?:streamen|schauen|ansehen)/i.exec(document.title || '');
        const slug0 = fm[1].replace(/-d[a-z0-9]{8,}$/i, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return { series: clean((ms0 && ms0.title) || (t0 && t0[1]) || slug0), ep: null, movie: true };
      }
      const m = /^\/play\/serien\/([^/]+)\/(\d+)-(\d+)-([^/?#]*)/.exec(location.pathname);
      if (!m) return null;
      // nicer names from the page title: "Solo LevelingStaffel 2 Folge 1 streamen"
      const t = /^(.*?)\s*Staffel\s*\d+/i.exec(document.title || '');
      const ms = navigator.mediaSession && navigator.mediaSession.metadata;
      const msTitle = ms && ms.title && ms.title.includes(' - ') ? ms.title.split(' - ').slice(1).join(' - ') : '';
      const slugName = m[1].replace(/-d[a-z0-9]{8,}$/i, '').replace(/-/g, ' ');
      return {
        series: clean(t && t[1]) || slugName.replace(/\b\w/g, (c) => c.toUpperCase()),
        ep: { season: +m[2], episode: +m[3], title: clean(msTitle) || m[4].replace(/-/g, ' ') }
      };
    },
    netflix() {
      const box = document.querySelector('[data-uia="video-title"]');
      if (!box) return null;
      const h = box.querySelector('h4');
      const spans = [...box.querySelectorAll('span')].map((s) => clean(s.textContent)).filter(Boolean);
      if (!h) return { series: clean(box.textContent), ep: null, movie: true }; // a film
      return { series: clean(h.textContent), ep: parseEpisode(spans.join(' ')) };
    }
  };

  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function readNow() {
    let info = null;
    try { info = READERS[PLATFORM](); } catch (_) {}
    if (!info || !info.series) return null;
    // films: no episode, a real title (no trailers); the length is checked in the tick
    if (!info.ep && info.movie) {
      if (/^(trailer|vorschau|teaser|clip)\b/i.test(info.series) || /\|\s*trailer/i.test(info.series)) return null;
      return { key: PLATFORM + ':' + norm(info.series) + ':movie', series: info.series, season: 1, episode: null, title: '', movie: true };
    }
    if (!info.ep || !info.ep.episode) return null;
    const season = info.ep.season || 1;
    return {
      key: PLATFORM + ':' + norm(info.series) + ':s' + season + 'e' + info.ep.episode,
      series: info.series, season, episode: info.ep.episode, title: info.ep.title || '', movie: false
    };
  }

  // ── Video ─────────────────────────────────────────────────────────────
  function collectVideos(root, out = []) {
    try { out.push(...root.querySelectorAll('video')); } catch (_) {}
    try { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collectVideos(el.shadowRoot, out); } catch (_) {}
    return out;
  }
  function mainVideo() {
    let best = null, area = 0;
    for (const v of collectVideos(document)) {
      if (!(v.duration > 60)) continue; // no previews / ads
      const a = v.offsetWidth * v.offsetHeight;
      if (a > area) { area = a; best = v; }
    }
    return best;
  }

  // ── Status ────────────────────────────────────────────────────────────
  let saveTimer = null;
  function persist(now) {
    clearTimeout(saveTimer);
    const run = () => { chrome.storage.local.set({ [LOCAL_KEY]: statusMap }); scheduleDriveSync(); };
    if (now) run(); else saveTimer = setTimeout(run, 4000);
  }

  function update(ep, video, played) {
    const prev = statusMap[ep.key] || {};
    const pct = video.currentTime / video.duration * 100;
    let status = prev.status || null;
    if (pct >= watchedThreshold) status = 'watched';
    else if (!status && played >= STARTED_AFTER) status = 'started';
    if (!status) return;
    const becameWatched = status === 'watched' && prev.status !== 'watched';
    statusMap[ep.key] = {
      ...prev,
      platform: PLATFORM, series: ep.series, season: ep.season, episode: ep.episode, movie: !!ep.movie,
      title: ep.title || prev.title || '',
      status,
      lastPosition: video.currentTime,
      duration: video.duration,
      url: location.href.split('#')[0],
      updatedAt: Date.now()
    };
    persist(status !== prev.status);
    if (becameWatched) pushAnilist(ep);
  }

  function pushAnilist(ep) {
    // not automatic any more: only with "Mit AniList verknüpfen" in Meine Serien
    if (!opts.anilist || !libSync.anilistSync || ep.movie) return;
    try {
      chrome.runtime.sendMessage({
        type: 'NINA_ANILIST', op: 'episodeWatched',
        data: {
          key: PLATFORM + ':' + norm(ep.series) + '|staffel ' + ep.season,
          seriesTitle: ep.series, seasonTitle: 'Staffel ' + ep.season,
          episode: ep.episode, altTitle: '',
          requireOnList: true // only shows already on the AniList list
        }
      }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  // one tick per second while something plays
  let played = 0, lastKey = '', lastT = 0;
  setInterval(() => {
    if (!opts.track || !chrome.runtime || !chrome.runtime.id) return;
    const video = mainVideo();
    if (!video || video.paused) return;
    const ep = readNow();
    if (!ep) return;
    if (ep.key !== lastKey) { lastKey = ep.key; played = 0; lastT = video.currentTime; }
    // real playback only: no jumps from seeking
    const dt = video.currentTime - lastT;
    if (dt > 0 && dt < 3) played += dt;
    lastT = video.currentTime;
    if (ep.movie && !(video.duration >= 25 * 60)) return; // trailers / clips
    current = ep;
    update(ep, video, played);
  }, 1000);

  // ── Google Drive ──────────────────────────────────────────────────────
  function merge(a, b) {
    const out = { ...a };
    for (const id in b) {
      const x = out[id], y = b[id];
      if (!x) { out[id] = y; continue; }
      const win = (y.updatedAt || 0) >= (x.updatedAt || 0) ? y : x;
      const lose = win === y ? x : y;
      // "watched" never goes back to "started"
      const status = x.status === 'watched' || y.status === 'watched' ? 'watched' : win.status;
      out[id] = { ...lose, ...win, status };
    }
    return out;
  }
  let driveTimer = null;
  function scheduleDriveSync() {
    clearTimeout(driveTimer);
    driveTimer = setTimeout(async () => {
      const D = window.NinaDrive;
      if (!D || !D.isConnected() || !D.getStreamWatchStatus) return;
      try {
        statusMap = merge(await D.getStreamWatchStatus() || {}, statusMap);
        chrome.storage.local.set({ [LOCAL_KEY]: statusMap });
        await D.saveStreamWatchStatus(statusMap);
      } catch (_) {}
    }, 20000);
  }
  async function pullFromDriveOnce() {
    const D = window.NinaDrive;
    if (!D || !D.getStreamWatchStatus) return;
    try {
      if (!D.isConnected() && D.tryAutoConnect) await D.tryAutoConnect();
      if (!D.isConnected()) return;
      const remote = await D.getStreamWatchStatus();
      if (remote) {
        statusMap = merge(statusMap, remote);
        chrome.storage.local.set({ [LOCAL_KEY]: statusMap });
      }
    } catch (_) {}
  }
})();
