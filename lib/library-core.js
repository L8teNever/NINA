// library-core.js — the brain of "Meine Serien", shared by the library page
// and the content scripts on the streaming sites (so both always agree).
//
// build(ctx) merges everything NINA knows into ONE entry per show/film:
//   tracked   : episodes marked on Crunchyroll (nina_cr_watch_status) and on
//               Prime / Disney+ / Joyn / Netflix (nina_stream_watch_status)
//   items     : shows/films added by the user (sync "nlib:<ref>"), with the
//               user's own state: status, watchlist flag, rating, favourite
//   meta      : data from TVmaze / AniList / TMDB (seasons, episode counts)
//   lookup    : which online show a tracked name belongs to
//
// Episode numbering differs between services (Crunchyroll splits a season
// in two, Netflix counts all in one …). Everything is therefore mapped to an
// ABSOLUTE episode number (1 … N over the whole show):
//   • numbered services: abs = episodes of the earlier seasons + number, the
//     season sizes taken from what NINA saw on the service (struct), else
//     from the data source;
//   • Crunchyroll (no episode numbers): "k watched" = the first k episodes.
// Watched sets of all services are merged by that number, so an episode
// seen on Crunchyroll counts as seen on Joyn, too.
//
// Status (6, like AniList): watching, planned, done, rewatching, paused,
// dropped. Computed automatically from the activity; a status the user sets
// by hand wins until new activity happens after it.

(function () {
  'use strict';
  if (self.NinaLibCore) return;

  const STATUS = {
    watching: 'Schaue ich', planned: 'Geplant', done: 'Abgeschlossen',
    rewatching: 'Schaue erneut', paused: 'Pausiert', dropped: 'Abgebrochen'
  };
  const STATUS_ORDER = ['watching', 'planned', 'done', 'rewatching', 'paused', 'dropped'];
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const hueOf = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) % 360; return x; };
  const onlineRef = (r) => (r && !String(r).startsWith('local:') ? r : null);
  const localRef = (name) => 'local:' + norm(name);

  // ── Tracked episodes → groups per service and name ──────────────────────
  function groupTracked(cr, st) {
    const map = {};
    const grp = (platform, name) => {
      const key = platform + ':' + norm(name);
      return map[key] || (map[key] = { key, platform, name, entries: [], seasons: [], updatedAt: 0, url: '', movie: false });
    };
    for (const [id, e] of Object.entries(cr || {})) {
      if (!e) continue;
      const name = e.series || e.seriesHint;
      if (!name) continue;
      if (id.startsWith('season:')) {
        if (e.episodes) grp('crunchyroll', name).seasons.push({ title: e.seasonTitle || '', total: e.episodes, watched: e.watchedEpisodes || 0 });
        continue;
      }
      if (e.status !== 'watched' && e.status !== 'started') continue;
      const g = grp('crunchyroll', name);
      g.entries.push({
        id, platform: 'crunchyroll', status: e.status, season: null, episode: null, seasonTitle: e.seasonTitle || '',
        title: e.title || '', frac: e.status === 'watched' ? 1 : (e.duration > 0 ? e.lastPosition / e.duration : 0),
        updatedAt: e.updatedAt || 0, url: 'https://www.crunchyroll.com/watch/' + id, passive: !!e.fromAnilist
      });
      if ((e.updatedAt || 0) > g.updatedAt) { g.updatedAt = e.updatedAt || 0; g.url = 'https://www.crunchyroll.com/watch/' + id; }
    }
    for (const [id, e] of Object.entries(st || {})) {
      if (!e || !e.series || !e.platform || (e.status !== 'watched' && e.status !== 'started')) continue;
      const g = grp(e.platform, e.series);
      if (e.movie) g.movie = true;
      g.entries.push({
        id, platform: e.platform, status: e.status, season: e.season || 1, episode: e.movie ? null : e.episode, movie: !!e.movie,
        title: e.title || '', frac: e.status === 'watched' ? 1 : (e.duration > 1 ? e.lastPosition / e.duration : (e.lastPosition || 0)),
        updatedAt: e.updatedAt || 0, url: e.url || '', passive: !!(e.fromPage || e.via)
      });
      if ((e.updatedAt || 0) > g.updatedAt) { g.updatedAt = e.updatedAt || 0; if (e.url) g.url = e.url; }
    }
    return map;
  }

  // ── Season structure / absolute numbers ────────────────────────────────
  const metaSeasons = (meta) => (meta && meta.seasons ? meta.seasons.slice().sort((a, b) => a.n - b.n) : []);
  function sizeOf(k, own, seasons) {
    if (own && own[k]) return own[k];
    const s = seasons.find((x) => x.n === k);
    return s && s.eps ? s.eps : null;
  }
  // abs number of (season, episode) in the numbering of one service
  function absOf(season, episode, own, seasons) {
    const s = season || 1;
    let before = 0;
    for (let k = 1; k < s; k++) {
      const z = sizeOf(k, own, seasons);
      if (z == null) return 'S' + s + 'E' + episode; // unknown structure: stays comparable only with itself
      before += z;
    }
    return before + episode;
  }
  // season/episode in the data source's numbering → abs
  function canonAbs(show, season, episode) {
    const seasons = metaSeasons(show.meta);
    let before = 0;
    for (const s of seasons) { if (s.n >= season) break; before += s.eps || 0; }
    return before + episode;
  }
  // abs → { season, episode } in the data source's numbering
  function canonOf(show, abs) {
    const seasons = metaSeasons(show.meta);
    let left = abs;
    for (const s of seasons) { if (left <= (s.eps || 0)) return { season: s.n, episode: left }; left -= s.eps || 0; }
    return null;
  }

  const better = (a, b) => !b || (a.status === 'watched' && b.status !== 'watched') ||
    (a.status === b.status && (a.updatedAt || 0) > (b.updatedAt || 0));

  // ── One show ────────────────────────────────────────────────────────────
  function makeShow(m, ctx) {
    const meta = m.ref ? ctx.meta[m.ref] || null : null;
    const item = ctx.items[m.ref || localRef(m.name)] || (m.ref ? null : ctx.items[localRef(m.name)] || null);
    const seasons = metaSeasons(meta);
    const movie = !!((meta && meta.type === 'movie') || (item && item.type === 'movie') || m.groups.some((g) => g.movie));
    const absInfo = new Map();
    const put = (abs, info) => { if (better(info, absInfo.get(abs))) absInfo.set(abs, info); };
    const entries = [];

    for (const g of m.groups) {
      const own = ctx.struct && ctx.struct[g.key];
      let crWatched = 0;
      if (g.platform === 'crunchyroll') {
        const bySeason = new Map();
        for (const s of g.seasons) bySeason.set(s.title, Math.max(bySeason.get(s.title) || 0, s.watched));
        crWatched = [...bySeason.values()].reduce((a, b) => a + b, 0);
        crWatched = Math.max(crWatched, g.entries.filter((e) => e.status === 'watched').length);
      }
      for (const e of g.entries) {
        entries.push(e);
        if (g.platform === 'crunchyroll') {
          if (e.status === 'started') put('cr:' + e.id, { status: 'started', frac: e.frac, platform: 'crunchyroll', url: e.url, updatedAt: e.updatedAt, passive: e.passive, title: e.title });
          continue;
        }
        const abs = movie || e.movie ? 1 : e.episode ? absOf(e.season, e.episode, own, seasons) : null;
        if (abs == null) continue;
        put(abs, { status: e.status, frac: e.frac, platform: e.platform, url: e.url, updatedAt: e.updatedAt, passive: e.passive, title: e.title, season: e.season, episode: e.episode });
      }
      // Crunchyroll: first k episodes
      const crUpdated = g.entries.filter((e) => e.status === 'watched').reduce((a, e) => Math.max(a, e.updatedAt || 0), g.updatedAt);
      const crPassive = g.entries.length > 0 && g.entries.every((e) => e.passive);
      for (let i = 1; i <= crWatched; i++) put(i, { status: 'watched', frac: 1, platform: 'crunchyroll', url: g.url, updatedAt: crUpdated, passive: crPassive, title: '' });
    }
    // ticked by hand
    for (const [k, v] of Object.entries((item && item.eps) || {})) {
      const x = /^S(\d+)E(\d+)$/.exec(k);
      if (!x) continue;
      // without season data: the same numbering the services get (season 1 = 1…n), so a tick
      // here and the same episode on a service are one episode
      const abs = seasons.length ? canonAbs({ meta }, +x[1], +x[2]) : absOf(+x[1], +x[2], null, seasons);
      if (v) {
        const isPassive = !!(item && (item.imported || item.fromAnilist || item.importedFrom === 'anilist' || String(item.ref || '').startsWith('anilist:')));
        absInfo.set(abs, {
          status: 'watched',
          frac: 1,
          platform: isPassive ? 'anilist' : 'manual',
          url: '',
          updatedAt: (item && item.epsAt) || 0,
          passive: isPassive,
          imported: isPassive,
          title: ''
        });
      } else {
        absInfo.delete(abs);
      }
    }

    const aliasKeys = [...new Set([m.key, m.ref, 'name:' + norm(m.name), localRef(m.name), ...m.groups.map((g) => g.key)].filter(Boolean))];
    const vw = viewsOf(m, item, ctx, seasons, movie, aliasKeys);

    const total = movie ? 1 : (meta && meta.totalEpisodes) || null;
    let watched = 0, started = 0;
    for (const v of absInfo.values()) { if (v.status === 'watched') watched++; else started++; }
    if (total && watched > total) watched = total;

    let lastAt = 0, lastPassive = 0, last = null;
    for (const v of absInfo.values()) {
      if (v.passive) lastPassive = Math.max(lastPassive, v.updatedAt || 0);
      else if ((v.updatedAt || 0) >= lastAt) { lastAt = v.updatedAt || 0; last = v; }
    }
    if (item && item.epsAt) lastAt = Math.max(lastAt, item.epsAt);
    const activeAt = lastAt;                 // real watching (no page-learned entries)
    if (!lastAt) lastAt = lastPassive;
    if (!last) last = [...absInfo.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;

    // per-service summary
    const platforms = m.groups.map((g) => ({
      platform: g.platform, url: g.url, updatedAt: g.updatedAt,
      watched: g.platform === 'crunchyroll'
        ? Math.min(total || 1e9, Math.max(g.entries.filter((e) => e.status === 'watched').length, g.seasons.reduce((a, s) => a + s.watched, 0)))
        : new Set(g.entries.filter((e) => e.status === 'watched').map((e) => e.episode || 'm')).size,
      started: g.entries.filter((e) => e.status === 'started').length
    })).sort((a, b) => b.updatedAt - a.updatedAt);

    const mainPf = (item && item.platform) || (platforms[0] ? platforms[0].platform : null);
    const pfObj = platforms.find((p) => p.platform === mainPf) || platforms[0];
    const show = {
      // every key this show has had (before / after the online match): a link
      // to its page keeps working when the match arrives
      aliases: aliasKeys,
      key: m.key, name: m.name, title: (meta && !m.groups.length && meta.name) || (item && !m.groups.length && item.name) || m.name,
      ref: m.ref, item, meta, movie, groups: m.groups.map((g) => ({ key: g.key, platform: g.platform, name: g.name, movie: g.movie })),
      platform: mainPf, platforms, url: pfObj ? pfObj.url : '',
      entries, absInfo, watched, started, total,
      views: vw.views, edited: vw.edited, armAt: vw.armAt,
      lastViewAt: Math.max(0, ...[...vw.views.values()].map((v) => v[v.length - 1] || 0)),
      lastAt, activeAt, last,
      updatedAt: lastAt || (item && item.addedAt) || 0,
      hue: hueOf(m.name),
      poster: (meta && meta.poster) || (item && item.poster) || '',
      wl: !!(item && item.wl), rating: (item && item.rating) || 0, fav: !!(item && item.fav)
    };
    // complete passes: every episode seen n times (a film: how often it was seen)
    show.runs = total && vw.views.size >= total
      ? Math.min(...Array.from({ length: total }, (_, i) => (vw.views.get(i + 1) || []).length)) : 0;
    const st = computeStatus(show, item, ctx.now, ctx.settings.pauseDays);
    show.status = st.status;
    show.auto = st.auto;
    show.persist = st.completedAt && (!item || item.completedAt !== st.completedAt) ? { completedAt: st.completedAt } : null;
    return show;
  }

  // ── Viewing dates (lib/view-log-bg.js) ──────────────────────────────────
  // abs → sorted dates. From the log of every service, else the moment the
  // episode became watched; dates edited by hand ('ed:<key>|<abs>') win.
  const SAME_VIEW = 2 * 3600e3;
  function mergeDates(list) {
    const out = [];
    for (const t of list.filter((x) => x > 0).sort((a, b) => a - b)) if (!out.length || t - out[out.length - 1] >= SAME_VIEW) out.push(t);
    return out;
  }
  function viewsOf(m, item, ctx, seasons, movie, aliasKeys) {
    const log = ctx.views || {};
    const by = new Map();
    let armAt = 0;
    const add = (abs, list) => { if (abs == null || !list.length) return; by.set(abs, (by.get(abs) || []).concat(list)); };
    const logged = (k, e) => {
      const L = log[k];
      if (L && L.arm) armAt = Math.max(armAt, L.arm);
      if (L && L.v && L.v.length) return L.v;
      return e.status === 'watched' && !e.passive && e.updatedAt ? [e.updatedAt] : [];
    };
    for (const g of m.groups) {
      const own = ctx.struct && ctx.struct[g.key];
      if (g.platform === 'crunchyroll') {
        // no episode numbers there: the watched ones in the order they were first seen
        const w = g.entries.filter((e) => e.status === 'watched')
          .map((e) => ({ e, v: logged('cr:' + e.id, e) }))
          .sort((a, b) => (a.v[0] || 0) - (b.v[0] || 0));
        w.forEach((x, i) => add(movie ? 1 : i + 1, x.v));
        for (const e of g.entries) if (e.status !== 'watched') logged('cr:' + e.id, e);
        continue;
      }
      for (const e of g.entries) {
        const abs = movie || e.movie ? 1 : e.episode ? absOf(e.season, e.episode, own, seasons) : null;
        add(abs, logged('st:' + e.id, e));
      }
    }
    for (const [k, v] of Object.entries((item && item.eps) || {})) {
      const x = /^S(\d+)E(\d+)$/.exec(k);
      if (!x) continue;
      const abs = movie ? 1 : seasons.length ? canonAbs({ meta: ctx.meta[m.ref] }, +x[1], +x[2]) : absOf(+x[1], +x[2], null, seasons);
      if (v === 0) {
        by.delete(abs);
      } else {
        const at = typeof v === 'number' && v > 1 ? v : item.epsAt;
        if (!by.has(abs) && at) add(abs, [at]);
      }
    }
    // ticked in Meine Serien ('tk:') and edited by hand ('ed:'), under any key the show had
    const keyed = (prefix, fn) => {
      const pre = aliasKeys.map((k) => prefix + k + '|');
      for (const k of Object.keys(log)) {
        if (!k.startsWith(prefix)) continue;
        const p = pre.find((x) => k.startsWith(x));
        if (!p) continue;
        const raw = k.slice(p.length);
        fn(/^\d+$/.test(raw) ? +raw : raw, (log[k].v || []).slice());
      }
    };
    keyed('tk:', (abs, list) => { if (by.has(abs) && item && item.epsAt && by.get(abs).includes(item.epsAt)) by.set(abs, by.get(abs).filter((t) => t !== item.epsAt)); add(abs, list); });
    const views = new Map();
    for (const [abs, list] of by) views.set(abs, mergeDates(list));
    const edited = new Set();
    keyed('ed:', (abs, list) => { views.set(abs, mergeDates(list)); edited.add(abs); });
    return { views, edited, armAt };
  }

  // ── Status ──────────────────────────────────────────────────────────────
  function computeStatus(s, item, now, pauseDays) {
    const manual = item && item.status && (item.manualAt || item.status !== 'planned') ? item.status : null;
    const manualAt = (item && (item.manualAt || item.addedAt)) || 0;
    if (manual && !(s.activeAt > manualAt + 60e3)) return { status: manual, auto: false };
    if (!s.watched && !s.started) return { status: 'planned', auto: true };
    const completedAt = (item && item.completedAt) || 0;
    const slack = 6 * 3600e3;
    // Rewatch: finished once, then episodes are REALLY watched again (a second
    // date in the view log, see view-log-bg.js) — or one is being played again
    // right now (armAt). Opening a page or a stray tick doesn't count.
    const views = s.views || new Map();
    let doneAt = completedAt;
    if (!doneAt && s.total && s.watched >= s.total && views.size >= s.total) {
      doneAt = Math.max(...[...views.values()].map((v) => v[0] || 0));
    }
    if (doneAt) {
      let re = 0;
      for (const v of views.values()) if (v.some((t) => t > doneAt + slack)) re++;
      if (re >= 1) {
        if (s.total && re >= s.total && !(s.meta && /^(Running|RELEASING|Returning Series)$/i.test(s.meta.status || ''))) {
          return { status: 'done', auto: true, completedAt: s.lastViewAt || s.activeAt };
        }
        return { status: 'rewatching', auto: true };
      }
      if (s.armAt > doneAt + slack && now - s.armAt < 2 * 864e5) return { status: 'rewatching', auto: true };
    }
    // Still airing and you are up to date: not finished, not paused — waiting
    // for the next episode. Only when the data source really knows one: many
    // finished shows keep a stale "Running" / "To Be Determined" there (anime
    // on TVmaze especially), and those are done once every episode is seen.
    const running = !s.movie && s.meta && /^(Running|RELEASING|Returning Series|NOT_YET_RELEASED|In Development|To Be Determined)$/i.test(s.meta.status || '');
    const nextKnown = !!(s.meta && s.meta.next && s.meta.next.at > now - 36 * 3600e3);
    if (running && nextKnown && s.total && s.watched >= s.total) return { status: 'watching', auto: true, caughtUp: true };
    if (s.total && s.watched >= s.total) return { status: 'done', auto: true, completedAt: completedAt || s.lastAt };
    if (s.lastAt && now - s.lastAt > (pauseDays || 30) * 864e5) return { status: 'paused', auto: true };
    return { status: 'watching', auto: true };
  }

  // ── Build the whole list ────────────────────────────────────────────────
  // ctx: { cr, st, lookup, items, meta, struct, settings: { pauseDays, sources }, now }
  function build(ctx) {
    ctx = { cr: {}, st: {}, lookup: {}, items: {}, meta: {}, struct: {}, views: {}, now: Date.now(), ...ctx, settings: { pauseDays: 30, sources: {}, ...(ctx.settings || {}) } };
    const tracked = groupTracked(ctx.cr, ctx.st);
    const merged = new Map();     // id -> { key, name, ref, groups }
    const byName = new Map();     // norm name -> merged entry
    const sources = ctx.settings.sources || {};
    // an added show (watchlist …) with the same name is the same show as a tracked one
    const itemByName = new Map();
    for (const it of Object.values(ctx.items)) if (onlineRef(it.ref)) itemByName.set(norm(it.name), it);
    // Every name a show is known by: the service's title, the other titles a partner
    // service knows (ctx.aliases, e.g. AniWorld: German / English / Japanese) and the names
    // of its online match. One shared name = one show, even when two services were matched
    // to different data sources (Crunchyroll "Meine Wiedergeburt als Schleim …" → TMDB,
    // AniWorld "That Time I Got Reincarnated as a Slime" → TVmaze).
    const aliases = ctx.aliases || {};
    const namesOf = (g, ref) => {
      const m = ref ? ctx.meta[ref] : null;
      return [...new Set([g.name, ...(aliases[g.key] || []), m && m.name, ...((m && m.altNames) || [])]
        .map(norm).filter((n, i) => n && (i === 0 || n.length >= 6)))];
    };
    for (const g of Object.values(tracked)) {
      if (sources[g.platform] === false) continue;
      const nk = norm(g.name);
      const byItem = itemByName.get(nk);
      const ref = onlineRef(ctx.lookup[g.key]) || (byItem ? byItem.ref : null);
      const names = namesOf(g, ref);
      let t = (ref && merged.get(ref)) || names.map((n) => byName.get(n)).find(Boolean);
      if (!t) { t = { key: ref || 'name:' + nk, name: g.name, ref: null, refs: [], groups: [] }; merged.set(t.key, t); }
      if (ref && !t.ref) { t.ref = ref; t.key = ref; }
      if (ref) { merged.set(ref, t); if (!t.refs.includes(ref)) t.refs.push(ref); }
      t.groups.push(g);
      t.names = [...new Set([...(t.names || []), ...names])];
      for (const n of names) if (!byName.has(n)) byName.set(n, t);
    }
    const shows = [];
    const used = new Set();
    for (const t of new Set(merged.values())) {
      t.groups.sort((a, b) => b.updatedAt - a.updatedAt);
      t.name = t.groups[0].name;
      for (const r of t.refs) used.add(r);
      // the library entry (status, rating …) may sit under any of the matched refs
      if (!ctx.items[t.ref]) { const other = t.refs.find((r) => ctx.items[r]); if (other) { t.ref = other; t.key = other; } }
      const s = makeShow(t, ctx);
      s.key = t.ref || t.key;
      for (const r of t.refs) if (!s.aliases.includes(r)) s.aliases.push(r);
      s.names = t.names || [];
      shows.push(s);
    }
    for (const it of Object.values(ctx.items)) {
      if (it.ref.startsWith('local:') || used.has(it.ref)) continue;
      if (byName.has(norm(it.name))) continue; // already shown through its tracked episodes
      const s = makeShow({ key: it.ref, name: it.name, ref: it.ref, groups: [] }, ctx);
      s.key = it.ref;
      shows.push(s);
    }
    return shows;
  }

  // name index for matching posters on the streaming sites
  function index(shows) {
    const map = new Map();
    for (const s of shows) {
      const names = [s.name, s.title, s.meta && s.meta.name, ...((s.meta && s.meta.altNames) || []), ...(s.groups || []).map((g) => g.name)];
      for (const n of names) if (n && norm(n).length > 2) map.set(norm(n), s);
      // other titles of the show (already normalised); never take a name another show has as its own
      for (const n of s.names || []) if (n.length > 2 && !map.has(n)) map.set(n, s);
    }
    return map;
  }

  self.NinaLibCore = { STATUS, STATUS_ORDER, norm, hueOf, onlineRef, localRef, groupTracked, build, index, mergeDates, canonAbs, canonOf, absOf, metaSeasons, computeStatus };
})();
