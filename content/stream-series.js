// stream-series.js — NINA on the pages of Prime Video, Disney+, Joyn and
// Netflix (the player part is stream-watch.js). On Crunchyroll only the show
// page bar is used (flat, in Crunchyroll's own look); its episode frames come
// from crunchyroll-watch-status.js:
//
//  • show pages: every episode NINA knows gets "Gesehen" / "Angefangen"
//    (Crunchyroll look). The progress is the library's: an episode seen on
//    Crunchyroll or on another service counts here too, seasons are mapped
//    with the absolute numbering of lib/library-core.js. The service's own
//    progress bars are read as well (episodes watched before NINA).
//  • a NINA card above the episodes: status (6 like AniList), progress,
//    stars, watchlist — all of it written to "Meine Serien" (not to AniList;
//    that is a separate opt-in switch there).
//  • posters everywhere on the site (home, rows, search …): small badge
//    "✓ Gesehen", "▶ 3/12", "🔖 Merkliste" … for titles in the library.
//
// Switches: settings → Streaming-Plattformen (nina_stream_track) and
// "Meine Serien" → Einstellungen (nina_library_settings: siteBadges, siteCard).

(function () {
  'use strict';
  if (window.__ninaStreamSeries) return;
  window.__ninaStreamSeries = true;

  const C = self.NinaLibCore;
  const P = self.NinaProviders;
  if (!C) return;

  const PLATFORM = (() => {
    const h = location.hostname;
    if (/(^|\.)(primevideo\.com|amazon\.(de|com|co\.uk))$/i.test(h)) return 'prime';
    if (/(^|\.)disneyplus\.com$/i.test(h)) return 'disney';
    if (/(^|\.)joyn\.(de|at|ch)$/i.test(h)) return 'joyn';
    if (/(^|\.)netflix\.com$/i.test(h)) return 'netflix';
    if (/(^|\.)crunchyroll\.com$/i.test(h)) return 'crunchyroll';
    return null;
  })();
  if (!PLATFORM) return;

  const ST_KEY = 'nina_stream_watch_status';
  const OPT_KEY = 'nina_stream_track';
  const SET_KEY = 'nina_library_settings';
  const META_KEY = 'nina_library_meta';
  const LOOKUP_KEY = 'nina_library_lookup';
  const STRUCT_KEY = 'nina_stream_struct';
  const PAGES_KEY = 'nina_stream_pages';   // show pages + episode links seen on this service
  const PLAY_KEY = 'nina_play';            // "start this episode" request from the library
  const ITEM_PREFIX = 'nlib:';
  const SERVICE_NAMES = { prime: 'Prime Video', disney: 'Disney+', joyn: 'Joyn', netflix: 'Netflix', crunchyroll: 'Crunchyroll' };
  // services of partner extensions (lib/partner-bg.js): their names on the markers
  chrome.storage.local.get(['nina_partner_platforms'], (r) => { for (const p of Object.values(r.nina_partner_platforms || {})) if (p && p.id) SERVICE_NAMES[p.id] = p.name; });
  const STATUS = C.STATUS, ORDER = C.STATUS_ORDER;
  const AL_STATUS = { watching: 'CURRENT', planned: 'PLANNING', done: 'COMPLETED', rewatching: 'REPEATING', paused: 'PAUSED', dropped: 'DROPPED' };

  // ── Data ───────────────────────────────────────────────────────────────
  let opts = { track: true, anilist: true };
  let lib = { siteBadges: true, siteCard: true, pauseDays: 30, providers: { tvmaze: true, anilist: true, tmdb: false }, tmdbKey: '' };
  let cr = {}, st = {}, meta = {}, lookup = {}, struct = {}, items = {}, aliases = {}, views = {};
  let watchedThreshold = 90;
  let shows = [], idx = new Map(), ready = false;
  let busy = false, rebuildTimer = null;
  let pages = {}, pending = null;
  const lookedUp = new Set();

  const readOpts = (v) => { opts = { track: true, anilist: true, ...((v || {})[PLATFORM] || {}) }; };
  const readLib = (v) => {
    lib = { ...lib, ...(v || {}), providers: { ...lib.providers, ...((v || {}).providers || {}) } };
    if (P) P.setTmdbKey(lib.tmdbKey);
  };
  function rebuild() {
    shows = C.build({ cr, st, lookup, items, meta, struct, aliases, views, settings: { pauseDays: lib.pauseDays || 30, sources: lib.sources } });
    idx = C.index(shows);
  }
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { rebuild(); scan(); scanPosters(); }, 250);
  }

  chrome.storage.sync.get(null, (all) => {
    readOpts(all[OPT_KEY]);
    readLib(all[SET_KEY]);
    for (const [k, v] of Object.entries(all)) if (k.startsWith(ITEM_PREFIX) && v && v.ref) items[v.ref] = v;
    chrome.storage.local.get(['nina_cr_watch_status', ST_KEY, META_KEY, LOOKUP_KEY, STRUCT_KEY, PAGES_KEY, PLAY_KEY, 'nina_partner_alias', 'joyn_yt_watched_threshold', 'nina_view_log', 'nina_library_local_items'], (l) => {
      aliases = l.nina_partner_alias || {};
      views = l.nina_view_log || {};
      cr = l.nina_cr_watch_status || {};
      st = l[ST_KEY] || {};
      meta = l[META_KEY] || {};
      lookup = l[LOOKUP_KEY] || {};
      struct = l[STRUCT_KEY] || {};
      pages = l[PAGES_KEY] || {};
      for (const [ref, v] of Object.entries(l.nina_library_local_items || {})) if (v && v.ref && !items[v.ref]) items[v.ref] = v;
      // A request from the library is only taken up by the tab it opened (read
      // once, when the page loads): tabs that were already open never grab it.
      const want = l[PLAY_KEY];
      if (want && want.platform === PLATFORM && want.until > Date.now()) pending = want;
      const t = parseFloat(l.joyn_yt_watched_threshold);
      if (isFinite(t)) watchedThreshold = Math.max(1, Math.min(100, t));
      ready = true;
      rebuild();
      scan();
      scanPosters();
    });
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync') {
      if (c[OPT_KEY]) readOpts(c[OPT_KEY].newValue);
      if (c[SET_KEY]) readLib(c[SET_KEY].newValue);
      for (const k of Object.keys(c)) {
        if (!k.startsWith(ITEM_PREFIX)) continue;
        const v = c[k].newValue;
        if (v && v.ref) items[v.ref] = v; else delete items[k.slice(ITEM_PREFIX.length)];
      }
    } else if (area === 'local') {
      if (c.nina_cr_watch_status) cr = c.nina_cr_watch_status.newValue || {};
      if (c[ST_KEY]) st = c[ST_KEY].newValue || {};
      if (c[META_KEY]) meta = c[META_KEY].newValue || {};
      if (c[LOOKUP_KEY]) lookup = c[LOOKUP_KEY].newValue || {};
      if (c[STRUCT_KEY]) struct = c[STRUCT_KEY].newValue || {};
      if (c.nina_partner_alias) aliases = c.nina_partner_alias.newValue || {};
      if (c.nina_view_log) views = c.nina_view_log.newValue || {};
      if (c.nina_library_local_items) {
        for (const [ref, v] of Object.entries(c.nina_library_local_items.newValue || {})) if (v && v.ref && !items[v.ref]) items[v.ref] = v;
      }
    } else return;
    if (ready) scheduleRebuild();
  });

  // read-modify-write of a local map (the library page and the other tabs write them too)
  function patchMap(key, patch) {
    chrome.storage.local.get([key], (r) => chrome.storage.local.set({ [key]: { ...(r[key] || {}), ...patch } }));
  }

  // keys of nina_stream_watch_status entries (must match stream-watch.js)
  const normH = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const keyOf = (series, season, episode) => PLATFORM + ':' + normH(series) + ':s' + season + 'e' + episode;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Styles ─────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .nina-sm-host { position: relative !important; }
    .nina-sm-box { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; border-radius: inherit;
      -webkit-backdrop-filter: grayscale(.4) brightness(.85); backdrop-filter: grayscale(.4) brightness(.85);
      transition: backdrop-filter .2s ease, -webkit-backdrop-filter .2s ease; }
    .nina-sm-box.w { -webkit-backdrop-filter: grayscale(.85) brightness(.6); backdrop-filter: grayscale(.85) brightness(.6); }
    *:hover > .nina-sm-box { -webkit-backdrop-filter: none; backdrop-filter: none; }
    .nina-sm-pill { position: absolute; top: 8px; left: 8px; display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 8px 3px 6px; background: rgba(0,0,0,.78); color: #fff; border-radius: 3px;
      font: 700 11px/1.3 system-ui, "Segoe UI", sans-serif; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
    .nina-sm-pill svg { width: 12px; height: 12px; flex: 0 0 auto; color: #f47521; }
    /* Joyn: its age badge ("16") sits top left — go right next to it */
    html.nina-sm-joyn .nina-sm-pill { left: 42px; top: 10px; }
    .nina-sm-box.w .nina-sm-pill svg { color: #3dd16f; }
    .nina-sm-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.25); }
    .nina-sm-bar > div { height: 100%; background: #f47521; }
    .nina-sm-box.w .nina-sm-bar > div { background: #3dd16f; }

    .nina-toast { position: fixed; left: 50%; bottom: 36px; transform: translate(-50%, 20px); z-index: 2147483000; opacity: 0; pointer-events: none;
      padding: 12px 22px; border-radius: 999px; background: rgba(24,28,30,.96); border: 1px solid rgba(128,216,223,.3); color: #e6eaea;
      font: 700 14px/1.3 system-ui, "Segoe UI", sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.5); transition: opacity .25s, transform .3s cubic-bezier(.34,1.56,.64,1); }
    .nina-toast.on { opacity: 1; transform: translate(-50%, 0); }

    /* NINA bar (all services): same content, the look of the site it sits on.
       The font is inherited; the theme below sets colours, corners, letter case. */
    .nina-bar { --nb-fg: #fff; --nb-muted: #8c8c8c; --nb-accent: #80d8df; --nb-star-off: #4a4e58;
      --nb-btn-bg: transparent; --nb-btn-hover: rgba(255,255,255,.1); --nb-btn-border: 0; --nb-radius: 0; --nb-btn-h: 40px; --nb-btn-pad: 14px;
      --nb-menu: #272727; --nb-menu-hover: rgba(255,255,255,.08); --nb-menu-radius: 0; --nb-menu-border: 0;
      --nb-upper: none; --nb-ls: normal; --nb-weight: 700; --nb-fs: 14px; --nb-divider: 0 solid transparent; --nb-item-pad: 6px;
      position: relative; z-index: 5; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 4px; margin: 0 0 20px;
      color: var(--nb-muted); font-family: inherit; font-size: var(--nb-fs); line-height: 1.2; }
    .nina-bar * { box-sizing: border-box; }
    .nb-item { display: inline-flex; align-items: center; gap: 8px; min-height: var(--nb-btn-h); padding: 0 var(--nb-item-pad); border-left: var(--nb-divider);
      font-size: var(--nb-fs); font-weight: var(--nb-weight); letter-spacing: var(--nb-ls); text-transform: var(--nb-upper); white-space: nowrap; }
    .nb-item:first-child { padding-left: 0; border-left: 0; }
    .nb-item.push { margin-left: auto; }
    .nb-key { color: var(--nb-muted); }
    .nb-val { color: var(--nb-fg); }
    .nb-logo { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #80d8df; color: #00363a; font: 900 12px/1 system-ui, sans-serif; letter-spacing: 0; }
    .nb-dd { position: relative; display: inline-flex; }
    .nb-dd-btn, .nb-btn { display: inline-flex; align-items: center; gap: 6px; height: var(--nb-btn-h); padding: 0 var(--nb-btn-pad); border: var(--nb-btn-border); border-radius: var(--nb-radius);
      background: var(--nb-btn-bg); color: var(--nb-fg); cursor: pointer; font: inherit; font-size: var(--nb-fs); font-weight: var(--nb-weight); letter-spacing: var(--nb-ls); text-transform: var(--nb-upper); white-space: nowrap; }
    .nb-btn { color: var(--nb-muted); }
    .nb-dd-btn svg { width: 20px; height: 20px; opacity: .7; }
    .nb-btn svg { width: 18px; height: 18px; flex: 0 0 auto; }
    .nb-dd-btn:hover, .nb-dd.open .nb-dd-btn, .nb-btn:hover { background: var(--nb-btn-hover); color: var(--nb-fg); }
    .nb-btn.on { color: var(--nb-accent); }
    .nb-dd-menu { display: none; position: absolute; top: calc(100% + 6px); left: 0; z-index: 50; min-width: 230px; padding: 8px 0; background: var(--nb-menu);
      border: var(--nb-menu-border); border-radius: var(--nb-menu-radius); box-shadow: 0 14px 34px rgba(0,0,0,.55); }
    .nb-dd.open .nb-dd-menu { display: block; }
    .nb-dd-opt { display: block; width: 100%; padding: 11px 20px; border: 0; background: none; text-align: left; color: var(--nb-muted); cursor: pointer; white-space: nowrap;
      font: inherit; font-size: 15px; font-weight: 400; letter-spacing: normal; text-transform: none; }
    .nb-dd-opt.selected { color: var(--nb-fg); font-weight: 700; }
    .nb-dd-opt:hover, .nb-dd-opt:focus { background: var(--nb-menu-hover); color: var(--nb-fg); outline: none; }
    .nb-stars { display: inline-flex; align-items: center; }
    .nb-star { border: 0; background: none; padding: 0 1px; cursor: pointer; line-height: 0; color: var(--nb-star-off); }
    .nb-star svg { width: 21px; height: 21px; display: block; }
    .nb-key svg { width: 15px; height: 15px; display: block; }
    .nb-star.on { color: var(--nb-accent); }
    .nb-star:hover { color: var(--nb-accent); filter: brightness(1.2); }

    /* Crunchyroll: flat gray uppercase controls with dividers, like its "ÄLTESTE · OPTIONEN" row */
    .nina-bar[data-pf="crunchyroll"] { --nb-muted: #8c8c8c; --nb-accent: #f47521; --nb-btn-hover: #272727; --nb-menu: #272727; --nb-menu-hover: rgb(21,21,21);
      --nb-upper: uppercase; --nb-btn-h: 44px; --nb-divider: 1px solid #3a3d45; --nb-item-pad: 18px; margin: -4px 0 22px; padding: 0 0 14px; border-bottom: 1px solid #2c2e33; gap: 10px 0; }
    .nina-bar[data-pf="crunchyroll"] .nb-item { min-height: 28px; }
    .nina-bar[data-pf="crunchyroll"] .nb-dd-btn, .nina-bar[data-pf="crunchyroll"] .nb-btn { margin: 0 -12px 0 -8px; padding: 0 12px 0 8px; }
    .nina-bar[data-pf="crunchyroll"] .nb-item.push { padding-right: 0; border-left: 0; }
    .nina-bar[data-pf="crunchyroll"] .nb-dd-menu { top: 100%; left: -8px; box-shadow: none; padding: 12px 0; }
    .nina-bar[data-pf="crunchyroll"] .nb-dd-opt { padding: 10px 20px; font-size: 16px; }
    .nina-bar[data-pf="crunchyroll"] .nb-star { color: #4a4e58; }
    .nina-bar[data-pf="crunchyroll"] .nb-star.on { color: #f47521; }

    /* Prime Video: Ember, 8px corners, blue accent, filled grey buttons like its season picker */
    .nina-bar[data-pf="prime"] { --nb-fg: #fff; --nb-muted: #8197a4; --nb-accent: #00a8e1; --nb-star-off: #4b5a66;
      --nb-btn-bg: rgba(255,255,255,.1); --nb-btn-hover: rgba(255,255,255,.18); --nb-radius: 8px; --nb-btn-h: 42px; --nb-btn-pad: 16px; --nb-fs: 15px; --nb-weight: 600; --nb-ls: .03em;
      --nb-menu: #1b2733; --nb-menu-radius: 8px; --nb-menu-border: 1px solid rgba(255,255,255,.1); --nb-menu-hover: rgba(255,255,255,.1); gap: 8px 6px; }
    .nina-bar[data-pf="prime"] .nb-btn { background: transparent; }
    .nina-bar[data-pf="prime"] .nb-btn:hover { background: rgba(255,255,255,.12); }
    .nina-bar[data-pf="prime"][data-movie="1"],
    .nina-bar[data-pf="prime"][data-tabs="1"],
    [role="tablist"] + .nina-bar,
    [role="tablist"] ~ .nina-bar {
      margin: 0 0 0 36px !important;
      align-self: center;
    }

    /* Disney+: Inspire, letter-spaced caps, 4px corners, translucent buttons with a thin outline */
    .nina-bar[data-pf="disney"] { --nb-fg: #f9f9f9; --nb-muted: rgba(249,249,249,.62); --nb-accent: #4aa3ff; --nb-star-off: rgba(249,249,249,.25);
      --nb-btn-bg: rgba(249,249,249,.1); --nb-btn-hover: rgba(249,249,249,.2); --nb-btn-border: 1px solid rgba(249,249,249,.3); --nb-radius: 4px; --nb-btn-h: 40px; --nb-btn-pad: 18px;
      --nb-upper: uppercase; --nb-ls: .1em; --nb-fs: 13px; --nb-weight: 600; --nb-menu: #31343e; --nb-menu-radius: 4px; --nb-menu-hover: rgba(249,249,249,.1); gap: 8px 6px; }
    .nina-bar[data-pf="disney"] .nb-btn { background: transparent; border-color: transparent; }
    .nina-bar[data-pf="disney"] .nb-btn:hover { background: rgba(249,249,249,.14); }
    .nina-bar[data-pf="disney"] .nb-dd-opt { letter-spacing: .02em; }

    /* Joyn: Campton, 8px corners, pink accent, soft translucent buttons */
    .nina-bar[data-pf="joyn"] { --nb-fg: #fff; --nb-muted: rgba(255,255,255,.66); --nb-accent: #ff4d86; --nb-star-off: rgba(255,255,255,.28);
      --nb-btn-bg: rgba(255,255,255,.12); --nb-btn-hover: rgba(255,255,255,.22); --nb-radius: 8px; --nb-btn-h: 40px; --nb-btn-pad: 16px; --nb-fs: 14px; --nb-weight: 700;
      --nb-menu: #1d1d21; --nb-menu-radius: 12px; --nb-menu-border: 1px solid rgba(255,255,255,.12); --nb-menu-hover: rgba(255,255,255,.1); gap: 8px 6px; }
    .nina-bar[data-pf="joyn"] { padding: 0 32px; }
    .nina-bar[data-pf="joyn"] .nb-btn { background: transparent; }
    .nina-bar[data-pf="joyn"] .nb-btn:hover { background: rgba(255,255,255,.14); }

    /* Netflix: Netflix Sans, 4px corners, grey buttons, red accent */
    .nina-bar[data-pf="netflix"] { --nb-fg: #fff; --nb-muted: #a3a3a3; --nb-accent: #e50914; --nb-star-off: #5a5a5a;
      --nb-btn-bg: rgba(109,109,110,.7); --nb-btn-hover: rgba(109,109,110,.45); --nb-radius: 4px; --nb-btn-h: 38px; --nb-btn-pad: 16px; --nb-fs: 14px; --nb-weight: 700;
      --nb-menu: #262626; --nb-menu-radius: 4px; --nb-menu-border: 1px solid rgba(255,255,255,.15); --nb-menu-hover: rgba(255,255,255,.1); gap: 8px 6px; }
    .nina-bar[data-pf="netflix"] .nb-btn { background: transparent; }
    .nina-bar[data-pf="netflix"] .nb-btn:hover { background: rgba(109,109,110,.4); }
    .nina-bar[data-pf="netflix"] .nb-star.on, .nina-bar[data-pf="netflix"] .nb-btn.on { color: #ff4b55; }

    /* badges on posters all over the site */
    .nina-pb-host { position: relative !important; }
    .nina-pb { position: absolute; top: 6px; right: 6px; z-index: 6; pointer-events: none; display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px;
      background: rgba(10,14,15,.82); color: #fff; font: 800 11px/1.3 system-ui, "Segoe UI", sans-serif; letter-spacing: .02em; white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.16); }
    .nina-pb svg { width: 12px; height: 12px; flex: 0 0 auto; }
    .nina-pb.done { background: rgba(35,120,60,.92); }
    .nina-pb.watching, .nina-pb.rewatching { background: rgba(0,110,118,.92); }
    .nina-pb.paused { background: rgba(138,109,29,.92); }
    .nina-pb.dropped { background: rgba(90,90,90,.92); }
  `;
  (document.head || document.documentElement).appendChild(style);
  document.documentElement.classList.add('nina-sm-' + PLATFORM);

  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const svg = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>';
  const ICON = {
    star: svg('M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'),
    chev: svg('M7 10l5 5 5-5z'),
    bookmark: svg('M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z'),
    open: svg('M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'),
    check: svg('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'),
    play: svg('M8 5v14l11-7z'),
    pause: svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z'),
    close: svg('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'),
    clock: svg('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z')
  };
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // box around the picture (a <picture> element can't show extra children)
  const hostOf = (img) => (img.parentElement.tagName === 'PICTURE' ? img.parentElement.parentElement : img.parentElement);
  function sized(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (r.width >= 60 && r.height >= 60) return n;
    }
    return null;
  }

  // The service's own progress on an episode card (0..1, or null): a
  // percentage in its label (Disney+: "3 Prozent abgeschlossen"), a
  // <progress> element, or the width of a progress bar fill (Prime, Joyn,
  // Netflix). Episodes watched before NINA tracked them show up this way.
  function nativeProgress(el) {
    const label = el.getAttribute('aria-label') || '';
    let m = /(\d+)\s*(?:Prozent|%)\s*(?:abgeschlossen|angesehen|gesehen)/i.exec(label);
    if (m) return Math.min(1, +m[1] / 100);
    const prog = el.querySelector('progress');
    if (prog && prog.max > 0 && prog.value > 0) return Math.min(1, prog.value / prog.max);
    for (const bar of el.querySelectorAll('[class*="progress" i], [role="progressbar"]')) {
      const now = bar.getAttribute('aria-valuenow');
      if (now !== null && +now > 0) return Math.min(1, +now / (+bar.getAttribute('aria-valuemax') || 100));
      const fill = /width/.test(bar.getAttribute('style') || '') ? bar : bar.querySelector('[style*="width"]');
      m = fill && /width:\s*([\d.]+)%/.exec(fill.getAttribute('style'));
      if (m && +m[1] > 0) return Math.min(1, +m[1] / 100);
    }
    return null;
  }

  // ── Reading the show page ─────────────────────────────────────────────
  // → { series, season, items: [{ host, season, episode, native }] } or null
  const PAGES = {
    // Crunchyroll: no episode numbers in its data — only the place for the bar
    crunchyroll() {
      if (!/\/series\//.test(location.pathname)) return null;
      const anchor = document.querySelector('.erc-season-with-navigation');
      const title = document.querySelector('[currentseasonid]') || document.querySelector('.erc-seasons-select');
      if (!anchor || !title) return null;
      const h1 = document.querySelector('h1');
      const series = clean((h1 && h1.textContent) || document.title.replace(/\s*-\s*Crunchyroll\s*$/i, '').replace(/\s+auf Deutsch\s*$/i, ''));
      const slug = /\/series\/[^/?#]+\/([^/?#]+)/.exec(location.pathname);
      return { series, alt: slug ? decodeURIComponent(slug[1]).replace(/-+/g, ' ') : '', season: 1, items: [], cr: { anchor, title } };
    },
    prime() {
      if (!/\/(?:detail|dp|gp\/product)\//.test(location.pathname)) return null;
      const isPrime = location.hostname.includes('primevideo.com') ||
        document.querySelector('[data-automation-id], [data-testid="season-selector"], .av-detail-section, #dv-action-box, [class*="dv-meta-info"]') ||
        /(?:Prime Video|Amazon Video)/i.test(document.title);
      if (!isPrime) return null;

      const titleEl = document.querySelector('h1, [data-automation-id="title"]');
      const h1img = titleEl && titleEl.querySelector('img');
      let titleText = (h1img && h1img.alt) || (titleEl && clean(titleEl.textContent)) || '';
      if (!titleText) {
        let t = document.title
          .replace(/^Prime Video:\s*/i, '')
          .replace(/^Amazon\.[a-z.]+:?\s*/i, '')
          .replace(/\s*(?:ansehen\s*)?(?:[-|]\s*)?Prime Video\s*$/i, '');
        titleText = clean(t.replace(/\s*(?:Staffel|Season)\s*\d+.*$/i, ''));
      }
      let series = clean(titleText);
      if (!series) return null;
      // Strip language / audio suffixes often present on Amazon Prime (e.g. "Smile [dt./OV]" -> "Smile")
      const cleanName = series.replace(/\s*[\[(](?:dt\.?\s*\/?\s*OV|OV\s*\/?\s*OmU|dt\.?\s*\/?\s*OmU|dt\.?|OV|OmU|UHD|4K(?:\s*UHD)?|HD|Original Version|German Audio|English Subtitled|Subbed|Dubbed)[\])]\s*$/i, '').trim();
      const alt = (cleanName && cleanName !== series) ? series : '';
      if (cleanName) series = cleanName;

      const sm = /(?:Staffel|Season)\s*(\d+)/i.exec(document.title + ' ' + (document.querySelector('[data-automation-id="season-selector"], [data-testid="season-selector"]') || {}).textContent);
      const season = sm ? +sm[1] : 1;
      const list = [];
      for (const li of document.querySelectorAll('li[data-testid="episode-list-item"]')) {
        const label = [...li.querySelectorAll('span')].map((s) => clean(s.textContent)).find((s) => /^\d+\.\s/.test(s));
        const img = li.querySelector('img');
        if (!label || !img) continue;
        list.push({ host: hostOf(img), season, episode: +/^(\d+)/.exec(label)[1], native: nativeProgress(li), play: li });
      }

      if (!list.length) {
        // Film / Movie on Prime Video (no episode list items)
        const tablist = document.querySelector('[role="tablist"]');
        const tabContainer = document.querySelector('[data-automation-id="tab-container"], .av-tab-container, [data-testid="tab-container"]');
        const actions = document.querySelector(
          '[data-automation-id="action-button-list"], [data-testid="action-buttons"], [data-automation-id="button-container"], ' +
          '[data-automation-id="synopsis"], [data-testid="synopsis"], [class*="synopsis" i]'
        );
        const hero = document.querySelector('[data-automation-id="title-overview"], [data-automation-id="meta-info"], h1, [data-automation-id="title"]');

        let place = null;
        if (tablist) {
          place = { head: tablist };
        } else if (tabContainer) {
          place = { list: tabContainer };
        } else if (actions) {
          place = { head: actions };
        } else if (hero) {
          place = { head: hero };
        }

        return {
          series, alt, season: 1, items: [], movie: !sm,
          place
        };
      }

      return { series, alt, season, items: list, movie: false };
    },
    disney() {
      if (!/\/browse\/entity-/.test(location.pathname)) return null;
      const series = clean(document.title.replace(/\s*\|\s*Disney\+\s*$/i, ''));
      const list = [];
      let season = 1;
      for (const a of document.querySelectorAll('a[href*="/play/"]')) {
        const m = /Staffel\s*(\d+)\s*Folge\s*(\d+)/i.exec(a.getAttribute('aria-label') || '');
        const img = a.querySelector('img');
        if (!m || !img) continue;
        season = +m[1];
        list.push({ host: hostOf(img), season: +m[1], episode: +m[2], native: nativeProgress(a), link: a });
      }
      if (!list.length) {
        const anchor = document.querySelector('[data-testid="hero-partner-logo"], [data-testid="details-section"], [class*="action-bar"], main, section');
        return { series, season: 1, items: [], movie: true, place: anchor ? { head: anchor } : null };
      }
      return { series, season, items: list, movie: false };
    },
    joyn() {
      const pm = /^\/(?:serien|filme)\/([^/]+)\/?$/.exec(location.pathname);
      if (!pm) return null;
      const isFilm = /^\/filme\//.test(location.pathname);
      const h1 = document.querySelector('h1');
      const series = clean(h1 && h1.textContent);
      if (isFilm) {
        const anchor = document.querySelector('[class*="Hero"], [class*="Header"], h1');
        return { series, season: 1, items: [], movie: true, place: anchor ? { head: anchor } : null };
      }
      const list = [], links = [];
      let season = 1;
      for (const a of document.querySelectorAll('a[href^="/play/serien/' + pm[1] + '/"]')) {
        const m = /\/(\d+)-(\d+)-/.exec(a.getAttribute('href'));
        if (!m) continue;
        // all episode links count for starting one — also the cards Joyn has not drawn yet
        links.push({ season: +m[1], episode: +m[2], link: a, card: a.closest('[class*="CardEpisode"]') });
        // Joyn loads the pictures late: its image box exists before the <img>
        const img = a.querySelector('img');
        const host = img ? hostOf(img) : a.querySelector('[class*="ImageContainer"]');
        if (!host) continue;
        season = +m[1];
        list.push({ host, season: +m[1], episode: +m[2], native: nativeProgress(a), link: a });
      }
      // the bar goes above the row of cards, drawn or not
      const cards = links.map((l) => l.card).filter(Boolean);
      return { series, season, items: list, links, place: cards.length ? { first: cards[0], last: cards[cards.length - 1] } : null, movie: false };
    },
    netflix() {
      const modal = document.querySelector('.previewModal--container, [data-uia="modal-motion-container-DETAIL_MODAL"]');
      if (!modal) return null;
      const logo = modal.querySelector('.previewModal--player-titleTreatment-logo, [class*="titleTreatment"] img');
      const about = modal.querySelector('.about-header strong, .previewModal--section-header strong');
      const series = clean((logo && logo.alt) || (about && about.textContent));
      // season menu (new layout: data-uia="episode-selector"), else the
      // "Staffel 2: 6" line above the episodes
      const dd = modal.querySelector('[data-uia="episode-selector"] [data-uia="dropdown-toggle"], .episodeSelector [data-uia="dropdown-toggle"], .episodeSelector-dropdown, [data-uia="dropdown-toggle"]');
      const sm = (dd && /(\d+)/.exec(dd.textContent)) || /(?:Staffel|Season)\s*(\d+)\s*:/i.exec(modal.textContent || '');
      const season = sm ? +sm[1] : 1;
      const list = [];
      for (const card of modal.querySelectorAll('.titleCardList--container, [data-uia="titleCard--container"]')) {
        const i = card.querySelector('.titleCard-title_index');
        const img = card.querySelector('.titleCard-imageWrapper, img');
        if (!i || !img) continue;
        list.push({ host: img.tagName === 'IMG' ? hostOf(img) : img, season, episode: +clean(i.textContent), native: nativeProgress(card), play: card });
      }
      if (!list.length) {
        const anchor = modal.querySelector('.previewModal--player_container, .videoMerchPlayer--boxart-wrapper, [class*="player_container"]');
        return { series, season: 1, items: [], movie: true, place: anchor ? { head: anchor } : null };
      }
      return { series, season, items: list, movie: false };
    }
  };

  // ── Markers on the episodes ───────────────────────────────────────────
  function mark(host, entry) {
    let box = host.querySelector(':scope > .nina-sm-box');
    if (!entry || (entry.status !== 'watched' && entry.status !== 'started')) { if (box) box.remove(); return; }
    host.classList.add('nina-sm-host');
    if (!box) { box = document.createElement('div'); host.appendChild(box); }
    const w = entry.status === 'watched';
    const frac = w ? 1 : (entry.frac > 0 ? Math.min(1, entry.frac) : null);
    const sig = (w ? 'w' : 's') + (frac == null ? '' : Math.round(frac * 100)) + (entry.via || '');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.className = 'nina-sm-box' + (w ? ' w' : '');
    const via = entry.via && SERVICE_NAMES[entry.via] ? ' · ' + SERVICE_NAMES[entry.via] : '';
    box.innerHTML = '<span class="nina-sm-pill">' + (w ? CHECK : PLAY) + (w ? 'Gesehen' : 'Angefangen') + via + '</span>' +
      (frac == null ? '' : '<div class="nina-sm-bar"><div style="width:' + Math.max(4, Math.round(frac * 100)) + '%"></div></div>');
  }

  // season sizes of this service, for the absolute numbering
  function recordStruct(page) {
    // Joyn draws only the episodes near the screen: a list can be incomplete,
    // so a season never gets smaller than what was seen before.
    const seen = new Set((page.links || page.items).filter((i) => i.season === page.season).map((i) => i.episode));
    const n = seen.size;
    if (!n) return;
    const key = PLATFORM + ':' + C.norm(page.series);
    if (n <= ((struct[key] || {})[page.season] || 0)) return;
    struct[key] = { ...(struct[key] || {}), [page.season]: n };
    chrome.storage.local.get([STRUCT_KEY], (r) => {
      const all = r[STRUCT_KEY] || {};
      all[key] = { ...(all[key] || {}), [page.season]: Math.max(n, (all[key] || {})[page.season] || 0) };
      chrome.storage.local.set({ [STRUCT_KEY]: all });
    });
  }

  // Remember where this show lives on the service (one URL per season where
  // the service has one page per season) and the episode links it shows —
  // the library uses them to start an episode directly.
  function recordPage(page) {
    const found = page.links || page.items;
    if (!found.length) {
      if (page.movie && page.series) {
        const key = PLATFORM + ':' + C.norm(page.series);
        const url = location.href.split('#')[0];
        const cur = pages[key] || {};
        if (cur.url === url) return;
        pages[key] = { url, urls: { 1: url }, eps: {}, sig: url, at: Date.now() };
        chrome.storage.local.get([PAGES_KEY], (r) => chrome.storage.local.set({ [PAGES_KEY]: { ...(r[PAGES_KEY] || {}), [key]: pages[key] } }));
      }
      return;
    }
    const key = PLATFORM + ':' + C.norm(page.series);
    const url = location.href.split('#')[0];
    const cur = pages[key] || {};
    const eps = { ...(cur.eps || {}) };
    for (const it of found) if (it.link && it.link.href) eps[it.season + ':' + it.episode] = it.link.href;
    const urls = { ...(cur.urls || {}), [page.season]: url };
    const sig = JSON.stringify([url, urls, eps]);
    if (cur.sig === sig) return;
    pages[key] = { url, urls, eps, sig, at: Date.now() };
    chrome.storage.local.get([PAGES_KEY], (r) => chrome.storage.local.set({ [PAGES_KEY]: { ...(r[PAGES_KEY] || {}), [key]: pages[key] } }));
  }

  // ── Start an episode the library asked for ────────────────────────────
  function toast(text) {
    let t = document.querySelector('.nina-toast');
    if (!t) { t = document.createElement('div'); t.className = 'nina-toast'; document.documentElement.appendChild(t); }
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 5000);
  }
  function clearPlay() { pending = null; chrome.storage.local.remove([PLAY_KEY]); }
  // an episode with its own link is opened; the others get clicked like a user would
  function playItem(it) {
    if (it.link && it.link.href) { location.assign(it.link.href); return; }
    const root = it.play || it.host;
    const btn = root.querySelector('a[href*="autoplay"], a[href*="/gp/video/"], [data-testid*="play" i], [aria-label*="Wiedergabe" i], [aria-label*="abspielen" i], [aria-label*="Play" i], [data-uia*="play" i], .titleCard-playIcon');
    (btn || it.host).click();
  }
  function tryPlay(page) {
    if (!pending) return;
    if (Date.now() > pending.until) return clearPlay();
    if (C.norm(page.series) !== pending.name) return;                  // another page: keep waiting
    const found = page.links || page.items;
    const it = found.find((i) => i.season === pending.season && i.episode === pending.episode);
    if (!it) {
      // the list is there, the episode is not (another season is shown)
      if (found.length && !pending.told) { pending.told = true; toast('NINA: Staffel ' + pending.season + ' wählen – dann startet Folge ' + pending.episode + '.'); }
      return;
    }
    const label = 'S' + pending.season + ' · F' + pending.episode;
    clearPlay();
    toast('NINA startet ' + label + ' …');
    setTimeout(() => playItem(it), 500);
  }

  // ── Library writes (same rules as the library page) ──────────────────
  const itemFor = (s) => s.item || { ref: s.ref || C.localRef(s.name), name: s.name, poster: s.poster, type: s.movie ? 'movie' : 'show', addedAt: Date.now() };
  function patchItem(s, patch) {
    const it = { ...itemFor(s), ...patch };
    items[it.ref] = it;
    chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: it }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(['nina_library_local_items'], (res) => {
          const locals = res.nina_library_local_items || {};
          locals[it.ref] = it;
          chrome.storage.local.set({ nina_library_local_items: locals });
        });
      }
    });
    rebuild();
    scan();
    return it;
  }
  function setStatus(s, status) {
    if (status === 'auto') {
      const it = { ...itemFor(s) };
      delete it.status; delete it.manualAt;
      items[it.ref] = it;
      chrome.storage.sync.set({ [ITEM_PREFIX + it.ref]: it });
      rebuild(); scan();
      return;
    }
    const patch = { status, manualAt: Date.now() };
    if (status === 'done') patch.completedAt = Date.now();
    patchItem(s, patch);
    pushAnilist(s, { status });
  }
  async function pushAnilist(s, what) {
    if (!lib.anilistSync || !P) return;
    const animeLike = s.platforms.some((p) => p.platform === 'crunchyroll') || (s.ref || '').startsWith('anilist:') ||
      /anime|animation/i.test(((s.meta && s.meta.genres) || []).join(' '));
    if (!animeLike) return;
    let id = s.ref && s.ref.startsWith('anilist:') ? +s.ref.split(':')[1] : null;
    if (!id) {
      const cache = await new Promise((r) => chrome.storage.local.get(['nina_library_alref'], (x) => r(x.nina_library_alref || {})));
      const k = C.norm(s.name);
      if (k in cache) id = cache[k] || null;
      else {
        const hit = await P.lookup(s.name, 'crunchyroll', ['anilist']).catch(() => null);
        patchMap('nina_library_alref', { [k]: hit ? hit.id : 0 });
        id = hit ? hit.id : null;
      }
    }
    if (!id) return;
    const data = { mediaId: id };
    if (what.status) data.status = AL_STATUS[what.status];
    if (what.rating) data.score = what.rating * 2;
    chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op: 'save', data }, () => void chrome.runtime.lastError);
  }
  // not in the library yet: find it online, put it on the watchlist
  async function addToWatchlist(name, movie) {
    let hit = null;
    if (P) {
      const prov = Object.keys(lib.providers).filter((p) => lib.providers[p] && (p !== 'tmdb' || lib.tmdbKey));
      hit = await P.lookup(name, PLATFORM, prov, movie ? 'movie' : 'show').catch(() => null);
    }
    const ref = hit ? hit.ref : C.localRef(name);
    if (hit) { meta[hit.ref] = { ...hit, fetchedAt: 0 }; patchMap(META_KEY, { [hit.ref]: meta[hit.ref] }); }
    const it = { ref, name: hit ? hit.name : name, poster: hit ? hit.poster : '', year: hit && hit.year, network: hit && hit.network, type: movie ? 'movie' : 'show', wl: true, addedAt: Date.now() };
    items[ref] = it;
    chrome.storage.sync.set({ [ITEM_PREFIX + ref]: it }, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(['nina_library_local_items'], (res) => {
          const locals = res.nina_library_local_items || {};
          locals[ref] = it;
          chrome.storage.local.set({ nina_library_local_items: locals });
        });
      }
    });
    rebuild(); scan(); scanPosters();
    return it;
  }
  // tracked here, but not matched online yet: do it once, so the other services merge
  function ensureLookup(s) {
    if (!P || s.ref || !s.groups.length) return;
    for (const g of s.groups) {
      const cur = lookup[g.key];
      if (cur === '' || (cur && !String(cur).startsWith('local:')) || lookedUp.has(g.key)) continue;
      lookedUp.add(g.key);
      const prov = Object.keys(lib.providers).filter((p) => lib.providers[p] && (p !== 'tmdb' || lib.tmdbKey));
      if (!prov.length) return;
      P.lookup(g.name, g.platform, prov, g.movie ? 'movie' : 'show').then((hit) => {
        patchMap(LOOKUP_KEY, { [g.key]: hit ? hit.ref : '', __v: 2 });
        if (hit) patchMap(META_KEY, { [hit.ref]: { ...hit, fetchedAt: 0 } });
      }).catch(() => {});
    }
  }

  // ── NINA bar ──────────────────────────────────────────────────────────
  // One bar for every service: the same content everywhere, dressed in the
  // look of the site it sits on (the font is inherited; colours, corners and
  // letter case come from that service's theme, see the styles above):
  //   NINA · score · status · Folgen x / y · Wertung (5 stars) · Merkliste · In Meine Serien
  // Icons only (SVG) — no emoji or text symbols.
  // All of it is NINA's own data (library, status, rating, watchlist) —
  // nothing from AniList.
  const BOOKMARK = ICON.bookmark;
  const CHEV = ICON.chev;
  const showFor = (name, alt) => idx.get(C.norm(name)) || (alt && idx.get(C.norm(alt))) || null;
  const closeBarMenu = () => {
    const dd = document.querySelector('.nb-dd.open');
    if (!dd) return false;
    dd.classList.remove('open');
    return true;
  };

  // Where the bar goes: Crunchyroll right under the season header, the others
  // right above the list of episodes.
  function barSpot(page) {
    if (page.cr) {
      let head = page.cr.title;
      while (head && head.parentElement !== page.cr.anchor) head = head.parentElement;
      return { parent: page.cr.anchor, head };
    }
    if (page.place) {
      if (page.place.head && page.place.head.parentElement) {
        return { parent: page.place.head.parentElement, head: page.place.head };
      }
      if (page.place.list && page.place.list.parentElement) {
        return { parent: page.place.list.parentElement, list: page.place.list };
      }
      if (page.place.parent) return page.place;
    }
    const first = page.place ? page.place.first : page.items[0] && page.items[0].host;
    const last = page.place ? page.place.last : page.items.length && page.items[page.items.length - 1].host;
    if (!first) return null;
    // Joyn: between the season picker and the row of cards
    if (PLATFORM === 'joyn') {
      const lane = first.closest('[class*="LaneSeries"]');
      if (lane) {
        let child = first;
        while (child.parentElement && child.parentElement !== lane) child = child.parentElement;
        if (child.parentElement === lane) return { parent: lane, list: child };
      }
    }
    let list = first;
    for (let i = 0; i < 8 && list.parentElement; i++) {
      list = list.parentElement;
      if (last && last !== first && list.contains(last)) break;
    }
    return list.parentElement ? { parent: list.parentElement, list } : null;
  }
  const barPlaced = (bar, spot) => bar.parentElement === spot.parent &&
    (spot.list ? bar.nextElementSibling === spot.list : (!spot.head || bar.previousElementSibling === spot.head));

  function renderBar(page, show) {
    let bar = document.querySelector('.nina-bar');
    const spot = lib.siteCard ? barSpot(page) : null;
    if (!spot) { if (bar) bar.remove(); return; }
    const placed = !!bar && barPlaced(bar, spot);
    const sig = PLATFORM + '|' + (show ? [show.key, show.status, show.watched, show.total, show.rating, show.wl, show.auto, show.meta && show.meta.score].join('|') : 'none|' + page.series);
    if (bar && placed && bar.dataset.sig === sig) return;
    if (bar && placed && bar.querySelector('.nb-dd.open')) return;      // not while a menu is open
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'nina-bar';
      bar.dataset.pf = PLATFORM;
      bar.addEventListener('click', onBarClick);
    }
    bar.dataset.sig = sig;
    bar.dataset.name = page.series;
    bar.dataset.alt = page.alt || '';
    bar.dataset.movie = (page.movie || (show && show.movie)) ? '1' : '0';
    bar.dataset.tabs = (spot && spot.head && (spot.head.getAttribute('role') === 'tablist' || (spot.head.closest && spot.head.closest('[role="tablist"]')))) ? '1' : '0';
    const brand = '<span class="nb-item"><span class="nb-logo">N</span><span class="nb-key">NINA</span></span>';
    if (!show) {
      bar.innerHTML = brand + '<span class="nb-item"><span class="nb-key">Noch nicht in deiner Bibliothek</span></span>' +
        '<span class="nb-item"><button type="button" class="nb-btn" data-nb="add">' + BOOKMARK + 'Zur Merkliste</button></span>';
    } else {
      const score = show.meta && show.meta.score;
      const prog = show.movie ? (show.watched ? 'Gesehen' : '–') : show.total ? Math.min(show.watched, show.total) + ' / ' + show.total : String(show.watched);
      bar.innerHTML = brand +
        (score ? '<span class="nb-item"><span class="nb-key">' + ICON.star + '</span><span class="nb-val">' + esc(Number(score).toFixed(1)) + '</span></span>' : '') +
        '<span class="nb-item"><span class="nb-dd"><button type="button" class="nb-dd-btn ' + show.status + '" data-nb="menu"><span>' + esc(STATUS[show.status]) + '</span>' + CHEV + '</button>' +
        '<div class="nb-dd-menu">' + ORDER.map((k) => '<button type="button" class="nb-dd-opt' + (show.status === k ? ' selected' : '') + '" data-nb-status="' + k + '">' + STATUS[k] + '</button>').join('') +
        '<button type="button" class="nb-dd-opt' + (show.auto ? ' selected' : '') + '" data-nb-status="auto">Automatisch erkennen</button></div></span></span>' +
        '<span class="nb-item"><span class="nb-key">' + (show.movie ? 'Film' : 'Folgen') + '</span><span class="nb-val">' + esc(prog) + '</span></span>' +
        '<span class="nb-item"><span class="nb-key">Wertung</span><span class="nb-stars">' +
        [1, 2, 3, 4, 5].map((n) => '<button type="button" class="nb-star' + (n <= show.rating ? ' on' : '') + '" data-nb-rate="' + n + '" title="' + n + ' von 5">' + ICON.star + '</button>').join('') + '</span></span>' +
        '<span class="nb-item"><button type="button" class="nb-btn' + (show.wl ? ' on' : '') + '" data-nb="wl" title="' + (show.wl ? 'Von der Merkliste nehmen' : 'Auf die Merkliste') + '">' + BOOKMARK + 'Merkliste</button></span>' +
        '<span class="nb-item push"><button type="button" class="nb-btn" data-nb="open">In Meine Serien' + ICON.open + '</button></span>';
    }
    if (!placed) {
      if (spot.list) spot.parent.insertBefore(bar, spot.list);
      else if (spot.head) spot.head.insertAdjacentElement('afterend', bar);
      else spot.parent.prepend(bar);
    }
  }
  function onBarClick(e) {
    const t = e.target;
    const bar = e.currentTarget;
    e.stopPropagation();
    // the library entry as it is NOW (it is rebuilt after every change)
    const s = showFor(bar.dataset.name, bar.dataset.alt);
    if (t.closest('[data-nb="add"]')) return addToWatchlist(bar.dataset.name, bar.dataset.movie === '1');
    if (!s) return;
    if (t.closest('[data-nb="menu"]')) { bar.querySelector('.nb-dd').classList.toggle('open'); return; }
    const stt = t.closest('[data-nb-status]');
    if (stt) { closeBarMenu(); return setStatus(s, stt.dataset.nbStatus); }
    const rate = t.closest('[data-nb-rate]');
    if (rate) {
      const n = +rate.dataset.nbRate, next = s.rating === n ? 0 : n;
      patchItem(s, { rating: next });
      if (next) pushAnilist(s, { rating: next });
      return;
    }
    if (t.closest('[data-nb="wl"]')) return patchItem(s, { wl: !s.wl });
    if (t.closest('[data-nb="open"]')) chrome.runtime.sendMessage({ type: 'NINA_OPEN_LIBRARY', hash: 'show/' + encodeURIComponent(s.key) });
  }
  document.addEventListener('mousedown', (e) => {
    const dd = document.querySelector('.nb-dd.open');
    if (dd && !dd.contains(e.target)) { dd.classList.remove('open'); scan(); }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeBarMenu()) { e.stopPropagation(); scan(); }
  }, true);

  // ── Native Watchlist Sync (Prime Video) ────────────────────────────────
  function findNativeWatchlistButton(el) {
    if (!el || typeof el.closest !== 'function') return null;
    if (el.closest('.nina-bar, .nina-toast, [data-nb]')) return null;

    const btn = el.closest('button, a, [role="button"]');
    if (!btn || btn.closest('.nina-bar, .nina-toast, [data-nb]')) return null;

    const autoId = (btn.getAttribute('data-automation-id') || '') + ' ' + (btn.getAttribute('data-testid') || '') + ' ' + (btn.getAttribute('data-action') || '');
    if (/watchlist|merkliste/i.test(autoId)) return btn;

    const label = (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '');
    if (/watchlist|merkliste/i.test(label)) return btn;

    const text = (btn.textContent || '').trim();
    if (/^(?:\+\s*)?(?:zur\s+|auf\s+die\s+|in\s+)?(?:watchlist|merkliste)/i.test(text)) return btn;

    return null;
  }

  function isNativeWatchlistActive(btn) {
    if (!btn) return false;
    const autoId = (btn.getAttribute('data-automation-id') || '') + ' ' + (btn.getAttribute('data-testid') || '');
    const label = (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '') + ' ' + (btn.textContent || '');
    const pressed = btn.getAttribute('aria-pressed');

    if (/remove|entfernen|loeschen/i.test(autoId)) return true;
    if (/add/i.test(autoId)) return false;

    if (pressed === 'true') return true;
    if (pressed === 'false') return false;

    if (/aus der watchlist|von der watchlist|von watchlist|remove from watchlist|auf der watchlist|in watchlist|in ihrer watchlist|in your watchlist|auf der merkliste/i.test(label)) {
      return true;
    }
    if (/hinzufügen|auf die watchlist|zur watchlist|add to watchlist|auf ihre watchlist/i.test(label)) {
      return false;
    }

    const svg = btn.querySelector('svg');
    if (svg) {
      const html = svg.innerHTML || '';
      if (/check|M9 16\./i.test(html)) return true;
    }
    if (/(?:^|\s)(?:active|checked|selected|in-list)(?:\s|$)/i.test(btn.className)) return true;

    return false;
  }

  function extractCardInfo(card) {
    let name = card.getAttribute('data-card-title') || '';
    if (!name) {
      const img = card.querySelector('img[alt]');
      if (img && img.alt && img.alt.trim().length > 1 && !/^(prime|amazon|logo|poster)$/i.test(img.alt.trim())) {
        name = img.alt.trim();
      }
    }
    if (!name) {
      const a = card.querySelector('a[aria-label]');
      if (a && a.getAttribute('aria-label')) {
        name = a.getAttribute('aria-label').trim();
      }
    }
    if (!name) {
      const h = card.querySelector('h1, h2, h3, h4, [class*="title" i], [data-automation-id="title"]');
      if (h && h.textContent.trim()) {
        name = h.textContent.trim();
      }
    }
    if (!name) return null;

    const cleanName = clean(name.replace(/\s*[\[(](?:dt\.?\s*\/?\s*OV|OV\s*\/?\s*OmU|dt\.?\s*\/?\s*OmU|dt\.?|OV|OmU|UHD|4K(?:\s*UHD)?|HD|Original Version|German Audio|English Subtitled|Subbed|Dubbed)[\])]\s*$/i, ''));
    const cardText = (card.textContent || '');
    const isMovie = !/(?:Staffel|Season)\s*\d+/i.test(cardText) && !/Staffeln|Seasons/i.test(cardText);
    return { name: cleanName || name, alt: (cleanName && cleanName !== name) ? name : '', movie: isMovie };
  }

  function resolveTitleForElement(btn, page) {
    const card = btn.closest('[data-card-title], [data-testid*="card" i], [data-automation-id*="card" i], article, [class*="Card" i], [class*="card" i], [class*="CarouselItem" i], [class*="carousel" i] > div, [class*="slider" i] > div, li');
    if (card && card !== document.body && !card.querySelector('h1')) {
      const info = extractCardInfo(card);
      if (info && info.name) return info;
    }

    if (page && page.series) {
      return { name: page.series, alt: page.alt || '', movie: !!page.movie };
    }

    const h1 = document.querySelector('h1, [data-automation-id="title"]');
    if (h1) {
      const h1img = h1.querySelector('img');
      let titleText = (h1img && h1img.alt) || clean(h1.textContent) || '';
      if (titleText) {
        const cleanName = clean(titleText.replace(/\s*[\[(](?:dt\.?\s*\/?\s*OV|OV\s*\/?\s*OmU|dt\.?\s*\/?\s*OmU|dt\.?|OV|OmU|UHD|4K(?:\s*UHD)?|HD|Original Version|German Audio|English Subtitled|Subbed|Dubbed)[\])]\s*$/i, ''));
        const sm = /(?:Staffel|Season)\s*(\d+)/i.exec(document.title + ' ' + (document.querySelector('[data-automation-id="season-selector"], [data-testid="season-selector"]') || {}).textContent);
        return { name: cleanName || titleText, alt: (cleanName && cleanName !== titleText) ? titleText : '', movie: !sm };
      }
    }

    return null;
  }

  let lastSyncToast = 0;
  function syncWatchlistAction(info, add, silent) {
    const s = showFor(info.name, info.alt);
    if (add) {
      if (s) {
        if (!s.wl) {
          patchItem(s, { wl: true });
          if (!silent && Date.now() - lastSyncToast > 1000) {
            lastSyncToast = Date.now();
            toast('NINA: „' + s.name + '“ zur Merkliste hinzugefügt');
          }
        }
      } else {
        addToWatchlist(info.name, info.movie).then((it) => {
          if (!silent && Date.now() - lastSyncToast > 1000) {
            lastSyncToast = Date.now();
            toast('NINA: „' + (it ? it.name : info.name) + '“ zur Merkliste hinzugefügt');
          }
        }).catch(() => {
          if (!silent && Date.now() - lastSyncToast > 1000) {
            lastSyncToast = Date.now();
            toast('NINA: „' + info.name + '“ zur Merkliste hinzugefügt');
          }
        });
      }
    } else {
      if (s && s.wl) {
        patchItem(s, { wl: false });
        if (!silent && Date.now() - lastSyncToast > 1000) {
          lastSyncToast = Date.now();
          toast('NINA: „' + s.name + '“ von der Merkliste entfernt');
        }
      }
    }
  }

  function handleNativeWatchlistClick(e) {
    if (PLATFORM !== 'prime') return;
    const btn = findNativeWatchlistButton(e.target);
    if (!btn) return;

    const wasActive = isNativeWatchlistActive(btn);
    const willAdd = !wasActive;

    let page = null;
    try { page = PAGES.prime(); } catch (_) {}
    const info = resolveTitleForElement(btn, page);
    if (!info || !info.name) return;

    syncWatchlistAction(info, willAdd);

    setTimeout(() => {
      const isNowActive = isNativeWatchlistActive(btn);
      if (isNowActive !== wasActive) {
        const confirmedAdd = isNowActive;
        const s = showFor(info.name, info.alt);
        if (confirmedAdd && (!s || !s.wl)) {
          syncWatchlistAction(info, true, true);
        } else if (!confirmedAdd && s && s.wl) {
          syncWatchlistAction(info, false, true);
        }
      }
    }, 400);
  }

  const syncedNativeUrls = new Set();
  function trySyncNativeWatchlist(page, show) {
    if (PLATFORM !== 'prime' || !page || !page.series) return;
    const urlKey = location.pathname;
    if (syncedNativeUrls.has(urlKey)) return;

    const btn = document.querySelector(
      '[data-automation-id*="watchlist" i], [data-testid*="watchlist" i], ' +
      'button[aria-label*="Watchlist" i], a[aria-label*="Watchlist" i], ' +
      'button[aria-label*="Merkliste" i], a[aria-label*="Merkliste" i], ' +
      '[data-automation-id="action-button-list"] button, [data-testid="action-buttons"] button, ' +
      '.av-actions button, #dv-action-box button'
    );
    const nativeBtn = findNativeWatchlistButton(btn);
    if (!nativeBtn) return;

    if (isNativeWatchlistActive(nativeBtn)) {
      syncedNativeUrls.add(urlKey);
      if (!show) {
        addToWatchlist(page.series, page.movie).then((it) => {
          toast('NINA: „' + (it ? it.name : page.series) + '“ aus Prime-Watchlist übernommen');
        }).catch(() => {});
      } else if (!show.wl && !show.item) {
        patchItem(show, { wl: true });
        toast('NINA: „' + show.name + '“ aus Prime-Watchlist übernommen');
      }
    }
  }

  document.addEventListener('click', handleNativeWatchlistClick, true);

  // ── Scan the show page ────────────────────────────────────────────────
  function scan() {
    if (busy || !ready) return;
    busy = true;
    // a timer, not requestAnimationFrame: that one stops in background tabs
    setTimeout(() => {
      busy = false;
      let page = null;
      try { page = PAGES[PLATFORM](); } catch (_) {}
      if (!page || !page.series) {
        for (const b of document.querySelectorAll('.nina-sm-box, .nina-bar')) b.remove();
        return;
      }
      if (page.cr) {
        const s = showFor(page.series, page.alt);
        if (s) ensureLookup(s);
        try { renderBar(page, s); } catch (_) {}
        return;
      }
      recordStruct(page);
      recordPage(page);
      tryPlay(page);
      const show = showFor(page.series, page.alt);
      if (show) ensureLookup(show);
      const seasons = show ? C.metaSeasons(show.meta) : [];
      const own = struct[PLATFORM + ':' + C.norm(page.series)];
      const learned = {};
      for (const it of page.items) {
        const key = keyOf(page.series, it.season, it.episode);
        let entry = null;
        if (show) {
          const info = show.absInfo.get(C.absOf(it.season, it.episode, own, seasons));
          if (info) entry = { status: info.status, frac: info.frac, via: info.platform !== PLATFORM && SERVICE_NAMES[info.platform] ? info.platform : null };
        }
        // the service's own progress (also episodes watched before NINA)
        if (it.native > 0.01 && (!entry || (entry.status !== 'watched' && it.native * 100 >= watchedThreshold))) {
          const stt = it.native * 100 >= watchedThreshold ? 'watched' : 'started';
          if (!st[key] || (st[key].status !== 'watched' && stt === 'watched')) {
            learned[key] = {
              ...(st[key] || {}), platform: PLATFORM, series: page.series, season: it.season, episode: it.episode,
              status: stt, lastPosition: it.native, duration: 1, fromPage: true, updatedAt: Date.now()
            };
          }
          if (!entry || entry.status !== 'watched') entry = { status: stt, frac: it.native, via: null };
        }
        mark(it.host, opts.track ? entry : null);
      }
      // keep them, so they show up in the library and sync
      if (opts.track && Object.keys(learned).length) {
        st = { ...st, ...learned };
        chrome.storage.local.get([ST_KEY], (r) => chrome.storage.local.set({ [ST_KEY]: { ...(r[ST_KEY] || {}), ...learned } }));
      }
      try { renderBar(page, show); } catch (_) {}
      try { trySyncNativeWatchlist(page, show); } catch (_) {}
    }, 30);
  }

  // ── Badges on posters ─────────────────────────────────────────────────
  const POSTERS = {
    crunchyroll() { return []; },
    prime() {
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/detail/"]')) {
        const img = a.querySelector('img');
        if (!img) continue;
        const host = sized(hostOf(img));
        if (host) out.push({ text: img.alt || a.getAttribute('aria-label') || '', host });
      }
      return out;
    },
    disney() {
      const out = [];
      for (const a of document.querySelectorAll('a[href*="/browse/entity-"]')) {
        const text = (a.getAttribute('aria-label') || '').split('\n')[0];
        const host = sized(a);
        if (text && host && host.getBoundingClientRect().width < 900) out.push({ text, host });
      }
      return out;
    },
    joyn() {
      const out = [];
      for (const a of document.querySelectorAll('a[href^="/serien/"], a[href^="/filme/"]')) {
        const href = a.getAttribute('href');
        if (/\/genre\//.test(href) || href.split('/').length < 3) continue;
        const img = a.querySelector('img');
        const host = sized(img || a);
        const text = (a.getAttribute('aria-label') || '').split('. ')[0] || href.split('/')[2].replace(/-/g, ' ');
        if (host && host.getBoundingClientRect().width < 900) out.push({ text, host });
      }
      return out;
    },
    netflix() {
      const out = [];
      for (const a of document.querySelectorAll('a[aria-label]')) {
        const r = a.getBoundingClientRect();
        if (r.width < 90 || r.height < 50 || r.width > 700 || a.closest('.nina-bar, [role="dialog"], header, nav')) continue;
        out.push({ text: a.getAttribute('aria-label'), host: a });
      }
      return out;
    }
  };
  // [icon, text] of the badge on a poster
  function badgeFor(s) {
    if (s.status === 'done') return ['check', 'Gesehen'];
    if (s.status === 'watching' || s.status === 'rewatching') return ['play', s.movie ? 'Angefangen' : s.total ? Math.min(s.watched, s.total) + '/' + s.total : 'Schaue ich'];
    if (s.status === 'paused') return ['pause', 'Pausiert'];
    if (s.status === 'dropped') return ['close', 'Abgebrochen'];
    return s.wl ? ['bookmark', 'Merkliste'] : ['clock', 'Geplant'];
  }
  // exact title only — "Navy CIS: Origins" is not "Navy CIS". Disney+ puts
  // the title and its teaser into one label ("Adults Staffel 2 jetzt …"): there
  // the first words may be the title, as long as it doesn't go on after ":" / "-".
  function matchShow(text, titleFirst) {
    // Disney+ sometimes starts with its own label: "Label: Neuer Film Demon Slayer …"
    const first = String(text).split('\n')[0].trim().replace(/^Label:\s*Neue[rs]?\s+\S+\s+/i, '');
    const t = C.norm(first);
    if (t.length < 3) return null;
    if (idx.has(t)) return idx.get(t);
    if (!titleFirst) return null;
    const words = first.split(/\s+/);
    for (let k = Math.min(8, words.length - 1); k >= 1; k--) {
      if (/[:–—-]$/.test(words[k - 1])) continue;
      const n = C.norm(words.slice(0, k).join(' '));
      if (n.length >= 3 && idx.has(n)) return idx.get(n);
    }
    return null;
  }
  let postersBusy = false;
  function scanPosters() {
    if (postersBusy || !ready) return;
    postersBusy = true;
    setTimeout(() => {
      postersBusy = false;
      const live = new Set();
      if (lib.siteBadges && idx.size) {
        let list = [];
        try { list = POSTERS[PLATFORM](); } catch (_) {}
        for (const { text, host } of list) {
          const s = matchShow(text, PLATFORM === 'disney');
          if (!s || s.status === 'planned' && !s.wl && !s.item) continue;
          live.add(host);
          let b = host.querySelector(':scope > .nina-pb');
          const [ic, txt] = badgeFor(s);
          if (!b) { b = document.createElement('span'); host.appendChild(b); host.classList.add('nina-pb-host'); }
          if (b.dataset.l !== ic + '|' + txt) { b.dataset.l = ic + '|' + txt; b.innerHTML = ICON[ic] + '<span>' + esc(txt) + '</span>'; }
          const cls = 'nina-pb ' + s.status;
          if (b.className !== cls) b.className = cls;
        }
      }
      for (const b of document.querySelectorAll('.nina-pb')) if (!live.has(b.parentElement)) b.remove();
    }, 300);
  }
  window.addEventListener('scroll', scanPosters, { passive: true, capture: true });

  setInterval(() => { scan(); scanPosters(); }, 1800);
  window.addEventListener('popstate', () => { scan(); scanPosters(); });
})();
