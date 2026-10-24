// library.js — "Meine Serien": NINA's own tracker page (like Trakt /
// AniList), Material 3 Expressive look.
//
// The logic that merges tracked episodes, added shows and online data into
// one entry per show/film, maps seasons across services and works out the
// status lives in lib/library-core.js (shared with the streaming sites).
// This file is the page: lists, show page, search, settings, writes.
//
// Storage:
//   sync  "nlib:<ref>"            added shows + the user's own state
//         "nina_library_settings" page settings
//   local "nina_library_meta"     online details per ref
//         "nina_library_lookup"   tracked show -> online ref
//         "nina_stream_struct"    season sizes seen on the services
//         "nina_stream_pages"     show pages / episode links seen on the services (start an episode)
//   Cache Storage "nina-library"  show pages' full details (cast, episodes, links …) and the
//                                 covers / pictures, so everything shows at once, also offline;
//                                 opening a show checks the services again and replaces what changed

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const P = window.NinaProviders;
  const C = window.NinaLibCore;
  const SET_KEY = 'nina_library_settings';
  const META_KEY = 'nina_library_meta';
  const LOOKUP_KEY = 'nina_library_lookup';
  const STRUCT_KEY = 'nina_stream_struct';
  const ITEM_PREFIX = 'nlib:';
  const LOOKUP_VER = 2;
  const DEFAULTS = {
    theme: 'system', seed: 186, reduceMotion: false, startPage: 'home', sort: 'recent',
    sources: { crunchyroll: true, prime: true, disney: true, joyn: true, netflix: true },
    providers: { tvmaze: true, anilist: true, tmdb: false },
    tmdbKey: '', autoPosters: true, posterQuality: 'auto',
    pauseDays: 30,          // no progress for that long -> "Pausiert"
    anilistSync: false,     // push status / rating to AniList
    siteBadges: true,       // badges on posters on the streaming sites
    siteCard: true          // NINA card above the episodes on the streaming sites
  };
  const SEEDS = [
    { h: 186, name: 'NINA-Türkis' }, { h: 265, name: 'Violett' }, { h: 140, name: 'Grün' },
    { h: 24, name: 'Orange' }, { h: 330, name: 'Rosa' }, { h: 215, name: 'Blau' }, { h: 48, name: 'Gelb' }
  ];
  const PLATFORMS = {
    crunchyroll: { name: 'Crunchyroll', color: '#f47521' },
    prime: { name: 'Prime Video', color: '#00a8e1' },
    disney: { name: 'Disney+', color: '#2f6bff' },
    joyn: { name: 'Joyn', color: '#c9a800' },
    netflix: { name: 'Netflix', color: '#e50914' }
  };
  const PROVIDERS = {
    tvmaze: { name: 'TVmaze', color: '#3c948b', desc: 'Serien aller Art – kostenlos, ohne Konto' },
    anilist: { name: 'AniList', color: '#02a9ff', desc: 'Animes – kostenlos, ohne Konto' },
    tmdb: { name: 'TMDB', color: '#01b4e4', desc: 'Serien &amp; Filme mit deutschen Texten – braucht deinen kostenlosen API-Schlüssel' }
  };
  const STATUS = C.STATUS;
  const ORDER = C.STATUS_ORDER;
  // Icons (SVG): the UI uses no emoji and no text symbols
  const ico = (d) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
  const I = {
    play: ico('M8 5v14l11-7z'),
    pause: ico('M6 19h4V5H6v14zm8-14v14h4V5h-4z'),
    check: ico('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'),
    close: ico('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'),
    clock: ico('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'),
    repeat: ico('M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'),
    bookmark: ico('M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z'),
    star: ico('M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'),
    heart: ico('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'),
    chev: ico('M7 10l5 5 5-5z'),
    chevUp: ico('M7 14l5-5 5 5z'),
    open: ico('M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'),
    back: ico('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'),
    trash: ico('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'),
    add: ico('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'),
    tv: ico('M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z'),
    movie: ico('M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z'),
    calendar: ico('M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z'),
    search: ico('M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z')
  };
  const BADGE = { watching: I.play + 'Schaue ich', planned: I.clock + 'Geplant', done: I.check + 'Abgeschlossen', rewatching: I.repeat + 'Schaue erneut', paused: I.pause + 'Pausiert', dropped: I.close + 'Abgebrochen' };
  const AL_STATUS = { watching: 'CURRENT', planned: 'PLANNING', done: 'COMPLETED', rewatching: 'REPEATING', paused: 'PAUSED', dropped: 'DROPPED' };

  let settings = structuredClone(DEFAULTS);
  let cr = {}, st = {}, struct = {}, meta = {}, lookup = {}, items = {}, aliases = {}, views = {};
  const LOG_KEY = 'nina_view_log';   // viewing dates (lib/view-log-bg.js)
  let shows = [];
  let page = 'home';
  let libFilter = 'all', libPlatform = 'all', libQuery = '';   // filters are kept in the settings (synced via Drive)
  let driveLast = null, driveBusy = false;                      // local nina_drive_last_sync
  let showSeason = null, summaryOpen = false;

  const enabledProviders = () => Object.keys(PROVIDERS).filter((p) => settings.providers[p] && (p !== 'tmdb' || settings.tmdbKey));
  const hueOf = C.hueOf;
  const isPhone = () => (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  const isLowQuality = () => settings.posterQuality === 'low' || (settings.posterQuality !== 'high' && isPhone());

  function posterUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const u = !isLowQuality() ? url : url
      .replace(/\/t\/p\/(w500|w780|original)\//, '/t/p/w185/')
      .replace('/original_untouched/', '/medium_portrait/')
      .replace(/\/cover\/(large|extraLarge)\//, '/cover/medium/');
    return imgUrls.get(u) || u;   // saved on the device (see "Saved details + pictures")
  }

  function backdropUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (!isLowQuality()) return url;
    return posterUrl(url).replace(/\/t\/p\/(w1280|original)\//, '/t/p/w780/');
  }

  // ── Color: Material 3 tonal palette from one hue (HSL approximation) ──
  function applyTheme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const h = settings.seed, t = (h + 60) % 360;
    const hsl = (hh, s, l) => `hsl(${hh} ${s}% ${l}%)`;
    const c = dark ? {
      primary: hsl(h, 60, 78), 'on-primary': hsl(h, 70, 16), 'primary-container': hsl(h, 50, 28), 'on-primary-container': hsl(h, 70, 90),
      'secondary-container': hsl(h, 18, 30), 'on-secondary-container': hsl(h, 30, 90),
      tertiary: hsl(t, 45, 78), 'tertiary-container': hsl(t, 30, 30), 'on-tertiary-container': hsl(t, 50, 90),
      surface: hsl(h, 10, 7), 'surface-dim': hsl(h, 10, 7), 'surface-c-lowest': hsl(h, 10, 5), 'surface-c-low': hsl(h, 9, 10),
      'surface-c': hsl(h, 9, 12), 'surface-c-high': hsl(h, 8, 16), 'surface-c-highest': hsl(h, 8, 21),
      'on-surface': hsl(h, 10, 90), 'on-surface-variant': hsl(h, 9, 76), outline: hsl(h, 6, 58), 'outline-variant': hsl(h, 8, 28),
      'inverse-surface': hsl(h, 10, 90), 'inverse-on-surface': hsl(h, 10, 16), scrim: 'rgba(0,0,0,.5)', good: '#81c784'
    } : {
      primary: hsl(h, 75, 30), 'on-primary': '#fff', 'primary-container': hsl(h, 70, 88), 'on-primary-container': hsl(h, 80, 12),
      'secondary-container': hsl(h, 35, 87), 'on-secondary-container': hsl(h, 40, 14),
      tertiary: hsl(t, 40, 38), 'tertiary-container': hsl(t, 60, 90), 'on-tertiary-container': hsl(t, 60, 14),
      surface: hsl(h, 30, 98), 'surface-dim': hsl(h, 10, 85), 'surface-c-lowest': '#fff', 'surface-c-low': hsl(h, 22, 95.5),
      'surface-c': hsl(h, 18, 93.5), 'surface-c-high': hsl(h, 15, 91), 'surface-c-highest': hsl(h, 13, 88.5),
      'on-surface': hsl(h, 12, 11), 'on-surface-variant': hsl(h, 8, 30), outline: hsl(h, 6, 48), 'outline-variant': hsl(h, 10, 79),
      'inverse-surface': hsl(h, 8, 19), 'inverse-on-surface': hsl(h, 15, 94), scrim: 'rgba(0,0,0,.32)', good: '#2e7d32'
    };
    for (const k in c) document.documentElement.style.setProperty('--' + k, c[k]);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'system' && applyTheme());

  // ── Data ───────────────────────────────────────────────────────────────
  const getLocal = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const getSync = (keys) => new Promise((r) => chrome.storage.sync.get(keys, r));
  // other writers (streaming sites) change these maps too: always merge, never overwrite
  async function patchMap(key, patch) {
    const cur = (await getLocal([key]))[key] || {};
    const next = { ...cur, ...patch };
    await new Promise((r) => chrome.storage.local.set({ [key]: next }, r));
    return next;
  }

  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ── Saved details + pictures (Cache Storage, no 10 MB limit like storage.local) ──
  const CACHE = 'nina-library';
  const BASE = 'https://nina-library.invalid/';
  const openCache = () => (typeof caches !== 'undefined' ? caches.open(CACHE) : Promise.reject(new Error('no cache')));
  const store = {
    async get(key) {
      try { const r = await (await openCache()).match(BASE + encodeURIComponent(key)); return r ? r.json() : null; } catch (_) { return null; }
    },
    async put(key, value) {
      try { await (await openCache()).put(BASE + encodeURIComponent(key), new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })); } catch (_) {}
    }
  };
  // pictures: each one shown is kept; next time it comes from the device. The services' CDNs allow
  // CORS, others (no CORS) simply load from the web as before.
  const IMG_MAX = 1500;
  const imgUrls = new Map();     // url -> blob: URL (this page)
  const imgTried = new Set();
  let imgKeys = null;            // urls in the cache
  async function cachedKeys() {
    if (!imgKeys) {
      try { imgKeys = new Set((await (await openCache()).keys()).map((r) => r.url).filter((u) => !u.startsWith(BASE))); } catch (_) { imgKeys = new Set(); }
    }
    return imgKeys;
  }
  // a picture on screen is never swapped (that made covers flash): the saved copy is used from the
  // next render on, or right away when loading it from the web fails (offline)
  async function useCachedImage(img, url) {
    try {
      const keys = await cachedKeys();
      const c = await openCache();
      if (keys.has(url)) {
        const r = await c.match(url);
        if (r) {
          const blobUrl = URL.createObjectURL(await r.blob());
          imgUrls.set(url, blobUrl);
          const fallback = () => { if (img.getAttribute('src') === url) img.src = blobUrl; };
          if (img.complete && !img.naturalWidth) fallback();
          else img.addEventListener('error', fallback, { once: true });
          return;
        }
      }
      if (imgTried.has(url)) return;
      imgTried.add(url);
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!r.ok || r.type === 'opaque' || !/^image\//.test(r.headers.get('content-type') || '')) return;
      await c.put(url, r);
      keys.add(url);
      if (keys.size > IMG_MAX) {   // oldest out
        const old = [...keys].slice(0, keys.size - IMG_MAX);
        for (const u of old) { keys.delete(u); c.delete(u); }
      }
    } catch (_) {}
  }
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const imgs = n.tagName === 'IMG' ? [n] : n.querySelectorAll('img');
      for (const img of imgs) {
        const url = img.getAttribute('src') || '';
        if (!/^https:\/\//.test(url) || imgUrls.has(url)) continue;
        useCachedImage(img, url);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Franchise Movie-to-Series Grouping ─────────────────────────────────
  const normTitleRaw = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  const stripSubtitlesRaw = (s) => String(s || '')
    .replace(/\s*[:\-–—~|]\s*(the\s+movie|movie|film|der\s+film|geki.*).*$/i, '')
    .replace(/\s*[:\-–—~|].*$/, '')
    .replace(/\s+(the\s+movie|movie|film|der\s+film|the\s+series|tv)$/i, '')
    .trim();

  // normalising titles is the hot spot of the franchise grouping (movies × series × titles): cache it
  const memo = (fn) => {
    const cache = new Map();
    return (s) => {
      const k = s == null ? '' : String(s);
      let v = cache.get(k);
      if (v === undefined) {
        if (cache.size > 20000) cache.clear();
        v = fn(k);
        cache.set(k, v);
      }
      return v;
    };
  };
  const normTitle = memo(normTitleRaw);
  const stripSubtitles = memo(stripSubtitlesRaw);

  function isMovieRelatedToSeries(movie, series) {
    if (!movie.movie || series.movie) return false;
    if (movie.key === series.key) return false;

    const mMeta = movie.meta || {};
    const sMeta = series.meta || {};
    if (mMeta.relations && series.ref) {
      if (mMeta.relations.some((r) => r && (r.ref === series.ref || r.id === series.ref || r.id === (series.item && series.item.id)))) return true;
    }
    if (sMeta.relations && movie.ref) {
      if (sMeta.relations.some((r) => r && (r.ref === movie.ref || r.id === movie.ref || r.id === (movie.item && movie.item.id)))) return true;
    }

    const sTitles = [series.title, series.name, sMeta.name, ...((sMeta && sMeta.altNames) || []), ...(series.names || [])].filter(Boolean);
    const mTitles = [movie.title, movie.name, mMeta.name, ...((mMeta && mMeta.altNames) || []), ...(movie.names || [])].filter(Boolean);

    for (const st of sTitles) {
      const sn = normTitle(st);
      if (sn.length < 4) continue;
      const sBase = normTitle(stripSubtitles(st));

      for (const mt of mTitles) {
        const mn = normTitle(mt);
        if (mn.length < 4) continue;
        const mBase = normTitle(stripSubtitles(mt));

        if (sBase.length >= 4 && sBase === mBase) return true;
        if (sn.length >= 6 && mn.startsWith(sn)) return true;
        if (sBase.length >= 6 && mn.startsWith(sBase)) return true;
        if (sn.length >= 8 && mn.includes(sn)) return true;
        if (sBase.length >= 8 && mn.includes(sBase)) return true;

        let prefixLen = 0;
        const minL = Math.min(sn.length, mn.length);
        while (prefixLen < minL && sn[prefixLen] === mn[prefixLen]) prefixLen++;
        if (prefixLen >= 14) return true;

        const sNet = String(sMeta.network || '').toLowerCase().trim();
        const mNet = String(mMeta.network || '').toLowerCase().trim();
        if (sNet && mNet && sNet !== 'anime' && sNet !== 'film' && sNet === mNet && prefixLen >= 8) {
          return true;
        }
      }
    }
    return false;
  }

  function getFranchiseMatchScore(movie, series) {
    const sMeta = series.meta || {};
    const mMeta = movie.meta || {};
    const sTitles = [series.title, series.name, sMeta.name, ...((sMeta && sMeta.altNames) || []), ...(series.names || [])].filter(Boolean);
    const mTitles = [movie.title, movie.name, mMeta.name, ...((mMeta && mMeta.altNames) || []), ...(movie.names || [])].filter(Boolean);

    let maxScore = 0;
    const sNet = String(sMeta.network || '').toLowerCase().trim();
    const mNet = String(mMeta.network || '').toLowerCase().trim();
    const studioBonus = (sNet && mNet && sNet === mNet) ? 20 : 0;

    for (const st of sTitles) {
      const sn = normTitle(st);
      const sBase = normTitle(stripSubtitles(st));
      for (const mt of mTitles) {
        const mn = normTitle(mt);
        const mBase = normTitle(stripSubtitles(mt));
        if (sBase === mBase) maxScore = Math.max(maxScore, 100 + studioBonus);
        if (mn.startsWith(sn)) maxScore = Math.max(maxScore, 80 + sn.length + studioBonus);
        if (mn.includes(sn)) maxScore = Math.max(maxScore, 60 + sn.length + studioBonus);

        let pLen = 0;
        const minL = Math.min(sn.length, mn.length);
        while (pLen < minL && sn[pLen] === mn[pLen]) pLen++;
        if (pLen >= 8) maxScore = Math.max(maxScore, pLen * 2 + studioBonus);
      }
    }
    return maxScore;
  }

  function groupFranchiseMovies(list) {
    const seriesList = list.filter((s) => !s.movie);
    const movieCandidates = list.filter((s) => s.movie);
    const assignedMovies = new Set();

    for (const s of seriesList) {
      s.movies = [];
    }

    for (const m of movieCandidates) {
      let bestSeries = null;
      let bestScore = 0;

      for (const s of seriesList) {
        if (isMovieRelatedToSeries(m, s)) {
          const score = getFranchiseMatchScore(m, s);
          if (score > bestScore) {
            bestScore = score;
            bestSeries = s;
          }
        }
      }

      if (bestSeries) {
        bestSeries.movies.push(m);
        assignedMovies.add(m);

        if (!bestSeries.aliases.includes(m.key)) bestSeries.aliases.push(m.key);
        if (m.ref && !bestSeries.aliases.includes(m.ref)) bestSeries.aliases.push(m.ref);
        for (const a of (m.aliases || [])) {
          if (!bestSeries.aliases.includes(a)) bestSeries.aliases.push(a);
        }
        for (const n of (m.names || [])) {
          if (!bestSeries.names.includes(n)) bestSeries.names.push(n);
        }

        if ((m.lastAt || 0) > (bestSeries.lastAt || 0)) {
          bestSeries.lastMovie = m;
          bestSeries.lastSeriesAt = bestSeries.lastAt;
          bestSeries.lastAt = m.lastAt;
          bestSeries.updatedAt = Math.max(bestSeries.updatedAt || 0, m.updatedAt || 0);
        }
      }
    }

    for (const s of seriesList) {
      if (s.movies && s.movies.length) {
        s.movies.sort((a, b) => {
          const ya = (a.meta && a.meta.year) || (a.item && a.item.year) || 0;
          const yb = (b.meta && b.meta.year) || (b.item && b.item.year) || 0;
          return ya - yb;
        });
      }
    }

    return list.filter((s) => !assignedMovies.has(s));
  }

  const persisted = new Set();
  // entries opened just to look at (search hit / related film): in memory only, not in the library
  const previews = new Map();
  const buildCtx = () => ({ cr, st, lookup, items, meta, struct, aliases, views, settings: { pauseDays: settings.pauseDays, sources: settings.sources } });
  function rebuild() {
    shows = C.build(buildCtx());
    // automatic completion is remembered (needed to notice a later rewatch)
    let changed = false;
    for (const s of shows) {
      if (!s.persist) continue;
      const k = (s.ref || s.name) + '|' + s.persist.completedAt;
      if (persisted.has(k)) continue;
      persisted.add(k);
      const it = { ...itemFor(s), ...s.persist };
      items[it.ref] = it;
      chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: it });
      changed = true;
    }
    if (changed) shows = C.build(buildCtx());
    shows = groupFranchiseMovies(shows);
  }

  // services added by partner extensions (lib/partner-bg.js) appear like the built-in ones
  const BUILTIN = new Set(Object.keys(PLATFORMS));
  function addPartners(all) {
    for (const k of Object.keys(PLATFORMS)) if (!BUILTIN.has(k)) delete PLATFORMS[k];
    for (const p of Object.values(all || {})) if (p && p.id && !BUILTIN.has(p.id)) PLATFORMS[p.id] = { name: p.name || p.id, color: p.color || '#7c5cff' };
  }

  async function load() {
    const l = await getLocal(['nina_cr_watch_status', 'nina_stream_watch_status', META_KEY, LOOKUP_KEY, STRUCT_KEY, 'nina_partner_platforms', 'nina_partner_alias', LOG_KEY, 'nina_library_local_items']);
    addPartners(l.nina_partner_platforms);
    aliases = l.nina_partner_alias || {};
    views = l[LOG_KEY] || {};
    cr = l.nina_cr_watch_status || {};
    st = l.nina_stream_watch_status || {};
    meta = l[META_KEY] || {};
    struct = l[STRUCT_KEY] || {};
    lookup = l[LOOKUP_KEY] || {};
    // matches made with an older matching rule are redone
    if (lookup.__v !== LOOKUP_VER) { lookup = { __v: LOOKUP_VER }; chrome.storage.local.set({ [LOOKUP_KEY]: lookup }); }
    const all = await getSync(null);
    items = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(ITEM_PREFIX) && v && v.ref) items[v.ref] = v;
    for (const [ref, v] of Object.entries(l.nina_library_local_items || {})) if (v && v.ref && !items[v.ref]) items[v.ref] = v;
    for (const [ref, v] of previews) if (!items[ref]) items[ref] = v;
    rebuild();
  }

  // ── Background: matches, posters, episode counts, next episode ───────
  let enriching = false, rerenderTimer = null;
  const softRender = () => { clearTimeout(rerenderTimer); rerenderTimer = setTimeout(() => { rebuild(); render(true); }, 300); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function migrateLocal(s, ref) {
    const old = items[C.localRef(s.name)];
    if (!old || items[ref]) return;
    const it = { ...old, ref };
    delete items[old.ref];
    items[ref] = it;
    chrome.storage.sync.remove(ITEM_PREFIX + old.ref);
    chrome.storage.sync.set({ [ITEM_PREFIX + ref]: it });
  }

  async function enrich() {
    if (enriching) return;
    enriching = true;
    const prov = enabledProviders();
    try {
      if (settings.autoPosters && prov.length) {
        for (const s of shows.slice()) {
          for (const g of s.groups) {
            const cur = lookup[g.key];
            if (cur === '' || (cur && !String(cur).startsWith('local:'))) continue;
            const hit = await P.lookup(g.name, g.platform, prov, g.movie ? 'movie' : 'show').catch(() => null);
            lookup[g.key] = hit ? hit.ref : '';
            if (hit) { meta[hit.ref] = { ...hit, fetchedAt: 0 }; migrateLocal(s, hit.ref); }
            await patchMap(LOOKUP_KEY, { [g.key]: lookup[g.key], __v: LOOKUP_VER });
            if (hit) chrome.storage.local.set({ [META_KEY]: meta });
            softRender();
            await sleep(450);
          }
        }
      }
      const refs = new Set([...Object.keys(items).filter((r) => !r.startsWith('local:')), ...Object.entries(lookup).filter(([k, r]) => k !== '__v' && r && !String(r).startsWith('local:')).map(([, r]) => r)]);
      const refList = [...refs].sort((a, b) => {
        const sa = shows.find((s) => s.ref === a || (s.aliases && s.aliases.includes(a)));
        const sb = shows.find((s) => s.ref === b || (s.aliases && s.aliases.includes(b)));
        const score = (s) => (s ? ((s.status === 'watching' || s.status === 'rewatching') ? 3 : s.wl ? 2 : 1) : 0);
        return score(sb) - score(sa);
      });
      for (const ref of refList) {
        const p = ref.split(':')[0] === 'tmdbmovie' ? 'tmdb' : ref.split(':')[0];
        if (!prov.includes(p)) continue;
        const m = meta[ref];
        if (m && Date.now() - (m.fetchedAt || 0) < 12 * 3600e3) continue;
        try {
          meta[ref] = { ...(await P.details(ref)), fetchedAt: Date.now() };
          chrome.storage.local.set({ [META_KEY]: meta });
          softRender();
        } catch (_) {}
        await sleep(450);
      }
    } finally { enriching = false; }
  }

  // ── Library writes ─────────────────────────────────────────────────────
  const itemFor = (g) => (g.item ? (({ preview, ...rest }) => rest)(g.item) : null) || { ref: g.ref || C.localRef(g.name), name: g.name, poster: g.poster, type: g.movie ? 'movie' : 'show', addedAt: Date.now() };
  function patchItem(g, patch) {
    const it = { ...itemFor(g), ...patch };
    previews.delete(it.ref);
    items[it.ref] = it;
    chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: it }, () => {
      if (chrome.runtime.lastError) snack('Konnte nicht speichern: ' + chrome.runtime.lastError.message);
    });
    rebuild();
    return it;
  }
  function setStatus(g, status) {
    if (status === 'auto') {
      const it = { ...itemFor(g) };
      delete it.status; delete it.manualAt;
      items[it.ref] = it;
      chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: it });
      rebuild();
      return snack('Status wird wieder automatisch erkannt');
    }
    const patch = { status, manualAt: Date.now() };
    if (status === 'done') patch.completedAt = Date.now();
    patchItem(g, patch);
    snack(STATUS[status]);
    pushAnilist(g, { status });
  }
  function addResult(r) {
    previews.delete(r.ref);
    meta[r.ref] = { ...r, fetchedAt: 0 };
    chrome.storage.local.set({ [META_KEY]: meta });
    items[r.ref] = { ref: r.ref, name: r.name, poster: r.poster, year: r.year, network: r.network, type: r.type || 'show', wl: true, addedAt: Date.now() };
    chrome.storage.sync.set({ [ITEM_PREFIX + r.ref]: items[r.ref] });
    rebuild();
    snack('„' + r.name + '“ zur Merkliste hinzugefügt');
    enrich();
  }
  // open a page for something that is not in the library: nothing is saved (no Merkliste, no status) until
  // the user does something there; leaving the page drops it again
  function openPreview(r) {
    if (items[r.ref]) return;
    meta[r.ref] = { ...r, fetchedAt: 0 };
    const it = { ref: r.ref, name: r.name, poster: r.poster, year: r.year, network: r.network, type: r.type || 'show', addedAt: Date.now(), preview: true };
    previews.set(r.ref, it);
    items[r.ref] = it;
    rebuild();
    enrich();
  }
  function prunePreviews(hash) {
    if (!previews.size) return;
    const keep = hash.startsWith('show/') ? hash.slice(5) : null;
    const g = keep ? findShowByKey(keep) : null;
    let changed = false;
    for (const [ref, it] of previews) {
      if (keep && (ref === keep || (g && g.ref === ref))) continue;
      previews.delete(ref);
      if (items[ref] === it) { delete items[ref]; changed = true; }
    }
    if (changed) rebuild();
  }
  function removeItem(ref) {
    delete items[ref];
    chrome.storage.sync.remove(ITEM_PREFIX + ref);
    rebuild();
    location.hash = 'library';
    snack('Aus der Bibliothek entfernt');
  }
  // ── Viewing dates ──────────────────────────────────────────────────────
  // same numbering as library-core uses for ticks
  const absFor = (g, s, n) => g.movie ? 1 : g.meta && g.meta.seasons && g.meta.seasons.length ? C.canonAbs(g, s, n) : C.absOf(s, n, null, []);
  async function patchLog(fn) {
    const cur = (await getLocal([LOG_KEY]))[LOG_KEY] || {};
    fn(cur);
    await new Promise((r) => chrome.storage.local.set({ [LOG_KEY]: cur }, r));
    views = cur;
    rebuild();
    render(true);
  }
  // a tick by hand is a viewing now; taking it back removes the dates set here
  function logTicks(g, list, on) {
    const now = Date.now();
    return patchLog((log) => {
      for (const [s, n] of list) {
        const abs = absFor(g, s, n);
        for (const a of [g.key, ...g.aliases]) { delete log['tk:' + a + '|' + abs]; if (!on) delete log['ed:' + a + '|' + abs]; }
        if (on && !(g.views.get(abs) || []).length) log['tk:' + g.key + '|' + abs] = { v: [now] };
      }
    });
  }
  const fmtDay = (ts, time) => {
    const d = new Date(ts);
    const o = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    if (time) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('de-DE', o);
  };
  const toInput = (ts) => new Date(ts - new Date(ts).getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  // "Gesehen 12. Okt. · 2×" under an episode / the film
  function seenLine(g, abs, watched, movieKey) {
    const v = g.views.get(abs) || [];
    if (!v.length && !watched) return '';
    return `<button type="button" class="ep-seen ${v.length > 1 ? 'multi' : ''}" data-views="${abs}" ${movieKey ? `data-movie-key="${esc(movieKey)}"` : ''} title="Wann gesehen – bearbeiten">${v.length
      ? I.calendar + '<span>Gesehen ' + esc(fmtDay(v[v.length - 1])) + '</span>' + (v.length > 1 ? `<b>${I.repeat}${v.length}×</b>` : '')
      : I.calendar + '<span>Datum eintragen</span>'}</button>`;
  }
  let viewEdit = null;
  function openViews(g, abs) {
    viewEdit = { show: g, abs, list: (g.views.get(abs) || []).slice() };
    paintViews();
    $('view-dlg').showModal();
  }
  function paintViews() {
    const g = (viewEdit && viewEdit.show) || curShow();
    if (!g || !viewEdit) return;
    const { abs, list } = viewEdit;
    const se = g.movie ? null : typeof abs === 'number' ? C.canonOf(g, abs) : null;
    const label = g.movie ? 'Film' : se ? 'Staffel ' + se.season + ' · Folge ' + se.episode : 'Folge ' + abs;
    $('view-dlg').innerHTML = `<div class="vd">
      <div class="vd-head"><span class="vd-ico">${I.calendar}</span><div><h2>Wann gesehen?</h2><p>${esc(g.title)} · ${esc(label)}</p></div></div>
      <div class="vd-list">${list.length ? list.map((t, i) => `<div class="vd-row">
          <span class="vd-n">${i === 0 ? 'Erstes Mal' : (i + 1) + '. Mal'}</span>
          <input type="datetime-local" data-vi="${i}" value="${toInput(t)}">
          <button type="button" class="icon-btn" data-vdel="${i}" title="Entfernen">${I.trash}</button></div>`).join('')
        : '<p class="muted">Noch kein Datum gespeichert.</p>'}</div>
      <button type="button" class="btn tonal vd-add" data-vadd>${I.add}${list.length ? 'Nochmal gesehen' : 'Datum hinzufügen'}</button>
      <p class="muted small">Schaust du etwas erneut bis zum Ende, trägt NINA das neue Datum selbst ein.</p>
      <div class="vd-foot">
        ${g.edited && g.edited.has(abs) ? '<button type="button" class="text-btn" data-vreset>Automatisch</button>' : ''}<span style="flex:1"></span>
        <button type="button" class="text-btn" data-vcancel>Abbrechen</button>
        <button type="button" class="btn" data-vsave>Speichern</button>
      </div></div>`;
  }
  function readViewInputs() {
    for (const inp of $('view-dlg').querySelectorAll('[data-vi]')) {
      const t = Date.parse(inp.value);
      if (isFinite(t)) viewEdit.list[+inp.dataset.vi] = t;
    }
  }
  function initViewDialog() {
    const dlg = document.createElement('dialog');
    dlg.id = 'view-dlg';
    dlg.className = 'view-dlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === dlg) return dlg.close();
      const t = e.target;
      const g = (viewEdit && viewEdit.show) || curShow();
      if (!g || !viewEdit) return dlg.close();
      if (t.closest('[data-vcancel]')) return dlg.close();
      if (t.closest('[data-vadd]')) { readViewInputs(); viewEdit.list.push(Date.now()); return paintViews(); }
      const del = t.closest('[data-vdel]');
      if (del) { readViewInputs(); viewEdit.list.splice(+del.dataset.vdel, 1); return paintViews(); }
      const abs = viewEdit.abs;
      if (t.closest('[data-vreset]')) {
        dlg.close();
        return patchLog((log) => { for (const a of [g.key, ...(g.aliases || [])]) delete log['ed:' + a + '|' + abs]; });
      }
      if (t.closest('[data-vsave]')) {
        readViewInputs();
        const list = [...new Set(viewEdit.list)].filter((x) => x > 0).sort((a, b) => a - b);
        dlg.close();
        // a date for an episode that isn't watched yet ticks it
        const info = g.absInfo.get(abs);
        if (list.length && !(info && info.status === 'watched')) {
          const se = g.movie ? { season: 1, episode: 1 } : C.canonOf(g, abs);
          if (se) { const it = itemFor(g); patchItem(g, { eps: { ...(it.eps || {}), ['S' + se.season + 'E' + se.episode]: 1 }, epsAt: Date.now() }); }
        }
        patchLog((log) => {
          for (const a of (g.aliases || [])) if (a !== g.key) delete log['ed:' + a + '|' + abs];
          log['ed:' + g.key + '|' + abs] = { v: list };
        });
        snack(list.length > 1 ? list.length + '× gesehen gespeichert' : 'Datum gespeichert');
      }
    });
  }

  function toggleEpisode(g, s, n) {
    const abs = absFor(g, s, n);
    const info = g.absInfo.get(abs);
    const isWatched = info && info.status === 'watched';
    const on = !isWatched;
    const it = itemFor(g);
    const eps = { ...(it.eps || {}) };
    const k = 'S' + s + 'E' + n;
    eps[k] = on ? 1 : 0;
    patchItem(g, { eps, epsAt: Date.now() });
    logTicks(g, [[s, n]], on);
    render(true);
  }
  // the whole season (or every episode on screen) at once: all watched → back to unwatched
  function toggleSeason(g, list, allWatched) {
    const it = itemFor(g);
    const eps = { ...(it.eps || {}) };
    for (const e of list) {
      const k = 'S' + e.season + 'E' + e.number;
      eps[k] = allWatched ? 0 : 1;
    }
    patchItem(g, { eps, epsAt: Date.now() });
    snack(allWatched ? 'Staffel wieder auf ungesehen' : list.length + ' Folgen als gesehen markiert');
    logTicks(g, list.map((e) => [e.season, e.number]), !allWatched);
    render(true);
  }

  // ── AniList (optional, only when switched on) ─────────────────────────
  async function anilistId(g) {
    if (g.ref && g.ref.startsWith('anilist:')) return +g.ref.split(':')[1];
    const cache = (await getLocal(['nina_library_alref'])).nina_library_alref || {};
    const k = C.norm(g.name);
    if (k in cache) return cache[k] || null;
    const hit = await P.lookup(g.name, 'crunchyroll', ['anilist']).catch(() => null);
    await patchMap('nina_library_alref', { [k]: hit ? hit.id : 0 });
    return hit ? hit.id : null;
  }
  async function pushAnilist(g, what) {
    if (!settings.anilistSync) return;
    const animeLike = g.platforms.some((p) => p.platform === 'crunchyroll') || (g.ref || '').startsWith('anilist:') ||
      /anime|animation/i.test(((g.meta && g.meta.genres) || []).join(' '));
    if (!animeLike) return;
    const id = await anilistId(g);
    if (!id) return;
    const data = { mediaId: id };
    if (what.status) data.status = AL_STATUS[what.status];
    if (what.rating) data.score = what.rating * 2;
    chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op: 'save', data }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) snack('AniList: ' + ((res && res.error) || 'nicht verbunden – unter NINA-Einstellungen → AniList anmelden'));
      else snack('Auch auf AniList gespeichert');
    });
  }

  // ── Small builders ─────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const art = (g, extra = '') => g.poster
    ? `<div class="art has-img" style="--h:${g.hue}">${extra}<img src="${esc(posterUrl(g.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
    : `<div class="art" style="--h:${g.hue}">${extra}<div class="shape"><span>${esc((g.title.trim()[0] || '?').toUpperCase())}</span></div></div>`;
  const pfChip = (g) => g.platforms.length
    ? g.platforms.slice(0, 2).map((p) => `<span class="pf-chip" style="color:${PLATFORMS[p.platform].color}">${esc(PLATFORMS[p.platform].name)}</span>`).join(' ') + (g.platforms.length > 2 ? ` <span class="pf-chip">+${g.platforms.length - 2}</span>` : '')
    : `<span class="pf-chip">${esc((g.meta && g.meta.network) || (g.item && g.item.network) || 'Eigene Liste')}</span>`;
  function wave(frac) {
    const w = 240, done = Math.max(0, Math.min(1, frac)) * w;
    let d = 'M2 6';
    for (let x = 2; x <= done; x += 4) d += ` L${x} ${6 + Math.sin(x / 6) * 3}`;
    return `<svg class="wave" viewBox="0 0 ${w} 12" preserveAspectRatio="none"><path class="track" d="M${Math.min(w - 2, done + 8)} 6 H${w - 2}"/>${done > 2 ? `<path class="bar" d="${d}"/>` : ''}</svg>`;
  }
  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = Math.round((Date.now() - ts) / 864e5);
    return d <= 0 ? 'heute' : d === 1 ? 'gestern' : d < 7 ? 'vor ' + d + ' Tagen' : new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  };
  const fmtNext = (at) => {
    const d = new Date(at), today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 864e5);
    const day = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
    const time = d.getHours() || d.getMinutes() ? ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    return day + time;
  };
  const progressText = (g) => {
    if (g.movie) return g.watched ? 'Gesehen' : g.started ? 'Angefangen' : 'Film';
    let base = g.total ? Math.min(g.watched, g.total) + '/' + g.total + ' Folgen' : g.watched + ' gesehen' + (g.started ? ' · ' + g.started + ' angefangen' : '');
    if (g.movies && g.movies.length) {
      base += ' · ' + (g.movies.length === 1 ? '1 Film' : g.movies.length + ' Filme');
    }
    return base;
  };
  // "2. Durchlauf: 5/24 Folgen" · "Komplett 2× gesehen" · when last seen
  function rewatchLine(g) {
    const bits = [];
    if (!g.movie && g.status === 'rewatching') {
      const pass = Math.max(1, g.runs) + 1;
      const n = [...g.views.values()].filter((v) => v.length >= pass).length;
      bits.push(`<b>${I.repeat}${pass}. Durchlauf${g.total ? ': ' + n + '/' + g.total + ' Folgen' : n ? ': ' + n + ' Folgen' : ''}</b>`);
    }
    if (g.runs > 1) bits.push(`<b>${I.check}${g.movie ? '' : 'Komplett '}${g.runs}× gesehen</b>`);
    if (g.lastViewAt) bits.push('<span>Zuletzt gesehen ' + esc(fmtDay(g.lastViewAt)) + '</span>');
    return bits.length ? `<p class="rewatch-line">${bits.join('')}</p>` : '';
  }
  function lastText(g) {
    if (g.lastMovie && g.lastMovie.lastAt > (g.lastSeriesAt || 0)) {
      return 'Film · ' + g.lastMovie.title;
    }
    const l = g.last;
    if (!l) return '';
    return [l.season && l.episode ? 'S' + l.season + ' · F' + l.episode : '', l.title].filter(Boolean).join(' · ') || 'Zuletzt geschaut';
  }
  function snack(text) {
    const s = $('snackbar');
    s.textContent = text;
    s.classList.add('show');
    clearTimeout(snack.t);
    snack.t = setTimeout(() => s.classList.remove('show'), 2600);
  }
  function upcoming(days = 30) {
    const now = Date.now() - 6 * 3600e3, until = Date.now() + days * 864e5;
    return shows.filter((g) => g.meta && g.meta.next && g.meta.next.at >= now && g.meta.next.at <= until && g.status !== 'dropped')
      .sort((a, b) => a.meta.next.at - b.meta.next.at);
  }

  // ── Pages ──────────────────────────────────────────────────────────────
  const PAGES = {
    home() {
      const going = shows.filter((g) => (g.status === 'watching' || g.status === 'rewatching') && g.last).sort((a, b) => b.lastAt - a.lastAt).slice(0, 10);
      const recent = shows.filter((g) => g.watched || g.started).sort((a, b) => b.lastAt - a.lastAt);
      const wl = shows.filter((g) => g.wl && !g.watched && !g.started);
      const soon = upcoming(14).slice(0, 6);
      return `<div class="page">
        <section class="section" style="margin-top:8px">
          <div class="section-head"><h2 class="title-l">Weiterschauen</h2><a class="text-btn" href="#library">Alle anzeigen</a></div>
          ${going.length ? `<div class="carousel">${going.map(contCard).join('')}</div>`
            : `<div class="empty"><div class="big">${I.movie}</div>Noch nichts angefangen. Schau etwas auf einem der Anbieter – NINA merkt es sich hier.</div>`}
        </section>

        <section class="section">
          <div class="section-head"><h2 class="title-l">Bald neu</h2><a class="text-btn" href="#calendar">Kalender</a></div>
          ${soon.length ? `<div class="carousel">${soon.map(nextCard).join('')}</div>`
            : `<div class="empty">Keine neuen Folgen in den nächsten 14 Tagen bekannt. Füge laufende Serien hinzu, dann erscheinen ihre nächsten Folgen hier.</div>`}
        </section>

        ${wl.length ? `<section class="section"><div class="section-head"><h2 class="title-l">Merkliste</h2><span class="muted">noch nicht angefangen</span></div><div class="grid">${wl.slice(0, 12).map(gridCard).join('')}</div></section>` : ''}

        <section class="section">
          <div class="section-head"><h2 class="title-l">Zuletzt gesehen</h2></div>
          ${recent.length ? `<div class="grid">${recent.slice(0, 12).map(gridCard).join('')}</div>` : ''}
        </section>
      </div>`;
    },

    library() {
      const q = libQuery.trim().toLowerCase();
      let list = shows
        .filter((g) => libPlatform === 'all' || (libPlatform === 'own' ? !g.platforms.length : g.platforms.some((x) => x.platform === libPlatform)))
        .filter((g) => libFilter === 'all' || (libFilter === 'wl' ? g.wl : libFilter === 'wlnew' ? g.wl && !g.watched && !g.started : g.status === libFilter))
        .filter((g) => !q || g.title.toLowerCase().includes(q) || g.name.toLowerCase().includes(q) || (g.movies && g.movies.some((m) => m.title.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))));
      const sorters = {
        recent: (a, b) => b.updatedAt - a.updatedAt,
        name: (a, b) => a.title.localeCompare(b.title, 'de'),
        progress: (a, b) => b.watched - a.watched
      };
      list = list.sort(sorters[settings.sort] || sorters.recent);
      const count = (k) => shows.filter((g) => (k === 'wl' ? g.wl : k === 'wlnew' ? g.wl && !g.watched && !g.started : g.status === k)).length;
      const statusChips = [['all', 'Alle'], ...ORDER.map((k) => [k, STATUS[k]]), ['wl', 'Merkliste']];
      const pfButtons = ['all', ...Object.keys(PLATFORMS), 'own'].map((p) =>
        `<button class="chip ${libPlatform === p ? 'on' : ''}" data-pf="${p}">${p === 'all' ? 'Alle Quellen' : p === 'own' ? 'Selbst hinzugefügt' : esc(PLATFORMS[p].name)}</button>`).join('');
      return `<div class="page">
        <div class="page-head"><h1 class="headline">Bibliothek</h1><button class="btn tonal" data-act="search">${I.add}Hinzufügen</button></div>
        <div class="toolbar">
          <label class="searchbox"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input id="lib-q" type="search" placeholder="In deiner Bibliothek suchen" value="${esc(libQuery)}"></label>
          <select class="select" id="lib-sort">
            <option value="recent">Zuletzt</option><option value="name">Name</option><option value="progress">Meiste Folgen</option>
          </select>
        </div>
        <div class="chips" style="margin-bottom:10px">
          ${statusChips.map(([k, l]) => `<button class="chip ${libFilter === k ? 'on' : ''}" data-f="${k}">${l}${k !== 'all' ? ` <span class="cnt">${count(k)}</span>` : ''}</button>`).join('')}
          ${libFilter === 'wl' || libFilter === 'wlnew' ? `<button class="chip ${libFilter === 'wlnew' ? 'on' : ''}" data-f="${libFilter === 'wlnew' ? 'wl' : 'wlnew'}">nur Unangefangene</button>` : ''}
        </div>
        <div class="chips" style="margin-bottom:22px">${pfButtons}</div>
        <p class="muted" style="margin:-8px 0 16px">${list.length} von ${shows.length} Titeln</p>
        ${list.length ? `<div class="grid">${list.map(gridCard).join('')}</div>`
          : `<div class="empty"><div class="big">${I.tv}</div>${shows.length ? 'Keine Treffer.' : 'Deine Bibliothek ist noch leer.'}<br><button class="btn" style="margin-top:16px" data-act="search">${I.add}Hinzufügen</button></div>`}
      </div>`;
    },

    calendar() {
      const list = upcoming(30);
      const byDay = new Map();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (const g of list) {
        const k = new Date(g.meta.next.at).toDateString();
        if (!byDay.has(k)) byDay.set(k, { at: g.meta.next.at, shows: [] });
        byDay.get(k).shows.push(g);
      }
      return `<div class="page">
        <div class="page-head">
          <div>
            <h1 class="headline">Kalender</h1>
            <span class="muted">${list.length} anstehende Folgen in den nächsten 30 Tagen</span>
          </div>
        </div>
        ${list.length ? [...byDay.values()].map((day) => {
          const d = new Date(day.at);
          const dMidnight = new Date(d); dMidnight.setHours(0, 0, 0, 0);
          const dayDiff = Math.round((dMidnight - today) / 864e5);
          const isToday = dayDiff === 0;
          const isTomorrow = dayDiff === 1;
          const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
          const month = d.toLocaleDateString('de-DE', { month: 'short' });
          return `
          <div class="cal-day">
            <div class="cal-date ${isToday ? 'today' : isTomorrow ? 'tomorrow' : ''}">
              <span class="cal-day-num">${d.getDate()}</span>
              <div class="cal-day-meta">
                <span>${esc(weekday)}</span>
                <span>${esc(month)}</span>
              </div>
              ${isToday ? '<span class="cal-tag today">Heute</span>' : isTomorrow ? '<span class="cal-tag tomorrow">Morgen</span>' : ''}
            </div>
            <div class="cal-list">${day.shows.map((g) => {
              const next = g.meta.next;
              const nextD = new Date(next.at);
              const timeStr = nextD.getHours() || nextD.getMinutes()
                ? nextD.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
                : '';
              const pfObj = g.platforms.length ? PLATFORMS[g.platforms[0].platform] : null;
              const pfLabel = pfObj ? pfObj.name : (g.meta && g.meta.network) || (g.item && g.item.network) || '';
              return `
              <div class="cal-item" data-show="${esc(g.key)}" title="${esc(g.title)}">
                <div class="cal-poster">
                  ${g.poster ? `<img src="${esc(posterUrl(g.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="cal-ph" style="--h:${g.hue}">${esc((g.title[0] || '?').toUpperCase())}</span>`}
                </div>
                <div class="cal-content">
                  <div class="cal-top-row">
                    ${timeStr ? `<span class="cal-time">${I.clock}${esc(timeStr)}</span>` : '<span></span>'}
                    ${pfLabel ? `<span class="cal-pf" title="${esc(pfLabel)}">${esc(pfLabel)}</span>` : ''}
                  </div>
                  <div class="cal-title">${esc(g.title)}</div>
                  <div class="cal-bottom-row">
                    <span class="cal-ep-badge">${next.season ? 'S' + next.season + ' · ' : ''}Folge ${next.episode}</span>
                    ${next.name ? `<span class="cal-ep-title" title="${esc(next.name)}">${esc(next.name)}</span>` : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}</div>
          </div>`;
        }).join('')
        : `<div class="empty"><div class="big">${I.calendar}</div>Keine anstehenden Folgen bekannt.<br>Laufende Serien in deiner Bibliothek erscheinen hier mit ihren nächsten Folgen.<br><button class="btn" style="margin-top:16px" data-act="search">${I.add}Hinzufügen</button></div>`}
      </div>`;
    },

    stats() {
      const eps = shows.flatMap((g) => [...g.absInfo.values()]);
      const watchedEps = shows.flatMap((g) => {
        const isImportedShow = !!(g.item && (g.item.imported || g.item.fromAnilist || String(g.item.ref || '').startsWith('anilist:')));
        return [...g.absInfo.values()].filter((e) => {
          if (e.status !== 'watched') return false;
          if (e.passive || e.imported || e.platform === 'anilist') return false;
          if (isImportedShow && e.platform === 'manual') return false;
          return true;
        });
      });

      // Total episodes watched
      const totalWatched = shows.reduce((n, g) => n + g.watched, 0);

      // Estimated watch time
      let totalMinutes = 0;
      for (const g of shows) {
        if (!g.watched) continue;
        const rt = (g.meta && g.meta.runtime) || (g.movie ? 100 : 24);
        totalMinutes += g.watched * rt;
      }
      const totalHours = Math.round(totalMinutes / 60);
      const days = Math.floor(totalHours / 24);
      const remHours = totalHours % 24;
      const timeStr = days > 0 ? `${days} T. ${remHours} Std.` : `${totalHours} Std.`;

      // Status counts & completion
      const count = (s) => shows.filter((g) => g.status === s).length;
      const doneCount = count('done');
      const watchedCount = shows.filter((g) => g.watched > 0).length;
      const completionRate = shows.length ? Math.round((doneCount / shows.length) * 100) : 0;

      // Platform stats
      const perPf = {};
      for (const g of shows) for (const p of g.platforms) perPf[p.platform] = (perPf[p.platform] || 0) + p.watched;
      const allPfs = Object.keys(PLATFORMS);
      const totalPfWatched = allPfs.reduce((acc, p) => acc + (perPf[p] || 0), 0);
      const sortedPfs = allPfs.slice().sort((a, b) => (perPf[b] || 0) - (perPf[a] || 0));

      // Weekday activity (last 8 weeks)
      const wd = [0, 0, 0, 0, 0, 0, 0];
      for (const e of watchedEps) {
        if (Date.now() - (e.updatedAt || 0) < 56 * 864e5) {
          wd[(new Date(e.updatedAt).getDay() + 6) % 7]++;
        }
      }
      const maxWd = Math.max(1, ...wd);
      const wdNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
      const wdShort = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      const peakDayIdx = wd.indexOf(Math.max(...wd));
      const peakDayName = Math.max(...wd) > 0 ? wdNames[peakDayIdx] : 'Noch keine Daten';

      // Ratings breakdown (1 to 5 stars)
      const ratedShows = shows.filter((g) => g.rating && g.rating > 0);
      const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let ratingSum = 0;
      for (const g of ratedShows) {
        const r = Math.min(5, Math.max(1, Math.round(g.rating)));
        ratingCounts[r]++;
        ratingSum += g.rating;
      }
      const avgScore = ratedShows.length ? (ratingSum / ratedShows.length).toFixed(1) : '–';

      // Genres
      const genres = {};
      for (const g of shows) for (const x of (g.meta && g.meta.genres) || []) genres[x] = (genres[x] || 0) + 1;
      const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const gmax = Math.max(1, ...topGenres.map((x) => x[1]));

      // Smart Highlights / Records
      const longestShow = shows.slice().filter((g) => g.watched > 0).sort((a, b) => b.watched - a.watched)[0] || null;
      const lastDoneShow = shows.slice().filter((g) => g.status === 'done').sort((a, b) => (b.completedAt || b.lastAt || 0) - (a.completedAt || a.lastAt || 0))[0] || null;
      const topFavShow = shows.slice().filter((g) => (g.item && g.item.fav) || g.rating === 5).sort((a, b) => b.watched - a.watched)[0] || null;
      const activeShow = shows.slice().filter((g) => g.status === 'watching').sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))[0] || null;

      const highlights = [
        longestShow ? { tag: '🏆 Meiste Folgen', tagBg: 'rgba(245, 158, 11, .15)', tagCol: '#f59e0b', show: longestShow, sub: `${longestShow.watched.toLocaleString('de-DE')} Folgen gesehen` } : null,
        lastDoneShow ? { tag: '✓ Zuletzt beendet', tagBg: 'rgba(61, 209, 111, .15)', tagCol: '#3dd16f', show: lastDoneShow, sub: `Beendet ${lastDoneShow.completedAt ? fmtDate(lastDoneShow.completedAt) : 'kürzlich'}` } : null,
        topFavShow ? { tag: '★ Top-Favorit', tagBg: 'rgba(245, 179, 1, .15)', tagCol: '#f5b301', show: topFavShow, sub: `5 Sterne · ${topFavShow.watched} Folgen` } : null,
        activeShow ? { tag: '▶ Zuletzt geschaut', tagBg: 'rgba(0, 168, 225, .15)', tagCol: '#00a8e1', show: activeShow, sub: activeShow.lastAt ? fmtDate(activeShow.lastAt) : 'Aktiv' } : null
      ].filter(Boolean);

      return `<div class="page stats-page">
        <div class="page-head"><h1 class="headline">Statistik &amp; Übersicht</h1></div>

        <!-- 1. Hero KPI Cards -->
        <div class="stats-hero-grid">
          <div class="stats-hero-card">
            <div class="stats-hero-icon" style="background:rgba(0,168,225,.12);color:#00a8e1">${I.clock}</div>
            <div class="stats-hero-info">
              <span class="stats-hero-label">Gesamte Watchtime</span>
              <b class="stats-hero-val">${timeStr}</b>
              <span class="stats-hero-sub">≈ ${totalHours.toLocaleString('de-DE')} Stunden Streaming</span>
            </div>
          </div>
          <div class="stats-hero-card">
            <div class="stats-hero-icon" style="background:rgba(168,85,247,.12);color:#a855f7">${I.tv}</div>
            <div class="stats-hero-info">
              <span class="stats-hero-label">Gesehene Folgen</span>
              <b class="stats-hero-val">${totalWatched.toLocaleString('de-DE')}</b>
              <span class="stats-hero-sub">aus ${watchedCount} gestreamten Serien &amp; Filmen</span>
            </div>
          </div>
          <div class="stats-hero-card">
            <div class="stats-hero-icon" style="background:rgba(61,209,111,.12);color:#3dd16f">${I.check}</div>
            <div class="stats-hero-info">
              <span class="stats-hero-label">Abschlussquote</span>
              <b class="stats-hero-val">${completionRate}%</b>
              <span class="stats-hero-sub">${doneCount} von ${shows.length} Titeln abgeschlossen</span>
            </div>
          </div>
        </div>

        <!-- 2. Status Breakdown -->
        <div class="stats-section-title">Status deiner Bibliothek</div>
        <div class="stats-status-grid">
          ${ORDER.map((k) => {
            const c = count(k);
            const pct = shows.length ? Math.round((c / shows.length) * 100) : 0;
            return `<div class="stats-status-card ${k}">
              <div class="stats-status-top">
                <span class="stats-status-badge ${k}">${BADGE[k]}</span>
                <span class="stats-status-pct">${pct}%</span>
              </div>
              <div class="stats-status-count">${c}</div>
              <div class="stats-status-bar"><i style="width:${pct}%"></i></div>
            </div>`;
          }).join('')}
        </div>

        <!-- 3. Split Grid: Weekdays & Ratings -->
        <div class="stats-split-grid">
          <div class="stats-panel">
            <div class="stats-panel-head">
              <h2 class="title-m">Aktivität nach Wochentagen</h2>
              <span class="stats-highlight-pill">Höhepunkt: ${esc(peakDayName)}</span>
            </div>
            <p class="muted small" style="margin:0 0 12px">Gesehene Folgen der letzten 8 Wochen</p>
            <div class="stats-weekday-chart">
              ${wd.map((n, i) => {
                const isPeak = n > 0 && n === Math.max(...wd);
                const hPct = Math.round((n / maxWd) * 100);
                return `<div class="stats-weekday-col ${isPeak ? 'peak' : ''}">
                  <span class="stats-bar-count">${n > 0 ? n : ''}</span>
                  <div class="stats-bar-track"><i style="height:${hPct}%"></i></div>
                  <span class="stats-bar-label">${wdShort[i]}</span>
                </div>`;
              }).join('')}
            </div>
          </div>

          <div class="stats-panel">
            <div class="stats-panel-head">
              <h2 class="title-m">Bewertungen &amp; Score</h2>
              <div class="stats-avg-badge">${I.star} <b>${avgScore}</b> <small>/ 5.0</small></div>
            </div>
            <p class="muted small" style="margin:0 0 12px">${ratedShows.length} ${ratedShows.length === 1 ? 'Serie bewertet' : 'Serien bewertet'}</p>
            <div class="stats-ratings-list">
              ${[5, 4, 3, 2, 1].map((stars) => {
                const c = ratingCounts[stars];
                const pct = ratedShows.length ? Math.round((c / ratedShows.length) * 100) : 0;
                return `<div class="stats-rating-row">
                  <div class="stats-rating-stars">
                    ${[1, 2, 3, 4, 5].map((s) => `<span class="${s <= stars ? 'on' : ''}">${I.star}</span>`).join('')}
                  </div>
                  <div class="stats-rating-bar"><i style="width:${pct}%"></i></div>
                  <div class="stats-rating-val"><b>${c}</b> <small class="muted">(${pct}%)</small></div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- 4. Platforms -->
        <div class="stats-panel">
          <div class="stats-panel-head">
            <h2 class="title-m">Streaming-Dienste</h2>
            <span class="stats-highlight-pill">${totalPfWatched.toLocaleString('de-DE')} Folgen erfasst</span>
          </div>
          ${totalPfWatched > 0 ? `
            <div class="stats-platform-track">
              ${sortedPfs.filter((p) => (perPf[p] || 0) > 0).map((p) => {
                const share = ((perPf[p] / totalPfWatched) * 100).toFixed(1);
                return `<div class="stats-pf-segment" style="width:${share}%;background:${PLATFORMS[p].color}" title="${esc(PLATFORMS[p].name)}: ${share}%"></div>`;
              }).join('')}
            </div>` : ''}
          <div class="stats-platform-grid">
            ${sortedPfs.map((p) => {
              const c = perPf[p] || 0;
              const share = totalPfWatched > 0 ? Math.round((c / totalPfWatched) * 100) : 0;
              return `<div class="stats-platform-card ${c > 0 ? 'active' : 'idle'}">
                <div class="stats-pf-header">
                  <span class="stats-pf-dot" style="background:${PLATFORMS[p].color}"></span>
                  <span class="stats-pf-name">${esc(PLATFORMS[p].name)}</span>
                </div>
                <div class="stats-pf-count"><b>${c.toLocaleString('de-DE')}</b> <small>Folgen</small></div>
                <span class="stats-pf-share muted">${share}% Anteil</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- 5. Genres -->
        <div class="stats-panel">
          <div class="stats-panel-head">
            <h2 class="title-m">Beliebteste Genres</h2>
            <span class="stats-highlight-pill">${topGenres.length} Genres im Ranking</span>
          </div>
          ${topGenres.length ? `
            <div class="stats-genre-grid">
              ${topGenres.map(([n, c], idx) => {
                const pct = Math.round((c / gmax) * 100);
                return `<div class="stats-genre-item">
                  <div class="stats-genre-top">
                    <span class="stats-genre-rank">#${idx + 1}</span>
                    <span class="stats-genre-name">${esc(n)}</span>
                    <span class="stats-genre-count">${c} <small class="muted">Titel</small></span>
                  </div>
                  <div class="stats-genre-bar"><i style="width:${pct}%"></i></div>
                </div>`;
              }).join('')}
            </div>`
            : '<div class="empty">Genres erscheinen, sobald Infos zu deinen Serien geladen sind.</div>'}
        </div>

        <!-- 6. Highlights & Rekorde -->
        ${highlights.length ? `
          <div class="stats-panel">
            <div class="stats-panel-head">
              <h2 class="title-m">Highlights &amp; Rekorde</h2>
            </div>
            <div class="stats-highlights-grid">
              ${highlights.map((hl) => `
                <div class="stats-hl-card" data-show="${esc(hl.show.key)}" title="Klicken, um Serie zu öffnen">
                  <div class="stats-hl-art">
                    ${hl.show.poster ? `<img src="${esc(posterUrl(hl.show.poster))}" alt="" loading="lazy">` : `<div class="stats-hl-ph">${I.tv}</div>`}
                  </div>
                  <div class="stats-hl-body">
                    <span class="stats-hl-tag" style="background:${hl.tagBg};color:${hl.tagCol}">${hl.tag}</span>
                    <div class="stats-hl-title">${esc(hl.show.title)}</div>
                    <div class="stats-hl-sub">${esc(hl.sub)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>` : ''}

        <!-- 7. Jahresrückblick Placeholder -->
        <div class="stats-panel">
          <div class="stats-panel-head">
            <h2 class="title-m">Jahresrückblick <span class="soon" style="vertical-align:middle;margin-left:8px">Kommt bald</span></h2>
          </div>
          <div class="ph-grid">${[1, 2, 3].map(() => '<div class="ph-card"><div class="sk" style="width:50%"></div><div class="sk"></div><div class="sk" style="width:70%"></div></div>').join('')}</div>
        </div>
      </div>`;
    },

    settings() {
      const seg = (key, opts) => `<div class="segmented" data-set="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const sw = (path, on) => `<label class="switch"><input type="checkbox" data-sw="${path}" ${on ? 'checked' : ''}><span></span></label>`;
      return `<div class="page" style="max-width:820px">
        <div class="page-head"><h1 class="headline">Einstellungen</h1></div>

        <div class="set-group"><h3>Erscheinungsbild</h3>
          <div class="set-row"><div class="txt">Design<small>Hell, dunkel oder wie Windows</small></div>${seg('theme', [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']])}</div>
          <div class="set-row"><div class="txt">Akzentfarbe<small>Alle Farben der Seite werden daraus abgeleitet (Material You)</small></div></div>
          <div class="set-row" style="padding-top:0"><div class="swatches">${SEEDS.map((s) => `<button class="swatch ${settings.seed === s.h ? 'on' : ''}" style="--h:${s.h}" data-seed="${s.h}" title="${s.name}"></button>`).join('')}</div></div>
          <div class="set-row"><div class="txt">Animationen reduzieren<small>Weniger Bewegung, keine federnden Übergänge</small></div>${sw('reduceMotion', settings.reduceMotion)}</div>
        </div>

        <div class="set-group"><h3>Status</h3>
          <div class="set-row"><div class="txt">Automatisch auf „Pausiert“<small>Wenn du so lange nicht weitergeschaut hast. „Abgebrochen“ stellst du selbst ein, alle anderen erkennt NINA von allein.</small></div>${seg('pauseDays', [[14, '2 Wo.'], [30, '1 Mon.'], [60, '2 Mon.'], [90, '3 Mon.'], [180, '6 Mon.']])}</div>
        </div>

        <div class="set-group"><h3>AniList</h3>
          <div class="set-row"><div class="account"><span class="logo" style="background:#02a9ff">AL</span><div class="txt">Mit AniList verknüpfen<small>Aus, solange du es nicht einschaltest: Alles bleibt in NINA. Ist es an, werden Status und Bewertung von Animes (und gesehene Folgen auf den Streaming-Seiten) zusätzlich auf AniList eingetragen.</small></div></div><span style="flex:1"></span>${sw('anilistSync', settings.anilistSync)}</div>
          <div class="set-row">
            <div class="txt">AniList in NINA importieren<small>Alle deine Animes (Schauend, Abgeschlossen, Geplant etc.) direkt in die NINA-Bibliothek laden</small></div>
            <button class="btn tonal" id="al-lib-import-btn">Jetzt importieren</button>
          </div>
          <div id="al-lib-import-box" class="set-row" style="flex-direction:column;align-items:stretch;gap:8px" hidden>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
              <span id="al-lib-import-txt" class="muted">Lade AniList-Liste …</span>
              <b id="al-lib-import-pct" style="color:var(--primary)">0%</b>
            </div>
            <div style="height:6px;border-radius:3px;background:var(--outline-variant);overflow:hidden">
              <div id="al-lib-import-bar" style="height:100%;width:0;background:var(--primary);transition:width .25s"></div>
            </div>
          </div>
          <div class="set-row"><div class="txt">AniList-Konto<small>Anmelden oder trennen</small></div><button class="btn tonal" data-open="cat-anilist">In NINA verwalten</button></div>
        </div>

        <div class="set-group"><h3>Auf den Streaming-Seiten</h3>
          <div class="set-row"><div class="txt">Schilder auf Postern<small>„Gesehen“, „3/12“, „Merkliste“ … bei allem, was in deiner Bibliothek ist</small></div>${sw('siteBadges', settings.siteBadges)}</div>
          <div class="set-row"><div class="txt">NINA-Karte über den Folgen<small>Status, Fortschritt und Sterne direkt auf der Serienseite ändern</small></div>${sw('siteCard', settings.siteCard)}</div>
        </div>

        <div class="set-group"><h3>Datenquellen für Serien-Infos</h3>
          ${Object.entries(PROVIDERS).map(([p, d]) => `<div class="set-row"><div class="account"><span class="logo" style="background:${d.color}">${d.name.slice(0, 2).toUpperCase()}</span><div class="txt">${d.name}<small>${d.desc}</small></div></div><span style="flex:1"></span>${sw('providers.' + p, settings.providers[p])}</div>`).join('')}
          <div class="set-row"><div class="txt">TMDB-API-Schlüssel<small>Kostenlos nach Anmeldung unter <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener" style="color:var(--primary)">themoviedb.org → Einstellungen → API</a>. „API Key“ oder „API Read Access Token“ einfügen.</small>
            <div style="display:flex;gap:8px;margin-top:10px"><input class="field" id="tmdb-key" type="password" placeholder="Schlüssel einfügen" value="${esc(settings.tmdbKey)}" autocomplete="off" spellcheck="false"><button class="btn tonal" id="tmdb-test">Prüfen</button></div></div></div>
          <div class="set-row"><div class="txt">Bilder &amp; Infos für erfasste Titel<small>Was NINA beim Schauen erfasst, automatisch bei den Datenquellen suchen (Poster, Folgenzahl, nächste Folge)</small></div>${sw('autoPosters', settings.autoPosters)}</div>
          <div class="set-row"><div class="txt">Cover-Qualität<small>Auf dem Handy und langsamen Netzen sparsamere Auflösung laden, damit alle Cover schnell und zuverlässig erscheinen</small></div>${seg('posterQuality', [['auto', 'Auto (Handy: schnell)'], ['low', 'Sparsam'], ['high', 'Original']])}</div>
          <div class="set-row"><div class="txt">Infos neu laden<small>Gespeicherte Poster und Zuordnungen vergessen und neu suchen</small></div><button class="btn outline" id="refresh-meta">Neu laden</button></div>
        </div>

        <div class="set-group"><h3>Bibliothek</h3>
          <div class="set-row"><div class="txt">Startseite<small>Was beim Öffnen zuerst kommt</small></div>${seg('startPage', [['home', 'Übersicht'], ['library', 'Bibliothek']])}</div>
          <div class="set-row"><div class="txt">Sortierung<small>Standard in der Bibliothek</small></div>${seg('sort', [['recent', 'Zuletzt'], ['name', 'Name'], ['progress', 'Folgen']])}</div>
        </div>

        <div class="set-group"><h3>Erfasste Anbieter</h3>
          ${Object.keys(PLATFORMS).map((p) => `<div class="set-row"><div class="txt">${esc(PLATFORMS[p].name)}<small>Was du auf ${esc(PLATFORMS[p].name)} schaust, hier anzeigen</small></div>${sw('sources.' + p, settings.sources[p] !== false)}</div>`).join('')}
        </div>

        <div class="set-group"><h3>Weitere Konten</h3>
          <div class="set-row"><div class="account"><span class="logo" style="background:#ed1c24">TR</span><div class="txt">Trakt<small>Serien &amp; Filme synchronisieren</small></div></div><span style="flex:1"></span><span class="soon">Kommt bald</span></div>
          <div class="set-row"><div class="account"><span class="logo" style="background:#2e51a2">MAL</span><div class="txt">MyAnimeList<small>Anime-Liste abgleichen</small></div></div><span style="flex:1"></span><span class="soon">Kommt bald</span></div>
        </div>

        <div class="set-group"><h3>Daten</h3>
          <div class="set-row"><div class="txt">Bibliothek exportieren<small>Alle Titel und erfassten Folgen als JSON-Datei</small></div><button class="btn outline" id="export">Exportieren</button></div>
          <div class="set-row"><div class="txt">Google Drive<small>Speichert alles: Listen, Status, Bewertungen, Favoriten, Folgen &amp; wie weit, Sehdaten, Kalender, Filter. ${driveLast && driveLast.at ? 'Zuletzt: ' + new Date(driveLast.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Noch nicht abgeglichen'}</small></div><button class="btn tonal" id="drive-now" ${driveBusy ? 'disabled' : ''}>${driveBusy ? 'Lädt hoch …' : 'Jetzt prüfen &amp; hochladen'}</button></div>
          <div class="set-row"><div class="txt">Erfassung &amp; Sync<small>Was erfasst wird, Google Drive, Schwellwert für „Gesehen“</small></div><button class="btn tonal" data-open="cat-platforms">NINA-Einstellungen</button></div>
        </div>
      </div>`;
    }
  };

  function contCard(g) {
    const l = g.last;
    const frac = l && l.frac != null && l.frac > 0 ? l.frac : (g.total ? Math.min(1, g.watched / g.total) : null);
    return `<article class="cont-card" data-show="${esc(g.key)}">
      ${art(g, `<span class="badge ${g.status}">${BADGE[g.status]}</span>${g.wl ? '<span class="wl-mark" title="Auf der Merkliste">' + I.bookmark + '</span>' : ''}${g.movie ? '<span class="film-mark">Film</span>' : (g.movies && g.movies.length ? '<span class="film-mark series-film-mark">+' + (g.movies.length === 1 ? 'Film' : g.movies.length + ' Filme') + '</span>' : '')}${frac != null ? `<span class="art-bar"><i style="width:${Math.round(frac * 100)}%"></i></span>` : ''}`)}
      <div class="body">
        <div class="t">${esc(g.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lastText(g) || progressText(g))}</div>
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:6px">${pfChip(g)}${g.lastAt ? `<span class="muted" style="font-size:11px">${fmtDate(g.lastAt)}</span>` : ''}</div>
      </div>
    </article>`;
  }
  function nextCard(g) {
    const n = g.meta.next;
    return `<article class="cont-card" data-show="${esc(g.key)}">
      ${art(g, `<span class="badge planned">${I.clock}Bald neu</span>${g.wl ? '<span class="wl-mark" title="Auf der Merkliste">' + I.bookmark + '</span>' : ''}${g.movie ? '<span class="film-mark">Film</span>' : (g.movies && g.movies.length ? '<span class="film-mark series-film-mark">+' + (g.movies.length === 1 ? 'Film' : g.movies.length + ' Filme') + '</span>' : '')}`)}
      <div class="body">
        <div class="t">${esc(g.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.season ? 'S' + n.season + ' · ' : ''}F${n.episode}${n.name ? ' · ' + esc(n.name) : ''}</div>
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:6px">${pfChip(g)}<span class="next-chip" style="font-size:11px">${esc(fmtNext(n.at))}</span></div>
      </div>
    </article>`;
  }
  function gridCard(g) {
    const frac = g.total ? Math.min(1, g.watched / g.total) : null;
    return `<article class="grid-card" data-show="${esc(g.key)}">
      ${art(g, `<span class="badge ${g.status}">${BADGE[g.status]}</span>${g.wl ? '<span class="wl-mark" title="Auf der Merkliste">' + I.bookmark + '</span>' : ''}${g.movie ? '<span class="film-mark">Film</span>' : (g.movies && g.movies.length ? '<span class="film-mark series-film-mark">+' + (g.movies.length === 1 ? 'Film' : g.movies.length + ' Filme') + '</span>' : '')}${frac != null && g.watched ? `<span class="art-bar"><i style="width:${Math.round(frac * 100)}%"></i></span>` : ''}`)}
      <div class="body">
        <div class="t">${esc(g.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">${esc(progressText(g))}</div>
        <div style="margin-top:8px">${pfChip(g)}</div>
      </div>
    </article>`;
  }

  // ── Show page (#show/<key>) ────────────────────────────────────────────
  const fullCache = new Map();    // ref -> full details
  const seasonCache = new Map();  // ref|n -> episodes
  const checked = new Set();      // refs checked against the services since the page opened
  function loadFull(ref) {
    if (!ref || ref.startsWith('local:')) return null;
    if (!checked.has(ref)) {
      checked.add(ref);
      store.get('full/' + ref).then((saved) => {
        // saved details show at once (unless the fresh ones were faster)
        if (saved && saved.f && !(fullCache.get(ref) || {}).live) {
          fullCache.set(ref, { ...saved.f, savedSeasons: saved.s || {} });
          if (page === 'show') render(true);
        }
        refreshFull(ref, saved);
      });
      if (meta[ref]) refreshMeta(ref);   // only titles in the library / tracked ones
    }
    const v = fullCache.get(ref);
    return !v ? 'loading' : v;
  }
  // fetch the details again; only what differs from the saved copy is written / redrawn
  function refreshFull(ref, saved) {
    P.full(ref).then((f) => {
      const { loadSeason, ...rest } = f;
      const plain = { ...rest, lazySeasons: !!loadSeason };   // TMDB loads each season on its own
      const prev = fullCache.get(ref);
      fullCache.set(ref, { ...f, live: true, savedSeasons: (saved && saved.s) || {} });
      if (!saved || !sameJson(saved.f, plain)) {
        store.put('full/' + ref, { f: plain, s: (saved && saved.s) || {}, at: Date.now() });
        if (page === 'show') render(true);
      } else if (!prev || loadSeason) {
        if (page === 'show') render(true);   // seasons can load now
      }
    }).catch((err) => {
      // offline / service down: keep the saved copy if there is one
      if (!fullCache.get(ref)) { fullCache.set(ref, { error: err.message }); if (page === 'show') render(true); }
    });
  }
  // the poster / episode counts / next episode (nina_library_meta) are checked again on open too
  async function refreshMeta(ref) {
    try {
      const fresh = await P.details(ref);
      const old = meta[ref] || {};
      const { fetchedAt, ...oldPlain } = old;
      if (sameJson({ ...oldPlain, ...fresh }, oldPlain)) return;
      meta[ref] = { ...old, ...fresh, fetchedAt: Date.now() };
      chrome.storage.local.set({ [META_KEY]: meta });
      rebuild();
      render(true);
    } catch (_) {}
  }
  function seasonEpisodes(g, full, n) {
    if (!full || full === 'loading' || full.error) return null;
    if (!full.loadSeason && !full.lazySeasons) return (full.episodes || []).filter((e) => e.season === n);
    const k = g.ref + '|' + n;
    const saved = full.savedSeasons && full.savedSeasons[n];
    if (!full.loadSeason) return saved || null;   // saved copy until the fresh details are there
    if (!seasonCache.has(k)) {
      seasonCache.set(k, saved || 'loading');
      full.loadSeason(n).then((eps) => {
        seasonCache.set(k, eps);
        if (saved && sameJson(saved, eps)) return;
        full.savedSeasons = { ...(full.savedSeasons || {}), [n]: eps };
        store.get('full/' + g.ref).then((rec) => rec && store.put('full/' + g.ref, { ...rec, s: { ...(rec.s || {}), [n]: eps } }));
        render(true);
      }).catch(() => { if (!saved) seasonCache.set(k, []); });
    }
    const v = seasonCache.get(k);
    return v === 'loading' ? null : v;
  }
  const STATUS_TEXT = { Running: 'Läuft', Ended: 'Beendet', 'Returning Series': 'Läuft', RELEASING: 'Läuft', FINISHED: 'Beendet', NOT_YET_RELEASED: 'Kommt noch', 'To Be Determined': 'Unklar', 'In Development': 'In Arbeit', Canceled: 'Abgesetzt', CANCELLED: 'Abgesetzt', HIATUS: 'Pause', Released: 'Erschienen' };

  // Direct link to the title at a service: AniList's own links, else the page
  // NINA saw you watch it on, else that service's search for the title.
  const SERVICE_MATCH = { crunchyroll: /crunchyroll/i, prime: /prime|amazon/i, netflix: /netflix/i, disney: /disney/i, joyn: /joyn/i };
  const SEARCH_URLS = [
    [/netflix/i, (q) => 'https://www.netflix.com/search?q=' + q],
    [/prime|amazon/i, (q) => 'https://www.primevideo.com/search/?phrase=' + q],
    [/disney/i, (q) => 'https://www.disneyplus.com/de-de/search/' + q],
    [/joyn/i, (q) => 'https://www.joyn.de/suche?q=' + q],
    [/crunchyroll/i, (q) => 'https://www.crunchyroll.com/de/search?q=' + q],
    [/apple/i, (q) => 'https://tv.apple.com/de/search?term=' + q],
    [/paramount/i, (q) => 'https://www.paramountplus.com/de/search/?q=' + q],
    [/rtl/i, (q) => 'https://plus.rtl.de/suche?q=' + q],
    [/wow|sky/i, (q) => 'https://www.wowtv.de/suche?q=' + q],
    [/youtube/i, (q) => 'https://www.youtube.com/results?search_query=' + q],
    [/zdf/i, (q) => 'https://www.zdf.de/suche?q=' + q],
    [/ard/i, (q) => 'https://www.ardmediathek.de/suche/' + q],
    [/magenta|telekom/i, (q) => 'https://www.magentatv.de/suche?q=' + q]
  ];
  function providerLink(w, g) {
    if (w.direct && w.url) return w.url;
    for (const p of g.platforms) if (SERVICE_MATCH[p.platform] && SERVICE_MATCH[p.platform].test(w.name) && p.url) return p.url;
    const q = encodeURIComponent(g.title);
    const hit = SEARCH_URLS.find(([re]) => re.test(w.name));
    if (hit) return hit[1](q);
    return w.url || 'https://www.google.com/search?q=' + q + '+' + encodeURIComponent(w.name) + '+schauen';
  }

  // ── "Where to watch": one tidy tile per service ───────────────────────────
  // TMDB lists variants of the same service ("Netflix", "Netflix Standard with
  // Ads", "Crunchyroll Amazon Channel" …) — those become one tile.
  const WATCH_RANK = { Streamen: 0, Kostenlos: 0, 'Mit Werbung': 1, Sender: 2, Leihen: 3, Kaufen: 4 };
  const cleanProvider = (n) => String(n || '').replace(/\s+(standard with ads|with ads|mit werbung|premium)$/i, '').replace(/\s+(amazon|apple tv|prime video|amazon prime video) channel$/i, '').trim();
  function tidyWatch(list) {
    const map = new Map();
    for (const w of list) {
      const name = cleanProvider(w.name) || w.name;
      const k = C.norm(name);
      const rank = WATCH_RANK[w.type] ?? 5;
      const cur = map.get(k);
      if (!cur) { map.set(k, { ...w, name, rank, types: [w.type] }); continue; }
      if (!cur.types.includes(w.type)) cur.types.push(w.type);
      if (rank < cur.rank) Object.assign(cur, { ...w, name, rank, types: cur.types, logo: w.logo || cur.logo });
      else if (!cur.logo && w.logo) cur.logo = w.logo;
    }
    for (const w of map.values()) w.types.sort((a, b) => (WATCH_RANK[a] ?? 5) - (WATCH_RANK[b] ?? 5));
    return [...map.values()].sort((a, b) => a.rank - b.rank);
  }

  // ── Start an episode at the service where you watched last ────────────────
  const HOSTS = { crunchyroll: /crunchyroll\.com/i, prime: /primevideo\.com|amazon\./i, disney: /disneyplus\.com/i, joyn: /joyn\.(de|at|ch)/i, netflix: /netflix\.com/i };
  const PAGES_KEY = 'nina_stream_pages';
  const PLAY_KEY = 'nina_play';
  let lastEps = [], lastWatch = [];     // of the show page on screen
  // abs number (1 … N over the whole show) → season / episode as that service numbers them
  function ownEpisode(g, grp, abs) {
    const own = struct[grp.key] || {};
    const seasons = C.metaSeasons(g.meta);
    let left = abs;
    for (let k = 1; k <= 40; k++) {
      const z = own[k] || (seasons.find((s) => s.n === k) || {}).eps;
      if (!z || left <= z) return { season: k, episode: left };
      left -= z;
    }
    return null;
  }
  // → { pf, url, auto?, search? } for the service you watched last (or chosen platform)
  function playTarget(g, e, pagesMap, customPf) {
    const curPf = customPf || (g.item && g.item.platform) || g.platform || (g.platforms.find((p) => PLATFORMS[p.platform]) || {}).platform;
    if (!curPf || !PLATFORMS[curPf]) return null;
    const pf = curPf;
    const grp = (g.groups || []).find((x) => x.platform === pf);
    const abs = C.canonAbs(g, e.season, e.number);
    const seasons = C.metaSeasons(g.meta);
    const own = grp ? (struct[grp.key] || {}) : {};
    // 1) played there before: that very link
    const seen = g.entries.find((en) => en.platform === pf && en.url && en.episode && C.absOf(en.season, en.episode, own, seasons) === abs);
    if (seen) return { pf, url: seen.url };
    // 2) the data source knows a link at this service (AniList: Crunchyroll episodes)
    if (e.url && HOSTS[pf] && HOSTS[pf].test(e.url)) return { pf, url: e.url };
    // a partner service (lib/partner-bg.js): the last page you watched there
    if (!HOSTS[pf]) { const last = g.platforms.find((p) => p.platform === pf); return last && last.url ? { pf, url: last.url } : null; }
    // 3) NINA has seen the show page there: its episode link, else the page and
    //    the streaming tab clicks the episode itself
    if (pf !== 'crunchyroll' && grp) {
      const oe = ownEpisode(g, grp, abs);
      const pg = pagesMap[grp.key];
      if (pg && oe) {
        const direct = pg.eps && pg.eps[oe.season + ':' + oe.episode];
        if (direct) return { pf, url: direct };
        const base = (pg.urls && pg.urls[oe.season]) || pg.url;
        if (base) return { pf, url: base, auto: { platform: pf, name: C.norm(grp.name), season: oe.season, episode: oe.episode } };
      }
    }
    // 4) nothing known yet: that service's search
    const hit = SEARCH_URLS.find(([re]) => re.test(PLATFORMS[pf].name));
    return hit ? { pf, url: hit[1](encodeURIComponent(g.title)), search: true } : null;
  }
  async function playEpisode(g, key, customPf) {
    const [s, n] = key.split(':').map(Number);
    const e = lastEps.find((x) => x.season === s && x.number === n) || { season: s, number: n };
    const pagesMap = (await getLocal([PAGES_KEY]))[PAGES_KEY] || {};
    const t = playTarget(g, e, pagesMap, customPf);
    const open = (url) => chrome.tabs.create({ url });
    if (!t) {
      const w = tidyWatch(lastWatch)[0];
      if (!w) return snack('Noch bei keinem Anbieter geschaut – schau die Serie einmal dort an, dann startet NINA sie direkt.');
      snack('Noch bei keinem Anbieter geschaut – ich öffne ' + w.name + '.');
      return open(providerLink(w, g));
    }
    const name = PLATFORMS[t.pf] ? PLATFORMS[t.pf].name : t.pf;
    if (t.search) snack('Seite von ' + name + ' noch unbekannt – ich öffne die Suche. Öffne die Serie dort einmal, dann startet NINA direkt.');
    else snack('S' + s + ' · F' + n + ' bei ' + name + ' …');
    if (t.auto) chrome.storage.local.set({ [PLAY_KEY]: { ...t.auto, until: Date.now() + 90e3 } }, () => open(t.url));
    else open(t.url);
  }

  function availablePlatforms(g, f) {
    const map = new Map();
    for (const p of g.platforms) {
      if (p && p.platform) {
        const info = PLATFORMS[p.platform] || { name: p.platform.charAt(0).toUpperCase() + p.platform.slice(1), color: '#7c5cff' };
        map.set(p.platform, { id: p.platform, name: info.name, color: info.color || '#7c5cff' });
      }
    }
    for (const grp of g.groups || []) {
      if (grp.platform && !map.has(grp.platform)) {
        const info = PLATFORMS[grp.platform] || { name: grp.platform.charAt(0).toUpperCase() + grp.platform.slice(1), color: '#7c5cff' };
        map.set(grp.platform, { id: grp.platform, name: info.name, color: info.color || '#7c5cff' });
      }
    }
    if (f && f.watch && f.watch.list) {
      for (const w of f.watch.list) {
        const match = Object.keys(PLATFORMS).find((k) => SERVICE_MATCH[k] && SERVICE_MATCH[k].test(w.name));
        if (match && !map.has(match)) {
          map.set(match, { id: match, name: PLATFORMS[match].name, color: PLATFORMS[match].color || w.color || '#7c5cff' });
        }
      }
    }
    if (!map.size) {
      for (const k of Object.keys(PLATFORMS)) {
        map.set(k, { id: k, name: PLATFORMS[k].name, color: PLATFORMS[k].color || '#7c5cff' });
      }
    }
    return [...map.values()];
  }

  function renderFranchiseMovies(g) {
    if (!g.movies || !g.movies.length) {
      return '<div class="empty">Keine Filme zu dieser Serie vorhanden.</div>';
    }
    return `<div class="fmc-list">
      ${g.movies.map((m) => {
        const mf = loadFull(m.ref);
        const mFull = mf && mf !== 'loading' && !mf.error ? mf : null;
        const mm = m.meta || {};
        const year = mm.year || (mFull && mFull.year) || (m.item && m.item.year) || '';
        const runtime = (mm.runtime || (mFull && mFull.runtime)) ? (mm.runtime || mFull.runtime) + ' Min.' : '';
        const studio = (mm.network && mm.network !== 'Film') ? mm.network : ((mFull && mFull.network) || '');
        const fsk = mm.certification || mm.fsk || (mFull && mFull.certification) || mm.ageRating || '';
        const score = mm.score || (mFull && mFull.score) ? '★ ' + (mm.score || mFull.score) : '';
        const metaBits = [year, runtime, studio, fsk, score].filter(Boolean);
        const summary = (mFull && mFull.summary) || mm.summary || '';
        const mPfs = availablePlatforms(m, mFull);
        const mActivePf = (m.item && m.item.platform) || m.platform || (mPfs[0] && mPfs[0].id) || null;
        const mPfInfo = mActivePf ? (PLATFORMS[mActivePf] || mPfs[0]) : null;

        return `<div class="fmc-card ${m.watched ? 'watched' : ''}" data-movie-open="${esc(m.key)}" title="Film-Seite öffnen">
          <div class="fmc-poster">
            ${m.poster ? `<img src="${esc(posterUrl(m.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : art(m)}
            <span class="film-mark">Film</span>
          </div>
          <div class="fmc-content">
            <div class="fmc-top-row">
              <div class="fmc-title-group">
                <h3 class="fmc-title">${esc(m.title)}</h3>
                ${metaBits.length ? `<div class="fmc-meta-row">${metaBits.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
              </div>
            </div>
            ${summary ? `<p class="fmc-summary">${esc(summary)}</p>` : ''}
            <div class="fmc-action-row">
              <button type="button" class="btn ${m.watched ? '' : 'tonal'}" data-act="toggle-movie-seen" data-movie-key="${esc(m.key)}">
                ${m.watched ? I.check + 'Gesehen' : 'Als gesehen markieren'}
              </button>
              ${seenLine(m, 1, !!m.watched, m.key)}
              <button type="button" class="btn tonal fmc-stream-btn" data-play-movie="${esc(m.key)}" title="Film ansehen">
                ${I.play}<span>${mPfInfo ? 'Bei ' + esc(mPfInfo.name) + ' ansehen' : 'Ansehen'}</span>
              </button>
              ${mm.url ? `<a class="icon-btn" href="${esc(mm.url)}" target="_blank" rel="noopener" title="Online öffnen">${I.open}</a>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function areMoviesRelated(m1, m2) {
    if (!m1 || !m2) return false;
    if (m1.key && m2.key && m1.key === m2.key) return false;
    if (m1.ref && m2.ref && m1.ref === m2.ref) return false;

    const m1Meta = m1.meta || {};
    const m2Meta = m2.meta || {};
    if (m1Meta.relations && m2.ref) {
      if (m1Meta.relations.some((r) => r && (r.ref === m2.ref || r.id === m2.ref || r.id === (m2.item && m2.item.id)))) return true;
    }
    if (m2Meta.relations && m1.ref) {
      if (m2Meta.relations.some((r) => r && (r.ref === m1.ref || r.id === m1.ref || r.id === (m1.item && m1.item.id)))) return true;
    }

    const t1s = [m1.title, m1.name, m1Meta.name, ...((m1Meta && m1Meta.altNames) || []), ...(m1.names || [])].filter(Boolean);
    const t2s = [m2.title, m2.name, m2Meta.name, ...((m2Meta && m2Meta.altNames) || []), ...(m2.names || [])].filter(Boolean);

    for (const t1 of t1s) {
      const n1 = normTitle(t1);
      if (n1.length < 3) continue;
      const b1 = normTitle(stripSubtitles(t1));

      for (const t2 of t2s) {
        const n2 = normTitle(t2);
        if (n2.length < 3) continue;
        const b2 = normTitle(stripSubtitles(t2));

        if (b1.length >= 4 && b1 === b2) return true;
        if (n2.startsWith(n1) && /^\d+$/.test(n2.slice(n1.length))) return true;
        if (n1.startsWith(n2) && /^\d+$/.test(n1.slice(n2.length))) return true;
        if (b1.length >= 5 && (n2.startsWith(b1) || b2.startsWith(b1))) return true;
        if (b2.length >= 5 && (n1.startsWith(b2) || b1.startsWith(b2))) return true;
        if (b1.length >= 6 && n2.includes(b1)) return true;
        if (b2.length >= 6 && n1.includes(b2)) return true;

        let pLen = 0;
        const minL = Math.min(n1.length, n2.length);
        while (pLen < minL && n1[pLen] === n2[pLen]) pLen++;
        if (pLen >= 8) return true;
      }
    }
    return false;
  }

  const relatedSearchCache = new Map();

  function getRelatedMovies(g, f) {
    const list = [];
    const seenRefs = new Set();
    const seenTitles = new Set();

    const addPart = (p, source) => {
      if (!p) return;
      const ref = p.ref || (p.id ? 'tmdbmovie:' + p.id : '');
      const title = p.name || p.title || '';
      const normT = normTitle(title);
      if (!normT || seenTitles.has(normT)) return;
      if (ref && seenRefs.has(ref)) return;
      if (ref) seenRefs.add(ref);
      seenTitles.add(normT);

      let inLib = shows.find((s) => (ref && (s.ref === ref || s.key === ref || (s.aliases && s.aliases.includes(ref)))) || normTitle(s.title) === normT || normTitle(s.name) === normT);
      if (!inLib) {
        for (const s of shows) {
          if (s.movies && s.movies.length) {
            const mv = s.movies.find((m) => (ref && (m.ref === ref || m.key === ref || (m.aliases && m.aliases.includes(ref)))) || normTitle(m.title) === normT || normTitle(m.name) === normT);
            if (mv) { inLib = mv; break; }
          }
        }
      }
      const isCur = (ref && (ref === g.ref || ref === g.key)) || normT === normTitle(g.title) || (inLib && inLib.key === g.key);

      list.push({
        ref: ref || (inLib && inLib.ref) || '',
        id: p.id,
        title,
        year: p.year || (inLib && inLib.item && inLib.item.year) || (inLib && inLib.meta && inLib.meta.year) || null,
        poster: p.poster || (inLib && inLib.poster) || '',
        score: p.score || (inLib && inLib.rating) || null,
        summary: p.summary || (inLib && inLib.meta && inLib.meta.summary) || '',
        type: p.type || 'movie',
        relationType: p.relationType || null,
        isCurrent: isCur,
        inLib: inLib || null,
        watched: inLib ? !!inLib.watched : false,
        source: source || 'collection'
      });
    };

    // 1. Official collection parts from online provider (TMDB / AniList)
    if (f && f.collection && f.collection.parts) {
      for (const p of f.collection.parts) addPart(p, 'collection');
    }

    // 2. Matching movies from user's library
    for (const s of shows) {
      if (s.key !== g.key && s.movie && areMoviesRelated(s, g)) {
        addPart({ ref: s.ref, title: s.title, year: (s.meta && s.meta.year) || (s.item && s.item.year), poster: s.poster, score: s.rating, type: 'movie' }, 'library');
      }
    }

    // 3. Recommendations / similar from provider
    if (f && f.recommendations) {
      for (const p of f.recommendations) addPart(p, 'recommendations');
    }

    // 4. Online search fallback for the base franchise title
    const baseName = stripSubtitles(g.title || g.name || '');
    if (list.length < 2 && baseName.length >= 3) {
      if (!relatedSearchCache.has(baseName)) {
        relatedSearchCache.set(baseName, 'loading');
        P.search(baseName, enabledProviders()).then((res) => {
          const hits = (res.results || []).filter((r) => r.type === 'movie' || areMoviesRelated(r, g));
          for (const r of (res.results || [])) searchCache.set(r.ref, r);
          relatedSearchCache.set(baseName, hits);
          if (page === 'show') render(true);
        }).catch(() => relatedSearchCache.set(baseName, []));
      } else {
        const cached = relatedSearchCache.get(baseName);
        if (Array.isArray(cached)) {
          for (const p of cached) addPart(p, 'search');
        }
      }
    }

    // Ensure the current movie is also included in the list if there are other parts
    if (list.length && !list.some((x) => x.isCurrent)) {
      list.unshift({
        ref: g.ref,
        title: g.title,
        year: (g.meta && g.meta.year) || (g.item && g.item.year),
        poster: g.poster,
        score: g.rating,
        summary: (g.meta && g.meta.summary) || '',
        type: 'movie',
        isCurrent: true,
        inLib: g,
        watched: !!g.watched,
        source: 'current'
      });
    }

    // Sort: chronological by release year
    list.sort((a, b) => {
      const ya = a.year || 9999;
      const yb = b.year || 9999;
      return ya - yb;
    });

    return list;
  }

  function renderRelatedMoviesSection(g, f) {
    const related = getRelatedMovies(g, f);
    if (!related.length) return '';

    const otherCount = related.filter((m) => !m.isCurrent).length;
    if (!otherCount) return '';

    const colName = (f && f.collection && f.collection.name) ? f.collection.name : 'Filmreihe & Fortsetzungen';

    return `<section class="section movie-collection-section">
      <div class="movie-collection-head">
        <div>
          <h2 class="title-l">${esc(colName)}</h2>
          <span class="muted">${related.length} Filme in dieser Reihe</span>
        </div>
      </div>
      <div class="rel-movie-scroll">
        ${related.map((m, idx) => {
          const isCur = m.isCurrent;
          const inLib = m.inLib;
          const isWatched = inLib && inLib.watched;
          const isWl = inLib && inLib.wl && !inLib.watched;
          const cardTarget = inLib ? inLib.key : m.ref;

          return `<div class="rel-movie-card ${isCur ? 'current' : ''} ${isWatched ? 'watched' : ''}" data-rel-show="${esc(cardTarget)}" data-rel-ref="${esc(m.ref)}" data-rel-title="${esc(m.title)}" title="${esc(m.title)}">
            <div class="rel-movie-poster">
              ${m.poster ? `<img src="${esc(posterUrl(m.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rel-movie-ph">${I.movie}</div>`}
              <span class="rel-movie-num">${idx + 1}</span>
              ${isCur ? '<span class="rel-badge-cur">Aktuell</span>' : ''}
              ${isWatched ? '<span class="rel-badge-status done">' + I.check + 'Gesehen</span>' : isWl ? '<span class="rel-badge-status wl">' + I.bookmark + 'Merkliste</span>' : ''}
            </div>
            <div class="rel-movie-body">
              <h4 class="rel-movie-title">${esc(m.title)}</h4>
              <div class="rel-movie-meta">
                ${m.year ? `<span>${m.year}</span>` : '<span></span>'}
                ${m.score ? `<span class="score">${I.star}${esc(m.score)}</span>` : ''}
              </div>
              ${!inLib
                ? `<button type="button" class="btn tonal small rel-add-btn" data-act="add-rel-movie" data-ref="${esc(m.ref)}" data-title="${esc(m.title)}">${I.add}Merkliste</button>`
                : `<span class="rel-in-lib-hint">${isCur ? 'Dieser Film' : isWatched ? '✓ Gesehen' : 'In Bibliothek'}</span>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }

  // The library entry behind a #show/<key>: a series / film of its own, a film grouped under a series
  // (it gets its own page, like a stand-alone film), or – by alias – the series a film belongs to.
  function findShowByKey(key) {
    const exact = shows.find((x) => x.key === key || x.ref === key);
    if (exact) return exact;
    for (const sh of shows) {
      const mv = (sh.movies || []).find((m) => m.key === key || m.ref === key);
      if (mv) return mv;
    }
    const viaAlias = shows.find((x) => x.aliases.includes(key));
    if (viaAlias) return viaAlias;
    for (const sh of shows) {
      const mv = (sh.movies || []).find((m) => m.aliases && m.aliases.includes(key));
      if (mv) return mv;
    }
    return null;
  }

  function showPage(key) {
    const g = findShowByKey(key);
    if (!g) return `<div class="page"><div class="empty"><div class="big">${I.search}</div>Dieser Titel ist nicht (mehr) in deiner Bibliothek.<br><a class="btn" style="margin-top:16px;display:inline-flex;align-items:center" href="#library">Zur Bibliothek</a></div></div>`;
    const m = g.meta || {};
    // opened just to look (search hit / related film): nothing saved yet, so no status is shown
    const isPreview = !!(g.item && g.item.preview);
    const full = loadFull(g.ref);
    const f = full && full !== 'loading' && !full.error ? full : null;
    const seasons = g.movie ? [] : (f && f.seasons.length ? f.seasons : (m.seasons || []).map((s) => s.n));
    const hasMovies = !!(g.movies && g.movies.length);
    const openedAsMovie = hasMovies && g.movies.some((mk) => mk.key === key || mk.ref === key || (mk.aliases && mk.aliases.includes(key)));

    if (openedAsMovie && showSeason == null) {
      showSeason = 'movies';
    } else if (showSeason === 'movies' && !hasMovies) {
      showSeason = seasons[0] || 1;
    } else if (showSeason !== 'all' && showSeason !== 'movies' && !seasons.includes(showSeason)) {
      const cur = g.last && g.last.season;
      showSeason = seasons.includes(cur) ? cur : seasons[0] || 1;
    }

    let eps = null;
    if (showSeason !== 'movies') {
      if (showSeason === 'all') {
        const parts = seasons.map((n) => seasonEpisodes(g, f, n));
        eps = parts.every(Boolean) ? parts.flat() : null;
      } else eps = seasonEpisodes(g, f, showSeason);
    }
    lastEps = eps || [];
    lastWatch = f ? f.watch.list : [];
    const stateOf = (e) => g.absInfo.get(C.canonAbs(g, e.season, e.number));
    const pfs = availablePlatforms(g, f);
    const activePf = (g.item && g.item.platform) || g.platform || (pfs[0] && pfs[0].id) || 'crunchyroll';
    const activePfInfo = pfs.find((p) => p.id === activePf) || PLATFORMS[activePf] || (pfs[0] ? pfs[0] : null);
    const nowAt = activePfInfo;
    const seasonLabel = (n) => (n === 'all' ? 'Alle Folgen' : 'Staffel ' + n + (seasonInfo(n) && seasonInfo(n).eps ? ' · ' + seasonInfo(n).eps + ' Folg.' : ''));
    const watchedIn = eps ? eps.filter((e) => { const i = stateOf(e); return i && i.status === 'watched'; }).length : 0;
    const moviesWatched = hasMovies ? g.movies.filter((mv) => mv.watched).length : 0;
    const rating = g.rating, fav = g.fav;
    const statusLine = m.status ? (STATUS_TEXT[m.status] || m.status) : '';
    const summary = (f && f.summary) || m.summary || '';
    const backdrop = (f && f.backdrop) || g.poster;
    const seasonInfo = (n) => (m.seasons || []).find((s) => s.n === n);

    const altNames = [...new Set([
      ...(g.names || []),
      ...((m && m.altNames) || []),
      ...((aliases && aliases[g.key]) || [])
    ])].filter((n) => n && typeof n === 'string' && n.trim().toLowerCase() !== (g.title || '').trim().toLowerCase() && n.trim().toLowerCase() !== (g.name || '').trim().toLowerCase());

    const yearStr = m.endYear && m.endYear !== m.year ? `${m.year} – ${m.endYear}` : (m.year ? `${m.year}` : '');
    let seasonCountStr = g.movie ? 'Film' : (m.seasons && m.seasons.length ? m.seasons.length + (m.seasons.length === 1 ? ' Staffel' : ' Staffeln') : (m.totalEpisodes ? m.totalEpisodes + ' Folg.' : ''));
    if (!g.movie && hasMovies) {
      const movieCountStr = g.movies.length === 1 ? '1 Film' : g.movies.length + ' Filme';
      seasonCountStr = seasonCountStr ? seasonCountStr + ' · ' + movieCountStr : movieCountStr;
    }
    const netStr = m.network && m.network !== 'Film' ? m.network : '';
    const metaText = [yearStr, seasonCountStr, netStr].filter(Boolean).join(' · ');
    const fsk = m.certification || m.fsk || (f && f.certification) || m.ageRating || '';
    const ratingsHtml = f && f.ratings && f.ratings.length
      ? f.ratings.map((r) => `<a class="meta-badge rating-badge" ${r.url ? `href="${esc(r.url)}" target="_blank" rel="noopener"` : ''}><b>${esc(r.label)}</b> ${r.value === '↗' ? I.open : esc(r.value)}</a>`).join('')
      : m.score ? `<span class="meta-badge rating-badge"><b>${I.star}</b> ${esc(m.score)}</span>` : '';
    const seenProgressText = g.movie
      ? (g.watched ? 'Gesehen' : g.started ? 'Angefangen' : 'Film')
      : g.watched
        ? (g.total ? `${g.watched}/${g.total} Folgen gesehen` : `${g.watched} ${g.watched === 1 ? 'Folge' : 'Folgen'} gesehen`)
        : (g.total ? `0/${g.total} gesehen` : 'Noch nichts gesehen');

    return `<div class="page show-page">
      ${backdrop ? `<div class="show-backdrop"><img src="${esc(backdropUrl(backdrop))}" alt="" referrerpolicy="no-referrer"></div>` : ''}
      <button type="button" class="text-btn back-btn" data-act="back">${I.back}Zurück</button>
      <div class="show-top">
        <div class="show-poster">
          ${g.poster ? `<img src="${esc(posterUrl(g.poster))}" alt="" referrerpolicy="no-referrer">` : art(g)}
        </div>

        <div class="show-main">
          <h1 class="show-title">${esc(g.title)}</h1>
          ${altNames.length ? `<div class="show-alt-titles">${esc(altNames.join(', '))}</div>` : ''}
          <div class="show-meta">
            ${metaText ? `<span>${esc(metaText)}</span>` : ''}
            ${fsk ? `<span class="meta-badge fsk">${esc(fsk)}</span>` : ''}
            ${statusLine ? `<span class="meta-badge state ${/Läuft|Kommt/.test(statusLine) ? 'live' : ''}">${esc(statusLine)}</span>` : ''}
            ${(m.languages || (f && f.languages) || []).map((l) => `<span class="meta-badge lang">${esc(l)}</span>`).join('')}
            ${ratingsHtml}
          </div>

          ${(m.genres || []).length ? `<div class="genre-chips">${(m.genres || []).map((gn) => `<span class="genre-pill">${esc(gn)}</span>`).join('')}</div>` : ''}

          ${summary ? `<div class="show-summary-box">
            <p class="show-summary ${summaryOpen ? 'open' : ''}">${esc(summary)}</p>
            ${summary.length > 240 ? `<button class="more-btn" data-act="summary">${summaryOpen ? 'Weniger anzeigen ' + I.chevUp : 'Mehr anzeigen ' + I.chev}</button>` : ''}
          </div>` : ''}

          <div class="show-controls">
            <div class="show-action-row">
              <div class="status-dd">
                <button class="status-btn ${isPreview ? 'planned' : g.status}" data-act="status-menu" title="Status ändern">${isPreview ? 'Status wählen' : esc(STATUS[g.status])} <span class="chev">${I.chev}</span></button>
                <div class="status-menu" id="status-menu" hidden>
                  ${ORDER.map((k) => `<button class="${!isPreview && g.status === k ? 'on' : ''}" data-status="${k}">${STATUS[k]}</button>`).join('')}
                  <hr><button class="auto ${!isPreview && g.auto ? 'on' : ''}" data-status="auto">Automatisch erkennen</button>
                </div>
              </div>
              <div class="action-bar">
                <button class="act ${g.wl ? 'on' : ''}" data-act="wl" title="${g.wl ? 'Von der Merkliste nehmen' : 'Auf die Merkliste'}"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg></button>
                ${m.url ? `<a class="act" href="${esc(m.url)}" target="_blank" rel="noopener" title="Auf ${esc(PROVIDERS[m.provider === 'tmdbmovie' ? 'tmdb' : m.provider] ? PROVIDERS[m.provider === 'tmdbmovie' ? 'tmdb' : m.provider].name : 'Quelle')} öffnen">${I.open}</a>` : ''}
                ${f && f.trailer ? `<a class="act" href="${esc(f.trailer)}" target="_blank" rel="noopener" title="Trailer"><svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zm-5-6-7 4V7z"/></svg></a>` : ''}
                <div class="act-menu">
                  <button class="act" data-act="menu" title="Mehr"><svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg></button>
                  <div class="menu" id="show-menu" hidden>
                    ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${I.open}Auf ${esc(PROVIDERS[m.provider === 'tmdbmovie' ? 'tmdb' : m.provider] ? PROVIDERS[m.provider === 'tmdbmovie' ? 'tmdb' : m.provider].name : 'Quelle')} öffnen</a>` : ''}
                    ${g.item && !g.platforms.length ? `<button data-remove="${esc(g.item.ref)}">${I.trash}Aus Bibliothek entfernen</button>` : ''}
                    ${!m.url && !(g.item && !g.platforms.length) ? '<span class="muted" style="padding:10px 14px">Keine weiteren Aktionen</span>' : ''}
                  </div>
                </div>
              </div>
              <div class="rate-row">
                ${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= rating ? 'on' : ''}" data-rate="${n}" title="${n} von 5">${I.star}</button>`).join('')}
                <button class="heart ${fav ? 'on' : ''}" data-act="fav" title="Favorit">${I.heart}</button>
              </div>
              <div class="seen-pill" title="Fortschritt"><span class="seen-dot"></span><span>${esc(seenProgressText)}</span></div>
            </div>
            <p class="status-hint">${isPreview ? 'Vorschau · noch nicht in deiner Bibliothek – nichts gespeichert' : g.auto ? 'Status automatisch erkannt · gespeichert in NINA' : 'Status von dir gesetzt · gespeichert in NINA'}</p>
            ${rewatchLine(g)}
          </div>

          ${g.platforms.length ? `<div class="seen-list">${g.platforms.map((p, i) => `
              <a class="seen-on ${i === 0 ? 'now' : ''}" ${p.url ? `href="${esc(p.url)}" target="_blank" rel="noopener"` : ''} style="--pf:${PLATFORMS[p.platform].color}">
                <span class="dot"></span>${i === 0 ? '<b>Aktuell auf</b> ' : 'Vorher auf '}${esc(PLATFORMS[p.platform].name)} · ${g.movie ? (p.watched ? 'gesehen' : 'angefangen') : p.watched + (p.watched === 1 ? ' Folge' : ' Folgen') + (p.started ? ', ' + p.started + ' angefangen' : '')} · ${fmtDate(p.updatedAt)}<span class="go">›</span></a>`).join('')}
              ${g.platforms.length > 1 ? `<span class="muted small">Zusammen: ${progressText(g)} – der Fortschritt gilt überall.</span>` : ''}</div>`
            : ''}
        </div>

        <aside class="show-aside">
          <h2 class="title-m aside-h">Wo anzusehen ${f && f.watch.link ? `<a href="${esc(f.watch.link)}" target="_blank" rel="noopener" class="jw">JustWatch ›</a>` : ''}</h2>
          ${!f ? `<div class="watch-grid">${[1, 2, 3].map(() => '<div class="watch-tile sk-tile"></div>').join('')}</div>`
            : f.watch.list.length ? `<div class="watch-grid">${tidyWatch(f.watch.list).slice(0, 9).map((w) => `
              <a class="watch-tile" href="${esc(providerLink(w, g))}" target="_blank" rel="noopener" style="${w.color ? '--wc:' + esc(w.color) : ''}" title="Bei ${esc(w.name)} öffnen (${esc(w.types.join(', '))})">
                ${w.logo ? `<img src="${esc(w.logo)}" alt="" referrerpolicy="no-referrer">` : `<span class="wl">${esc(w.name.slice(0, 1))}</span>`}
                <span class="wn">${esc(w.name)}</span><span class="wt">${esc(w.types[0])}</span>
              </a>`).join('')}</div>${!settings.tmdbKey && m.provider !== 'anilist' ? '<p class="muted small">Mehr Anbieter (Deutschland) mit TMDB-Schlüssel in den Einstellungen.</p>' : ''}`
            : `<p class="muted">Keine Angaben.${!settings.tmdbKey ? ' Mit einem TMDB-Schlüssel (Einstellungen) erscheinen hier die deutschen Streaming-Anbieter.' : ''}</p>`}
          <h2 class="title-m aside-h" style="margin-top:22px">Infos</h2>
          <dl class="facts-list">
            ${m.network && m.network !== 'Film' ? `<dt>${g.platforms.some((p) => p.platform === 'crunchyroll') || m.provider === 'anilist' ? 'Studio' : 'Sender'}</dt><dd>${esc(m.network)}</dd>` : ''}
            ${(m.runtime || (f && f.runtime)) ? `<dt>Laufzeit</dt><dd>${m.runtime || f.runtime} Min.</dd>` : ''}
            ${!g.movie && m.seasons && m.seasons.length ? `<dt>Staffeln</dt><dd>${m.seasons.length}</dd>` : ''}
            ${!g.movie && m.totalEpisodes ? `<dt>Folgen</dt><dd>${m.totalEpisodes}</dd>` : ''}
            ${hasMovies ? `<dt>Filme</dt><dd>${g.movies.length}</dd>` : ''}
            ${m.next && m.next.at > Date.now() - 6 * 3600e3 ? `<dt>Nächste Folge</dt><dd>${m.next.season ? 'S' + m.next.season + ' · ' : ''}F${m.next.episode} – ${esc(fmtNext(m.next.at))}</dd>` : ''}
            ${(m.genres || []).length ? `<dt>Genres</dt><dd>${m.genres.slice(0, 4).map(esc).join(', ')}</dd>` : ''}
          </dl>
        </aside>
      </div>

      <div class="show-columns ${f && f.cast && f.cast.length ? '' : 'no-cast'}">
        <div class="show-column-main">
          ${g.movie ? `<section class="section">
            <div class="section-head"><h2 class="title-l">Film</h2></div>
            ${(() => {
              const rel = getRelatedMovies(g, f);
              return rel.length > 1 ? `<div class="season-tabs movie-series-tabs">
                ${rel.map((m) => `
                  <button class="season-tab ${m.isCurrent ? 'on' : ''}" data-rel-show="${esc(m.inLib ? m.inLib.key : m.ref)}" data-rel-ref="${esc(m.ref)}" data-rel-title="${esc(m.title)}" title="${esc(m.title)}">
                    ${m.isCurrent ? I.play : ''}${esc(m.title)}${m.year ? ' (' + m.year + ')' : ''}${m.watched ? '<span class="tab-check">' + I.check + '</span>' : ''}
                  </button>
                `).join('')}
              </div>` : '';
            })()}
            <div class="movie-seen"><button class="btn ${g.watched ? '' : 'tonal'}" data-ep="1:1" style="height:52px;padding:0 28px">${g.watched ? I.check + 'Gesehen' : 'Als gesehen markieren'}</button>${seenLine(g, 1, !!g.watched)}</div>
            ${(g.views.get(1) || []).length > 1 ? `<ol class="seen-dates">${g.views.get(1).map((t, i) => `<li><b>${i === 0 ? 'Erstes Mal' : (i + 1) + '. Mal'}</b> ${esc(fmtDay(t, true))}</li>`).join('')}</ol>` : ''}
            ${renderRelatedMoviesSection(g, f)}
          </section>` : `
          <section class="section eps-section">
            <div class="section-head season-head-row">
              <div class="season-head-left">
                <h2 class="title-l">${showSeason === 'movies' ? (g.movies.length === 1 ? 'Film' : 'Filme') : showSeason === 'all' ? 'Alle Folgen' : 'Staffel ' + showSeason}${showSeason === 'movies' ? (g.movies.length > 1 ? ' · ' + g.movies.length + ' Filme' : '') : (eps ? ' · ' + eps.length + ' Folgen' : '')}</h2>
                ${showSeason === 'movies' ? `<span class="muted">${moviesWatched}/${g.movies.length} gesehen</span>` : eps ? `<span class="muted">${watchedIn}/${eps.length} gesehen</span>` : ''}
              </div>
              ${showSeason === 'movies'
                ? `<button class="btn ${moviesWatched === g.movies.length ? 'tonal' : ''} season-all" data-act="movies-all-seen">${I.check}${moviesWatched === g.movies.length ? 'Alle Filme gesehen' : (g.movies.length === 1 ? 'Als gesehen markieren' : 'Alle Filme als gesehen markieren')}</button>`
                : (eps && eps.length ? `<button class="btn ${watchedIn === eps.length ? 'tonal' : ''} season-all" data-act="season-all">${I.check}${watchedIn === eps.length ? 'Alle gesehen' : (showSeason === 'all' ? 'Alle als gesehen markieren' : 'Ganze Staffel gesehen')}</button>` : '')}
            </div>

            ${(seasons.length > 0 || hasMovies) ? `<div class="season-tabs">
              ${hasMovies ? `<button class="season-tab ${showSeason === 'movies' ? 'on' : ''}" data-season="movies">Film${g.movies.length > 1 ? 'e' : ''}${g.movies.every((mv) => mv.watched) ? '<span class="tab-check">' + I.check + '</span>' : ''}</button>` : ''}
              ${seasons.map((n) => `<button class="season-tab ${n === showSeason ? 'on' : ''}" data-season="${n}">Staffel ${n}</button>`).join('')}
              ${seasons.length > 1 ? `<button class="season-tab ${showSeason === 'all' ? 'on' : ''}" data-season="all">Alle Folgen</button>` : ''}
            </div>` : ''}
            ${showSeason === 'movies' ? renderFranchiseMovies(g) : (
              !g.ref || g.ref.startsWith('local:') ? `<div class="empty">Für diesen Titel wurden noch keine Online-Infos gefunden. ${settings.autoPosters ? 'Er wird automatisch gesucht, sobald eine Datenquelle aktiv ist.' : ''}</div>`
              : full && full.error ? `<div class="empty">Folgen konnten nicht geladen werden: ${esc(full.error)}<br><button class="btn tonal" style="margin-top:12px" data-act="retry-full" data-ref="${esc(g.ref)}">Erneut versuchen</button></div>`
              : !eps ? `<div class="ep-list ep-row">${[1, 2, 3, 4, 5].map(() => '<div class="ep-card sk-tile"></div>').join('')}</div>`
              : eps.length ? `<div class="ep-list ep-row">${eps.map((e) => {
                  const info = stateOf(e);
                  const stt = info ? info.status : null;
                  const frac = stt === 'watched' ? 1 : info ? info.frac : 0;
                  const abs = C.canonAbs(g, e.season, e.number);
                  const where = info && info.platform && PLATFORMS[info.platform] ? PLATFORMS[info.platform].name : info && info.platform === 'manual' ? 'abgehakt' : '';
                  return `<div class="ep-card ${stt === 'watched' ? 'watched' : stt === 'started' ? 'started' : ''}">
                    <a class="ep-img" href="#play" data-play="${e.season}:${e.number}" title="${nowAt ? 'Bei ' + esc(nowAt.name) + ' ansehen' : 'Ansehen'}">
                      <span class="ep-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
                      ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ep-ph" style="--h:${g.hue}">${backdrop ? `<img class="ep-ph-bg" src="${esc(backdrop)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<i>Folge</i><b>${e.number}</b></span>`}
                      ${e.runtime ? `<span class="rt">${e.runtime} Min.</span>` : ''}
                      ${frac > 0 && frac < 1 ? `<span class="ep-prog"><i style="width:${Math.round(frac * 100)}%"></i></span>` : ''}
                    </a>
                    <div class="ep-info">
                      <div class="t">
                        <a class="et" href="#play" data-play="${e.season}:${e.number}" title="${nowAt ? 'Bei ' + esc(nowAt.name) + ' ansehen' : 'Ansehen'}">${esc(e.title || 'Folge ' + e.number)}</a>
                        <small>${showSeason === 'all' ? 'F' + abs + ' · ' : ''}S${e.season} · F${e.number}${where ? ' · ' + esc(where) : ''}${e.airdate && Date.parse(e.airdate) > Date.now() ? ' · ' + new Date(e.airdate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) : ''}</small>
                        ${seenLine(g, abs, stt === 'watched')}
                      </div>
                    </div>
                    <div class="ep-pf-select">
                      <button type="button" class="ep-pf-btn" data-act="ep-pf-menu" data-ep="${e.season}:${e.number}" title="Streaming-Dienst wählen (aktuell: ${esc(activePfInfo ? activePfInfo.name : 'Standard')})">
                        <span class="pf-dot" style="background:${activePfInfo ? esc(activePfInfo.color) : 'var(--primary)'}"></span>
                        <span class="pf-name">${esc(activePfInfo ? activePfInfo.name : 'Dienst')}</span>
                        <span class="chev">${I.chev}</span>
                      </button>
                      <div class="ep-pf-dropdown" hidden>
                        <div class="ep-pf-dropdown-title">Öffnen mit:</div>
                        ${pfs.map((p) => `
                          <div class="ep-pf-option ${p.id === activePf ? 'on' : ''}" data-set-pf="${p.id}" data-ep="${e.season}:${e.number}">
                            <span class="pf-dot" style="background:${esc(p.color)}"></span>
                            <span class="opt-name">${esc(p.name)}</span>
                            ${p.id === activePf ? `<span class="check-mark">${I.check}</span>` : ''}
                            <button type="button" class="opt-play" data-play-pf="${p.id}" data-play="${e.season}:${e.number}" title="Sofort bei ${esc(p.name)} ansehen"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                    <button class="ep-check" data-ep="${e.season}:${e.number}" title="${stt === 'watched' ? 'Als ungesehen markieren' : 'Als gesehen markieren'}">${I.check}</button>
                  </div>`;
                }).join('')}</div>`
              : '<div class="empty">Keine Folgen bekannt.</div>'
            )}
            ${renderRelatedMoviesSection(g, f)}
          </section>`}
        </div>

        ${f && f.cast.length ? `<aside class="show-column-side">
          <section class="section cast-section">
            <div class="section-head"><h2 class="title-l">Darsteller</h2></div>
            <div class="cast-list">${f.cast.map((c) => `<div class="cast-item">
              ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="cast-ph">${esc((c.name || '?')[0])}</span>`}
              <div class="cast-info"><b>${esc(c.name)}</b><small>${esc(c.role || '')}</small></div>
            </div>`).join('')}</div>
          </section>
        </aside>` : ''}
      </div>
    </div>`;
  }

  // open a dropdown upwards when there is not enough room below it
  function placeMenu(menu, canFlip = true) {
    menu.classList.remove('up');
    const r = menu.getBoundingClientRect();
    const rail = document.querySelector('.rail');
    const rr = rail ? rail.getBoundingClientRect() : null;
    // on narrow windows the nav rail is a bar along the bottom edge that covers the page
    const limit = rr && rr.top > window.innerHeight / 2 ? rr.top : window.innerHeight;
    const room = menu.parentElement.getBoundingClientRect().top;
    if (r.bottom > limit - 8) {
      if (canFlip && room > r.height + 16) menu.classList.add('up');
      else window.scrollBy({ top: r.bottom - limit + 16, behavior: 'smooth' });
    }
  }

  // ── Router / render ────────────────────────────────────────────────────
  // a redraw between press and release swallowed the click (it had to be clicked twice)
  let pressed = false, renderLater = false;
  document.addEventListener('pointerdown', () => { pressed = true; }, true);
  const release = () => {
    if (!pressed) return;
    pressed = false;
    if (renderLater) setTimeout(() => { if (renderLater && !pressed) { renderLater = false; render(true); } }, 120);
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  let lastHtml = '';
  function setMain(html, soft) {
    if (soft && html === lastHtml) return false;   // nothing changed: leave the page alone (hover, images …)
    lastHtml = html;
    $('main').innerHTML = html;
    return true;
  }
  function render(soft) {
    if (soft && pressed) { renderLater = true; return; }
    if (!soft) renderLater = false;
    const hash = decodeURIComponent(location.hash.slice(1));
    const y = window.scrollY;
    if (hash.startsWith('show/')) {
      page = 'show';
      for (const a of document.querySelectorAll('.rail-item')) a.classList.toggle('active', a.dataset.page === 'library');
      const row = document.querySelector('.ep-row');
      const rowX = row ? row.scrollLeft : 0;
      const openMenus = ['status-menu', 'season-menu'].filter((id) => $(id) && !$(id).hidden);
      if (!setMain(showPage(hash.slice(5)), soft)) return;
      if (soft) {
        window.scrollTo(0, y);
        const p = $('main').querySelector('.page'); if (p) p.style.animation = 'none';
        const r2 = document.querySelector('.ep-row'); if (r2) r2.scrollLeft = rowX;
        for (const id of openMenus) if ($(id)) { $(id).hidden = false; placeMenu($(id), id !== 'season-menu'); }
      }
      return;
    }
    page = PAGES[hash] ? hash : settings.startPage;
    for (const a of document.querySelectorAll('.rail-item')) a.classList.toggle('active', a.dataset.page === page);
    // background updates must not rebuild the settings form or a field being typed in
    if (soft && (page === 'settings' || (document.activeElement && document.activeElement.closest('#main input')))) return;
    if (!setMain(PAGES[page](), soft)) return;
    if (soft) { window.scrollTo(0, y); const p = $('main').querySelector('.page'); if (p) p.style.animation = 'none'; }
    if (page === 'library') {
      $('lib-sort').value = settings.sort;
      $('lib-q').addEventListener('input', (e) => { libQuery = e.target.value; const pos = e.target.selectionStart; render(); const i = $('lib-q'); i.focus(); i.setSelectionRange(pos, pos); });
      $('lib-sort').addEventListener('change', (e) => saveSetting('sort', e.target.value));
    }
    if (page === 'settings') $('tmdb-key').addEventListener('change', (e) => saveSetting('tmdbKey', e.target.value.trim()));
  }
  // page changes morph smoothly (View Transitions; the clicked cover grows into the show's poster and shrinks back on return)
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let currentHash = decodeURIComponent(location.hash.slice(1));
  let lastOpenedShowKey = currentHash.startsWith('show/') ? currentHash.slice(5) : null;
  let lastListScrollY = 0;
  let lastListPage = 'library';
  let lastOpenedCardIndex = 0;

  function prepareShowOpen(card) {
    if (!card) return;
    for (const x of document.querySelectorAll('[style*="view-transition-name"]')) x.style.viewTransitionName = '';
    const art = card.querySelector('img, .art, .rel-movie-poster') || card;
    art.style.viewTransitionName = 'nina-cover';
    lastOpenedShowKey = card.dataset.show || card.dataset.relShow;
    lastListScrollY = window.scrollY;
    if (page !== 'show') lastListPage = page;
    const sameKeyCards = Array.from(document.querySelectorAll('[data-show], [data-rel-show]'))
      .filter((el) => (el.dataset.show || el.dataset.relShow) === (card.dataset.show || card.dataset.relShow));
    lastOpenedCardIndex = Math.max(0, sameKeyCards.indexOf(card));
  }

  window.addEventListener('hashchange', () => {
    if ($('search-view') && !$('search-view').hidden) closeSearch();
    const prevHash = currentHash;
    const nextHash = decodeURIComponent(location.hash.slice(1));
    currentHash = nextHash;
    prunePreviews(nextHash);

    const wasOnShow = prevHash.startsWith('show/');
    const isGoingBackFromShow = wasOnShow && !nextHash.startsWith('show/');
    const targetShowKey = wasOnShow ? prevHash.slice(5) : lastOpenedShowKey;

    const go = () => {
      showSeason = null;
      summaryOpen = false;
      render();
      const p = $('main').querySelector('.page');
      if (p) p.style.animation = 'none';

      if (isGoingBackFromShow) {
        if (typeof lastListScrollY === 'number') {
          window.scrollTo(0, lastListScrollY);
        }
        if (targetShowKey) {
          const matchingCards = Array.from(document.querySelectorAll('[data-show], [data-rel-show]'))
            .filter((el) => (el.dataset.show || el.dataset.relShow) === targetShowKey);
          if (matchingCards.length) {
            const card = matchingCards[lastOpenedCardIndex] || matchingCards[0];
            for (const x of document.querySelectorAll('[style*="view-transition-name"]')) {
              x.style.viewTransitionName = '';
            }
            const artEl = card.querySelector('img, .art, .rel-movie-poster') || card;
            artEl.style.viewTransitionName = 'nina-cover';
            card.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
          }
        }
      } else {
        window.scrollTo(0, 0);
      }
      if (isGoingBackFromShow) restoreSearch();
    };

    if (document.startViewTransition && !settings.reduceMotion) {
      const vt = document.startViewTransition(go);
      if (vt && vt.finished) {
        vt.finished.finally(() => {
          for (const x of document.querySelectorAll('[style*="view-transition-name"]')) {
            x.style.viewTransitionName = '';
          }
        });
      }
    } else {
      go();
      for (const x of document.querySelectorAll('[style*="view-transition-name"]')) {
        x.style.viewTransitionName = '';
      }
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const c = e.target.closest && e.target.closest('[data-show], [data-rel-show]');
    if (!c) return;
    prepareShowOpen(c);
  }, true);

  const curShow = () => {
    if (page !== 'show') return null;
    return findShowByKey(decodeURIComponent(location.hash.slice(6)));
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('.rail-item, .rail-brand')) {
      searchReturn = null;
      if ($('search-view') && !$('search-view').hidden) closeSearch();
    }
    if (t.closest('[data-act="search"]')) return openSearch();
    const add = t.closest('[data-add]');
    if (add) {
      const r = searchCache.get(add.dataset.add);
      if (r) { addResult(r); add.outerHTML = '<span class="search-status-in-lib">' + I.check + '<span>Auf der Merkliste</span></span>'; }
      return;
    }
    const addRel = t.closest('[data-act="add-rel-movie"]');
    if (addRel) {
      e.preventDefault();
      e.stopPropagation();
      const ref = addRel.dataset.ref;
      const title = addRel.dataset.title;
      let r = searchCache.get(ref);
      if (!r) {
        const cur = curShow();
        const full = (cur && cur.ref) ? fullCache.get(cur.ref) : null;
        const validFull = full && !(full instanceof Promise) && !full.error ? full : null;
        const rels = cur ? getRelatedMovies(cur, validFull) : [];
        const rel = rels.find((x) => x.ref === ref);
        if (rel) {
          r = { ref: rel.ref, name: rel.title, poster: rel.poster, year: rel.year, network: 'Film', type: 'movie', summary: rel.summary };
        } else {
          r = { ref, name: title || ref, network: 'Film', type: 'movie' };
        }
      }
      addResult(r);
      return render(true);
    }
    const relCard = t.closest('[data-rel-show]');
    if (relCard) {
      const targetKey = relCard.dataset.relShow;
      const ref = relCard.dataset.relRef;
      const title = relCard.dataset.relTitle;
      let target = shows.find((s) => s.key === targetKey || s.ref === targetKey || s.ref === ref || (s.aliases && s.aliases.includes(targetKey)));
      if (!target && ref) {
        let r = searchCache.get(ref);
        if (!r) {
          const cur = curShow();
          const full = (cur && cur.ref) ? fullCache.get(cur.ref) : null;
          const validFull = full && !(full instanceof Promise) && !full.error ? full : null;
          const rels = cur ? getRelatedMovies(cur, validFull) : [];
          const rel = rels.find((x) => x.ref === ref);
          if (rel) {
            r = { ref: rel.ref, name: rel.title, poster: rel.poster, year: rel.year, network: 'Film', type: 'movie', summary: rel.summary };
          } else {
            r = { ref, name: title || ref, network: 'Film', type: 'movie' };
          }
        }
        openPreview(r);
        target = shows.find((s) => s.ref === ref || s.key === ref);
      }
      if ($('search-view') && !$('search-view').hidden) closeSearch();
      prepareShowOpen(relCard);
      const openKey = target ? target.key : (ref || targetKey);
      location.hash = 'show/' + encodeURIComponent(openKey);
      return;
    }
    // an online search hit that is not in the library yet: clicking it opens its page (it goes on the
    // Merkliste first, the show page needs a library entry – same as the related films)
    const hit = t.closest('.search-result-card[data-ref]');
    if (hit && !hit.dataset.show) {
      const ref = hit.dataset.ref;
      const r = searchCache.get(ref);
      if (!items[ref] && r) openPreview(r);
      const target = shows.find((s) => s.ref === ref || s.key === ref);
      leaveSearchForResult();
      location.hash = 'show/' + encodeURIComponent(target ? target.key : ref);
      return;
    }
    // a film card on the series' "Filme" tab opens the film's own page (not its buttons / links)
    const movieCard = t.closest('.fmc-card[data-movie-open]');
    if (movieCard && !t.closest('button, a, [data-act], [data-play-movie]')) {
      location.hash = 'show/' + encodeURIComponent(movieCard.dataset.movieOpen);
      return;
    }
    const card = t.closest('[data-show]');
    if (card) {
      leaveSearchForResult();
      prepareShowOpen(card);
      location.hash = 'show/' + encodeURIComponent(card.dataset.show);
      return;
    }
    // dropdowns close on any click outside them (also before the show-page handlers below return early)
    if (!t.closest('.act-menu') && $('show-menu')) $('show-menu').hidden = true;
    if (!t.closest('.status-dd') && $('status-menu')) $('status-menu').hidden = true;
    if (!t.closest('.season-dd') && $('season-menu')) $('season-menu').hidden = true;
    if (!t.closest('.ep-pf-select')) {
      document.querySelectorAll('.ep-pf-dropdown').forEach((d) => d.hidden = true);
    }
    const cur = curShow();
    if (cur) {
      const playPf = t.closest('[data-play-pf]');
      if (playPf) {
        e.preventDefault();
        e.stopPropagation();
        const pf = playPf.dataset.playPf;
        const key = playPf.dataset.play;
        patchItem(cur, { platform: pf });
        return playEpisode(cur, key, pf);
      }
      const setPf = t.closest('[data-set-pf]');
      if (setPf) {
        e.preventDefault();
        e.stopPropagation();
        const pf = setPf.dataset.setPf;
        patchItem(cur, { platform: pf });
        snack('Streaming-Dienst auf „' + (PLATFORMS[pf] ? PLATFORMS[pf].name : pf) + '“ gesetzt');
        return render(true);
      }
      const pfBtn = t.closest('[data-act="ep-pf-menu"]');
      if (pfBtn) {
        e.preventDefault();
        e.stopPropagation();
        const parent = pfBtn.closest('.ep-pf-select');
        const dd = parent && parent.querySelector('.ep-pf-dropdown');
        if (dd) {
          const isHidden = dd.hidden;
          document.querySelectorAll('.ep-pf-dropdown').forEach((d) => d.hidden = true);
          dd.hidden = !isHidden;
        }
        return;
      }
      const retryFull = t.closest('[data-act="retry-full"]');
      if (retryFull) {
        fullCache.delete(retryFull.dataset.ref);
        checked.delete(retryFull.dataset.ref);
        return render(true);
      }
      if (t.closest('[data-act="back"]')) {
        // javascript: links are blocked on extension pages — this is a normal button
        if (history.length > 1) history.back(); else location.hash = lastListPage || 'library';
        return;
      }
      const play = t.closest('[data-play]');
      if (play) { e.preventDefault(); return playEpisode(cur, play.dataset.play); }
      const playMovie = t.closest('[data-play-movie]');
      if (playMovie) {
        e.preventDefault();
        const mKey = playMovie.dataset.playMovie;
        const targetMovie = (cur.movies || []).find((m) => m.key === mKey) || shows.find((x) => x.key === mKey);
        if (targetMovie) return playEpisode(targetMovie, '1:1');
      }
      const sea = t.closest('[data-season]');
      if (sea) {
        showSeason = sea.dataset.season === 'all' ? 'all' : sea.dataset.season === 'movies' ? 'movies' : +sea.dataset.season;
        return render(true);
      }
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'movies-all-seen' && cur.movies && cur.movies.length) {
          const allSeen = cur.movies.every((m) => m.watched);
          const on = !allSeen;
          for (const m of cur.movies) {
            const it = itemFor(m);
            const eps = { ...(it.eps || {}), S1E1: on ? 1 : 0 };
            items[it.ref] = { ...it, eps, epsAt: Date.now() };
            chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: items[it.ref] });
            logTicks(m, [[1, 1]], on);
          }
          rebuild();
          snack(allSeen ? 'Filme wieder auf ungesehen' : (cur.movies.length === 1 ? 'Film als gesehen markiert' : cur.movies.length + ' Filme als gesehen markiert'));
          return render(true);
        }
        if (a === 'toggle-movie-seen') {
          const mKey = act.dataset.movieKey;
          const targetMovie = (cur.movies || []).find((m) => m.key === mKey) || shows.find((x) => x.key === mKey);
          if (targetMovie) return toggleEpisode(targetMovie, 1, 1);
        }
        if (a === 'season-menu') {
          const mn = $('season-menu');
          mn.hidden = !mn.hidden; $('show-menu').hidden = true; $('status-menu').hidden = true;
          if (!mn.hidden) placeMenu(mn, false);   // lower part of the page: scroll, never flip up over the poster
          return;
        }
        if (a === 'menu') { const mn = $('show-menu'); mn.hidden = !mn.hidden; $('status-menu').hidden = true; return; }
        if (a === 'status-menu') {
          const mn = $('status-menu');
          mn.hidden = !mn.hidden; $('show-menu').hidden = true;
          if (!mn.hidden) placeMenu(mn);
          return;
        }
        if (a === 'summary') { summaryOpen = !summaryOpen; return render(true); }
        if (a === 'season-all' && lastEps.length) {
          const all = lastEps.every((e) => { const i = cur.absInfo.get(C.canonAbs(cur, e.season, e.number)); return i && i.status === 'watched'; });
          return toggleSeason(cur, lastEps, all);
        }
        if (a === 'fav') { patchItem(cur, { fav: !cur.fav }); return render(true); }
        if (a === 'wl') { const on = !cur.wl; patchItem(cur, { wl: on }); snack(on ? 'Auf der Merkliste' : 'Von der Merkliste genommen'); return render(true); }
      }
      const stt = t.closest('[data-status]');
      if (stt) { $('status-menu').hidden = true; setStatus(cur, stt.dataset.status); return render(true); }
      const rate = t.closest('[data-rate]');
      if (rate) {
        const n = +rate.dataset.rate, next = cur.rating === n ? 0 : n;
        patchItem(cur, { rating: next });
        if (next) pushAnilist(cur, { rating: next });
        return render(true);
      }
      const vw = t.closest('[data-views]');
      if (vw) {
        const mKey = vw.dataset.movieKey;
        const target = mKey ? ((cur.movies || []).find((m) => m.key === mKey) || shows.find((x) => x.key === mKey) || cur) : cur;
        const a = vw.dataset.views;
        return openViews(target, /^\d+$/.test(a) ? +a : a);
      }
      const ep = t.closest('[data-ep]');
      if (ep) { const [s, n] = ep.dataset.ep.split(':').map(Number); return toggleEpisode(cur, s, n); }
      const rm = t.closest('[data-remove]');
      if (rm) return removeItem(rm.dataset.remove);
    }
    const f = t.closest('[data-f]');
    if (f) { libFilter = f.dataset.f; saveFilters(); return render(); }
    const pf = t.closest('[data-pf]');
    if (pf) { libPlatform = pf.dataset.pf; saveFilters(); return render(); }
    const segBtn = t.closest('.segmented[data-set] button');
    if (segBtn) {
      const key = segBtn.parentElement.dataset.set;
      return saveSetting(key, key === 'pauseDays' ? +segBtn.dataset.v : segBtn.dataset.v);
    }
    const seed = t.closest('[data-seed]');
    if (seed) return saveSetting('seed', +seed.dataset.seed);
    const open = t.closest('[data-open]');
    if (open) return chrome.tabs.create({ url: chrome.runtime.getURL('ui/options.html#' + open.dataset.open) });
    if (t.closest('#al-lib-import-btn')) return runLibraryAniListImport();
    if (t.closest('#export')) return exportData();
    if (t.closest('#drive-now')) return driveUploadNow();
    if (t.closest('#tmdb-test')) return testTmdb();
    if (t.closest('#refresh-meta')) {
      meta = {}; lookup = { __v: LOOKUP_VER };
      chrome.storage.local.set({ [META_KEY]: {}, [LOOKUP_KEY]: lookup });
      rebuild(); render(); enrich();
      return snack('Infos werden neu geladen …');
    }
  });

  function updateLibImportUI(p) {
    const box = $('al-lib-import-box');
    const txt = $('al-lib-import-txt');
    const pct = $('al-lib-import-pct');
    const bar = $('al-lib-import-bar');
    const btn = $('al-lib-import-btn');
    if (!box) return;
    if (p.running) {
      box.hidden = false;
      if (btn) btn.disabled = true;
      if (txt) txt.textContent = p.message || 'Wird importiert …';
      if (pct) pct.textContent = (p.pct || 0) + '%';
      if (bar) bar.style.width = (p.pct || 0) + '%';
    } else if (p.done) {
      box.hidden = false;
      if (btn) btn.disabled = false;
      if (txt) txt.textContent = p.message || 'Import abgeschlossen!';
      if (pct) pct.textContent = '100%';
      if (bar) bar.style.width = '100%';
      setTimeout(() => { if (box && !p.running) box.hidden = true; }, 4000);
    } else if (p.error) {
      box.hidden = false;
      if (btn) btn.disabled = false;
      if (txt) txt.textContent = 'Fehler: ' + p.error;
    }
  }

  async function runLibraryAniListImport() {
    const btn = $('al-lib-import-btn');
    if (btn) btn.disabled = true;
    updateLibImportUI({ running: true, pct: 5, message: 'Verbinde mit AniList …' });
    chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op: 'importList' }, (res) => {
      if (btn) btn.disabled = false;
      if (chrome.runtime.lastError || !res || !res.ok) {
        const err = (res && res.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Import fehlgeschlagen';
        updateLibImportUI({ running: false, error: err });
        snack('Fehler: ' + err);
        return;
      }
      updateLibImportUI({ running: false, done: true, pct: 100, message: `✓ ${res.result.total} Animes importiert!` });
      snack(`✓ ${res.result.total} Animes erfolgreich in NINA importiert!`);
      load().then(() => { render(true); enrich(); });
    });
  }
  document.addEventListener('change', (e) => {
    const sw = e.target.closest('[data-sw]');
    if (!sw) return;
    const path = sw.dataset.sw.split('.');
    if (path.length === 2) saveSetting(path[0], { ...settings[path[0]], [path[1]]: sw.checked });
    else saveSetting(path[0], sw.checked);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if (e.key === '/' && !e.target.closest('input')) { e.preventDefault(); openSearch(); }
  });

  function saveFilters() {
    settings.libFilter = libFilter;
    settings.libPlatform = libPlatform;
    chrome.storage.sync.set({ [SET_KEY]: settings });
  }
  // "Jetzt prüfen & hochladen": merge with Drive and upload every file (lib/library-drive-sync.js)
  function driveUploadNow() {
    if (driveBusy) return;
    driveBusy = true;
    render();
    chrome.runtime.sendMessage({ type: 'NINA_DRIVE_PULL', force: true }, (res) => {
      void chrome.runtime.lastError;
      driveBusy = false;
      if (!res) snack('Keine Antwort vom Hintergrund – bitte noch mal versuchen');
      else if (res.skipped) snack('Google Drive ist nicht verbunden – in den NINA-Einstellungen anmelden');
      else if (res.error) snack('Drive-Fehler: ' + res.error);
      else {
        driveLast = res;
        snack('Gespeichert: ' + res.items + ' Titel, ' + res.episodes + ' Folgen' + (res.pulled ? ', ' + res.pulled + ' vom anderen Gerät übernommen' : ''));
      }
      render();
    });
  }

  function saveSetting(key, value) {
    settings[key] = value;
    chrome.storage.sync.set({ [SET_KEY]: settings });
    P.setTmdbKey(settings.tmdbKey);
    applyTheme();
    rebuild();
    render();
    if (key === 'providers' || key === 'tmdbKey' || key === 'autoPosters') {
      // titles without a match get another chance with the new sources
      for (const k of Object.keys(lookup)) if (lookup[k] === '') delete lookup[k];
      enrich();
    }
  }

  async function testTmdb() {
    const key = $('tmdb-key').value.trim();
    if (!key) return snack('Bitte zuerst einen Schlüssel einfügen');
    P.setTmdbKey(key);
    try {
      const r = await P.ALL.tmdb.search('Breaking Bad');
      settings.tmdbKey = key;
      settings.providers = { ...settings.providers, tmdb: true };
      saveSetting('tmdbKey', key);
      snack(r.length ? 'TMDB funktioniert' : 'Schlüssel ok, aber keine Treffer');
    } catch (err) {
      P.setTmdbKey(settings.tmdbKey);
      snack('TMDB: ' + (/401/.test(err.message) ? 'Schlüssel ungültig' : err.message));
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(), items: Object.values(items),
      shows: shows.map((s) => ({ name: s.title, status: s.status, watched: s.watched, total: s.total, movie: s.movie, wl: s.wl, rating: s.rating, platforms: s.platforms.map((p) => p.platform) }))
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nina-bibliothek-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    snack('Bibliothek exportiert');
  }

  // ── Search: own library + online ──────────────────────────────────────
  const searchCache = new Map();
  let searchTimer = null, searchSeq = 0;
  // opening a result from the search and coming back (browser back / "Zurück") brings the search back
  // with the same query, results and scroll position
  let searchReturn = null, lastSearchQ = null;
  function leaveSearchForResult() {
    const view = $('search-view');
    if (!view || view.hidden) return;
    const q = $('search-input').value;
    searchReturn = q.trim() ? { q, kind: searchKind, top: view.scrollTop, resTop: $('search-results').scrollTop } : null;
    closeSearch(true);
  }
  function restoreSearch() {
    const r = searchReturn;
    searchReturn = null;
    if (!r) return;
    $('search-view').hidden = false;
    $('search-input').value = r.q;
    searchKind = r.kind;
    const fab = $('fab-search');
    if (fab) fab.classList.add('active');
    renderSearch();
    requestAnimationFrame(() => { $('search-view').scrollTop = r.top; $('search-results').scrollTop = r.resTop; });
  }
  function openSearch() {
    searchReturn = null;
    $('search-view').hidden = false;
    $('search-input').value = '';
    const fab = $('fab-search');
    if (fab) fab.classList.add('active');
    renderSearch();
    setTimeout(() => $('search-input').focus(), 30);
  }
  function closeSearch(keepReturn) {
    if (keepReturn !== true) searchReturn = null;
    $('search-view').hidden = true;
    const fab = $('fab-search');
    if (fab) fab.classList.remove('active');
  }
  function toggleSearch() {
    if (!$('search-view').hidden) closeSearch();
    else openSearch();
  }
  function renderSearch() {
    const q = $('search-input').value.trim();
    const ql = q.toLowerCase();
    const clearBtn = $('search-clear');
    if (clearBtn) clearBtn.style.display = q ? 'grid' : 'none';

    if (!q) {
      const prov = enabledProviders();
      $('search-results').innerHTML = `
        <div class="search-welcome">
          <div class="search-welcome-icon">${I.search}</div>
          <h2 class="search-welcome-title">Was möchtest du finden?</h2>
          <p class="search-welcome-sub">
            Durchsuche deine Serien &amp; Filme oder entdecke neue Titel online bei
            ${prov.length ? prov.map((p) => `<span class="search-prov-pill" style="--pc:${PROVIDERS[p].color}"><span class="dot"></span>${esc(PROVIDERS[p].name)}</span>`).join(' ') : 'deinen Datenquellen'}.
            ${settings.tmdbKey ? '' : '<span class="muted" style="display:block;margin-top:6px;font-size:12.5px">Tipp: Mit einem TMDB-Schlüssel (Einstellungen) findest du auch Filme und noch mehr Serien.</span>'}
          </p>

          <div class="search-suggest-box">
            <span class="search-suggest-label">Schnellsuche nach Genre &amp; Themen</span>
            <div class="search-suggest-tags">
              ${['Anime', 'Action', 'Comedy', 'Fantasy', 'Romance', 'Drama', 'Sci-Fi', 'Horror', 'Mystery'].map((tag) =>
                `<button type="button" class="search-tag-chip" data-search-tag="${tag}">${tag}</button>`
              ).join('')}
            </div>
          </div>

          ${shows.length ? `
            <div class="search-recent-section">
              <div class="search-section-head">
                <div class="search-head-title"><h3 class="title-m">Favoriten in deiner Bibliothek</h3></div>
              </div>
              <div class="search-quick-grid">
                ${shows.filter((g) => g.watched > 0 || (g.item && g.item.fav)).slice(0, 6).map((g) => `
                  <div class="search-quick-card" data-show="${esc(g.key)}" title="${esc(g.title)}">
                    <div class="search-quick-art">
                      ${g.poster ? `<img src="${esc(posterUrl(g.poster))}" alt="" loading="lazy">` : `<div class="search-quick-ph">${I.tv}</div>`}
                    </div>
                    <div class="search-quick-info">
                      <span class="search-quick-title">${esc(g.title)}</span>
                      <span class="search-quick-sub muted">${g.watched} ${g.watched === 1 ? 'Folge' : 'Folgen'} gesehen</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>` : ''}
        </div>`;
      return;
    }

    // films of a franchise are grouped under their series (shows[].movies): they are library entries too
    const hits = (g) => g.title.toLowerCase().includes(ql) || g.name.toLowerCase().includes(ql);
    const own = [];
    for (const g of shows) {
      if (hits(g)) own.push(g);
      for (const m of (g.movies || [])) if (hits(m) && !own.includes(m)) own.push(m);
    }
    $('search-results').innerHTML = `
      ${own.length ? `
        <section class="search-section">
          <div class="search-section-head">
            <div class="search-head-title">
              <h3 class="title-m">In deiner Bibliothek</h3>
              <span class="search-count-pill">${own.length} Treffer</span>
            </div>
          </div>
          <div class="grid">${own.map(gridCard).join('')}</div>
        </section>` : ''}

      <section class="search-section">
        <div class="search-section-head">
          <div class="search-head-title">
            <h3 class="title-m">Online gefunden</h3>
          </div>
          <div class="search-kinds-wrap" id="search-kinds">
            ${[['all', 'Alle'], ['movie', 'Filme'], ['show', 'Serien'], ['anime', 'Anime']].map(([k, t]) =>
              `<button class="search-kind-chip ${searchKind === k ? 'on' : ''}" data-kind="${k}">${t} <span class="cnt"></span></button>`
            ).join('')}
          </div>
        </div>
        <div id="online-results">
          <div class="search-skeleton-list">
            ${[1, 2, 3].map(() => `
              <div class="search-skeleton-card">
                <div class="search-sk-poster"></div>
                <div class="search-sk-body">
                  <div class="search-sk-line title"></div>
                  <div class="search-sk-line meta"></div>
                  <div class="search-sk-line desc"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>`;

    clearTimeout(searchTimer);
    const seq = ++searchSeq;
    if (lastSearch && lastSearchQ === q) { paintOnline(); return; }
    searchTimer = setTimeout(async () => {
      const prov = enabledProviders();
      if (!prov.length) {
        $('online-results').innerHTML = '<p class="muted" style="padding:16px">Keine Datenquelle aktiv – unter Einstellungen → Datenquellen einschalten.</p>';
        return;
      }
      const res = await P.search(q, prov);
      if (seq !== searchSeq || $('search-view').hidden) return;
      lastSearch = res;
      lastSearchQ = q;
      paintOnline();
    }, 450);
  }
  // films / series / anime: the anime come from AniList or are Japanese animation on TMDB
  let searchKind = 'all', lastSearch = null;
  const kindOf = (r) => (r.anime || r.provider === 'anilist' ? 'anime' : r.type === 'movie' ? 'movie' : 'show');
  function paintOnline() {
    const box = $('online-results');
    if (!box || !lastSearch) return;
    const { results: all, errors } = lastSearch;
    for (const r of all) searchCache.set(r.ref, r);
    for (const b of document.querySelectorAll('#search-kinds [data-kind]')) {
      const k = b.dataset.kind;
      b.classList.toggle('on', k === searchKind);
      const cnt = k === 'all' ? all.length : all.filter((r) => kindOf(r) === k).length;
      const el = b.querySelector('.cnt');
      if (el) el.textContent = cnt ? `(${cnt})` : '(0)';
    }
    const results = searchKind === 'all' ? all : all.filter((r) => kindOf(r) === searchKind);
    // the library entry of a hit: a series / film of its own, or a film grouped under a series
    const libEntry = (r) => {
      for (const s of shows) {
        if (s.ref === r.ref) return s;
        const mv = (s.movies || []).find((m) => m.ref === r.ref || (m.aliases && m.aliases.includes(r.ref)));
        if (mv) return mv;
      }
      return null;
    };
    const inLib = (r) => libEntry(r) || items[r.ref];
    const prov2 = (r) => PROVIDERS[r.provider === 'tmdbmovie' ? 'tmdb' : r.provider] || { name: r.provider, color: '#7c5cff' };

    box.innerHTML = (results.length ? `
      <div class="results">
        ${results.map((r) => {
          const pInfo = prov2(r);
          const ownMatch = libEntry(r);
          const isAdded = inLib(r);
          return `
          <div class="search-result-card" data-ref="${esc(r.ref)}" ${ownMatch ? `data-show="${esc(ownMatch.key)}" title="Klicken, um in Bibliothek zu öffnen"` : ''}>
            <div class="search-result-poster">
              ${r.poster ? `<img src="${esc(posterUrl(r.poster))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="search-result-ph" style="--h:${hueOf(r.name)}">${esc((r.name[0] || '?').toUpperCase())}</div>`}
              ${r.score ? `<span class="search-poster-score">${I.star} ${r.score}</span>` : ''}
            </div>
            <div class="search-result-content">
              <div class="search-result-header">
                <div class="search-result-title-group">
                  <h4 class="search-result-title">${esc(r.name)}</h4>
                  <div class="search-result-badges">
                    <span class="search-badge type ${kindOf(r)}">${kindOf(r) === 'movie' ? 'Film' : kindOf(r) === 'anime' ? 'Anime' : 'Serie'}</span>
                    ${r.year ? `<span class="search-badge year">${r.year}</span>` : ''}
                    ${r.network && r.network !== 'Film' ? `<span class="search-badge net">${esc(r.network)}</span>` : ''}
                    ${r.totalEpisodes && r.type !== 'movie' ? `<span class="search-badge eps">${r.totalEpisodes} Folgen</span>` : ''}
                    <span class="search-badge prov" style="color:${pInfo.color}"><span class="dot" style="background:${pInfo.color}"></span>${esc(pInfo.name)}</span>
                  </div>
                </div>
                <div class="search-result-action">
                  ${isAdded
                    ? `<span class="search-status-in-lib">${I.check}<span>In Bibliothek</span></span>`
                    : `<button class="btn tonal search-add-btn" data-add="${esc(r.ref)}">${I.add}<span>Merkliste</span></button>`}
                </div>
              </div>
              ${r.summary ? `<p class="search-result-summary">${esc(r.summary)}</p>` : ''}
              ${r.genres && r.genres.length ? `
                <div class="search-result-genres">
                  ${r.genres.slice(0, 4).map((g) => `<span class="search-genre-tag">${esc(g)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>` : `<p class="muted" style="padding:24px;text-align:center">${all.length ? 'In dieser Kategorie nichts gefunden.' : 'Keine passenden Online-Treffer gefunden.'}</p>`) +
      (errors.length ? `<p class="muted small" style="margin-top:12px">${errors.map(esc).join('<br>')}</p>` : '') +
      (!settings.tmdbKey && searchKind !== 'anime' ? '<p class="muted small" style="margin-top:12px;opacity:.8">Tipp: Für Filme und mehr Serien aktiviere einen kostenlosen TMDB-Schlüssel unter Einstellungen.</p>' : '');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#search-kinds [data-kind]');
    if (b) {
      searchKind = b.dataset.kind;
      paintOnline();
      return;
    }
    const tag = e.target.closest && e.target.closest('[data-search-tag]');
    if (tag) {
      const q = tag.dataset.searchTag;
      $('search-input').value = q;
      $('search-input').focus();
      renderSearch();
      return;
    }
  });
  $('fab-search').addEventListener('click', toggleSearch);
  $('search-close').addEventListener('click', closeSearch);
  $('search-input').addEventListener('input', renderSearch);
  const searchClear = $('search-clear');
  if (searchClear) searchClear.addEventListener('click', () => {
    $('search-input').value = '';
    $('search-input').focus();
    renderSearch();
  });

  // ── Start ──────────────────────────────────────────────────────────────
  chrome.storage.sync.get([SET_KEY], async (r) => {
    const s = r[SET_KEY] || {};
    settings = {
      ...structuredClone(DEFAULTS), ...s,
      sources: { ...DEFAULTS.sources, ...(s.sources || {}) },
      providers: { ...DEFAULTS.providers, ...(s.providers || {}) }
    };
    libFilter = settings.libFilter || 'all';
    libPlatform = settings.libPlatform || 'all';
    driveLast = (await getLocal(['nina_drive_last_sync'])).nina_drive_last_sync || null;
    P.setTmdbKey(settings.tmdbKey);
    applyTheme();
    initViewDialog();
    await load();
    render();
    enrich();
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.nina_drive_last_sync) {
      driveLast = c.nina_drive_last_sync.newValue || null;
      if (page === 'settings' && !driveBusy) render();
    }
    if (area === 'local' && c.nina_anilist_import_progress) {
      updateLibImportUI(c.nina_anilist_import_progress.newValue);
    }
    if (area === 'local') {
      // this page's own writes of the online details come back here too: they are already in memory
      const foreignMeta = (c[META_KEY] && !sameJson(c[META_KEY].newValue || {}, meta)) || (c[LOOKUP_KEY] && !sameJson(c[LOOKUP_KEY].newValue || {}, lookup));
      if (foreignMeta || c.nina_cr_watch_status || c.nina_stream_watch_status || c[STRUCT_KEY] || c.nina_partner_platforms || c.nina_partner_alias || c[LOG_KEY] || c.nina_library_local_items) load().then(() => { render(true); enrich(); });
    }
    if (area === 'sync') {
      if (c[SET_KEY] && c[SET_KEY].newValue) { settings = { ...settings, ...c[SET_KEY].newValue }; applyTheme(); }
      // added / changed on another PC or on a streaming site
      // (our own writes come back here too: they are already in memory, reloading + rebuilding all would only repeat the work)
      const foreign = Object.keys(c).some((k) => {
        if (!k.startsWith(ITEM_PREFIX)) return false;
        const ref = k.slice(ITEM_PREFIX.length), nv = c[k].newValue;
        const mine = items[ref];
        if (!nv) return !!mine && !previews.has(ref);                     // removed elsewhere
        return !mine || JSON.stringify(mine) !== JSON.stringify(nv);       // added / changed elsewhere
      });
      if (foreign) load().then(() => { render(true); enrich(); });
    }
  });
})();
