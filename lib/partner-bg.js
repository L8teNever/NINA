// partner-bg.js — lets trusted partner extensions work with "Meine Serien".
//
// A partner is a separate extension (listed in PARTNERS by its ID) that adds a
// service NINA itself does not know. It talks to NINA with
// chrome.runtime.sendMessage(NINA_ID, { type: 'NINA_PARTNER', op, data }) and
// gets { ok, result } / { ok: false, error } back. Messages from any other
// extension are ignored.
//
//   hello      { platform: { id, name, color, anime } }  register the service (shows up
//              in Meine Serien like Netflix & co.) → { hue, threshold }
//   progress   { series, season, episode, movie, title, url, position, duration, played, threshold? }
//              playback of an episode → { status }
//   episode    { series, season, episode, movie, title, url, watched }  tick / untick by hand
//   episodes   { series, list: [[season, episode, title, url], …], watched }  a whole season
//   show       { name, alt, eps: [[season, episode], …], seasonSizes: { season: n } }
//              the library entry + the state of the listed episodes (from every service)
//   shows      { names: […] } → { name: { status, wl, watched, total, movie } }  poster badges
//   setStatus  { name, alt, status }   'watching' | … | 'auto'
//   rate       { name, alt, rating }   0…5
//   watchlist  { name, alt, on, movie }
//   open       { name, alt }            opens the show in Meine Serien
//
// Progress is stored like the content scripts of the built-in services do it
// (nina_stream_watch_status, platform = the partner's id), so the library,
// the cross-service merge, Drive sync and "Gesehen & Angefangen" all apply.

(function () {
  'use strict';
  const C = self.NinaLibCore;
  const P = self.NinaProviders;
  if (!C) return;

  const PARTNERS = ['bbhhoglfcegickgkgolgcdejjndbankn'];   // IDs of trusted partner extensions
  const ST_KEY = 'nina_stream_watch_status';
  const PF_KEY = 'nina_partner_platforms';
  const SET_KEY = 'nina_library_settings';
  const META_KEY = 'nina_library_meta';
  const LOOKUP_KEY = 'nina_library_lookup';
  const STRUCT_KEY = 'nina_stream_struct';
  const ALIAS_KEY = 'nina_partner_alias';   // { 'aniworld:<name>': [other titles] }
  const ITEM_PREFIX = 'nlib:';
  const STARTED_AFTER = 20;

  const localGet = (k) => new Promise((r) => chrome.storage.local.get(k, r));
  const localSet = (o) => new Promise((r) => chrome.storage.local.set(o, r));
  const syncGet = (k) => new Promise((r) => chrome.storage.sync.get(k, r));
  const syncSet = (o) => new Promise((r) => chrome.storage.sync.set(o, r));
  const normH = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const keyOf = (pf, d) => pf + ':' + normH(d.series) + (d.movie ? ':movie' : ':s' + (d.season || 1) + 'e' + d.episode);
  const clean = (s, n = 200) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // one write at a time on nina_stream_watch_status (several frames report at once)
  let queue = Promise.resolve();
  const serial = (fn) => (queue = queue.then(fn, fn));

  async function partnerPlatform(sender) {
    const all = (await localGet([PF_KEY]))[PF_KEY] || {};
    return Object.values(all).find((p) => p.owner === sender) || null;
  }

  // ── the library, built like the library page does ──
  async function library() {
    const l = await localGet(['nina_cr_watch_status', ST_KEY, META_KEY, LOOKUP_KEY, STRUCT_KEY, ALIAS_KEY, 'nina_library_local_items']);
    const all = await syncGet(null);
    const items = {};
    for (const [k, v] of Object.entries(all)) if (k.startsWith(ITEM_PREFIX) && v && v.ref) items[v.ref] = v;
    for (const [ref, v] of Object.entries(l.nina_library_local_items || {})) if (v && v.ref && !items[v.ref]) items[v.ref] = v;
    const set = all[SET_KEY] || {};
    const shows = C.build({
      cr: l.nina_cr_watch_status || {}, st: l[ST_KEY] || {}, lookup: l[LOOKUP_KEY] || {}, items,
      meta: l[META_KEY] || {}, struct: l[STRUCT_KEY] || {}, aliases: l[ALIAS_KEY] || {}, settings: { pauseDays: set.pauseDays || 30, sources: set.sources }
    });
    return { shows, idx: C.index(shows), items, set, struct: l[STRUCT_KEY] || {}, lookup: l[LOOKUP_KEY] || {} };
  }
  // by name: the partner's title, its slug and every alternative title it knows
  function find(lib, name, alt, alts) {
    for (const n of [name, alt, ...(Array.isArray(alts) ? alts.slice(0, 20) : [])]) {
      const s = n && C.norm(n).length > 2 ? lib.idx.get(C.norm(n)) : null;
      if (s) return s;
    }
    return null;
  }
  const byRef = (lib, ref) => (ref && !String(ref).startsWith('local:') ? lib.shows.find((s) => s.ref === ref || s.aliases.includes(ref)) || null : null);
  // by name, else through the online match of the partner's title (the same show under
  // another title in NINA: "Frieren - Nach dem Ende der Reise" ↔ "Frieren")
  async function locate(lib, pf, d) {
    const s = find(lib, d.name, d.alt, d.alts);
    if (s || !pf || !d.name) return s;
    const gk = pf.id + ':' + C.norm(d.name);
    let ref = lib.lookup[gk];
    if (ref === undefined) ref = await ensureLookup(pf.id, d.name, d.movie);
    return byRef(lib, ref);
  }

  const itemFor = (s, movie) => s.item || { ref: s.ref || C.localRef(s.name), name: s.name, poster: s.poster, type: (s.movie || movie) ? 'movie' : 'show', addedAt: Date.now() };
  async function patchItem(s, patch, movie) {
    const it = { ...itemFor(s, movie), ...patch };
    await syncSet({ [ITEM_PREFIX + it.ref]: it });
    return it;
  }

  // a show the partner reported for the first time: find it online once, so it merges
  // with the same show seen on other services
  // → the online ref ('' = nothing found); once per title and worker run
  const looked = new Map();
  function ensureLookup(pf, name, movie) {
    const gk = pf + ':' + C.norm(name);
    if (!looked.has(gk)) looked.set(gk, runLookup(gk, name, pf, movie));
    return looked.get(gk);
  }
  async function runLookup(gk, name, pf, movie) {
    const l = await localGet([LOOKUP_KEY]);
    const cur = (l[LOOKUP_KEY] || {})[gk];
    if (cur === '' || (cur && !String(cur).startsWith('local:'))) return cur;
    if (!P) return '';
    const set = (await syncGet([SET_KEY]))[SET_KEY] || {};
    const provs = { tvmaze: true, anilist: true, tmdb: false, ...(set.providers || {}) };
    P.setTmdbKey(set.tmdbKey || '');
    const enabled = Object.keys(provs).filter((p) => provs[p] && (p !== 'tmdb' || set.tmdbKey));
    if (!enabled.length) return '';
    const hit = await P.lookup(name, pf, enabled, movie ? 'movie' : 'show').catch(() => null);
    const l2 = await localGet([LOOKUP_KEY, META_KEY]);
    const lookup = { ...(l2[LOOKUP_KEY] || {}), [gk]: hit ? hit.ref : '', __v: (l2[LOOKUP_KEY] || {}).__v || 2 };
    const out = { [LOOKUP_KEY]: lookup };
    if (hit) out[META_KEY] = { ...(l2[META_KEY] || {}), [hit.ref]: { ...hit, fetchedAt: 0 } };
    await localSet(out);
    return hit ? hit.ref : '';
  }

  // the other titles a partner knows for a show (AniWorld: German / English / Japanese …)
  async function rememberAliases(pf, name, alts) {
    if (!pf || !name || !Array.isArray(alts)) return;
    const list = [...new Set(alts.map((a) => clean(a, 120)).filter((a) => a.length > 2))].slice(0, 15);
    if (!list.length) return;
    const k = pf.id + ':' + C.norm(name);
    const all = (await localGet([ALIAS_KEY]))[ALIAS_KEY] || {};
    if (JSON.stringify(all[k] || []) === JSON.stringify(list)) return;
    all[k] = list;
    await localSet({ [ALIAS_KEY]: all });
  }

  // ── ops ──
  const OPS = {
    async hello(d, sender) {
      const p = d.platform || {};
      const id = normH(p.id).replace(/-/g, '');
      if (!id || ['crunchyroll', 'prime', 'disney', 'joyn', 'netflix', 'youtube', 'manual'].includes(id)) throw new Error('Ungültiger Anbieter');
      const all = (await localGet([PF_KEY]))[PF_KEY] || {};
      all[id] = { id, name: clean(p.name, 40) || id, color: /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#7c5cff', anime: !!p.anime, owner: sender, at: Date.now() };
      await localSet({ [PF_KEY]: all });
      const set = (await syncGet([SET_KEY]))[SET_KEY] || {};
      const t = parseFloat((await localGet(['joyn_yt_watched_threshold'])).joyn_yt_watched_threshold);
      return { hue: typeof set.seed === 'number' ? set.seed : 186, threshold: isFinite(t) ? t : 90, platform: all[id] };
    },

    progress: (d, sender) => serial(async () => {
      const pf = await partnerPlatform(sender);
      if (!pf) throw new Error('Erst hello senden');
      if (!d.series || (!d.movie && !(d.episode > 0))) throw new Error('Folge unbekannt');
      if (!(d.duration > 60)) return { status: null };
      if (d.movie && d.duration < 25 * 60) return { status: null };
      const l = await localGet([ST_KEY, 'joyn_yt_watched_threshold']);
      const map = l[ST_KEY] || {};
      const t = parseFloat(l.joyn_yt_watched_threshold);
      // the partner may bring its own "watched from …%" (its setting), else NINA's
      const threshold = +d.threshold >= 50 && +d.threshold <= 100 ? +d.threshold : isFinite(t) ? Math.max(1, Math.min(100, t)) : 90;
      const key = keyOf(pf.id, d);
      const prev = map[key] || {};
      let status = prev.status || null;
      if (d.position / d.duration * 100 >= threshold) status = 'watched';
      else if (!status && (d.played || 0) >= STARTED_AFTER) status = 'started';
      if (!status) return { status: null };
      const isNew = !prev.status;
      map[key] = {
        ...prev, platform: pf.id, series: clean(d.series), season: d.movie ? 1 : (+d.season || 1), episode: d.movie ? undefined : +d.episode,
        movie: !!d.movie, title: clean(d.title) || prev.title || '', status,
        lastPosition: +d.position || 0, duration: +d.duration || 0, url: String(d.url || '').slice(0, 500), updatedAt: Date.now()
      };
      if (map[key].episode === undefined) delete map[key].episode;
      await localSet({ [ST_KEY]: map });
      if (isNew) ensureLookup(pf.id, d.series, d.movie);
      return { status };
    }),

    episode: (d, sender) => serial(async () => {
      const pf = await partnerPlatform(sender);
      if (!pf) throw new Error('Erst hello senden');
      if (!d.series || (!d.movie && !(d.episode > 0))) throw new Error('Folge unbekannt');
      const map = (await localGet([ST_KEY]))[ST_KEY] || {};
      const key = keyOf(pf.id, d);
      if (d.watched) {
        map[key] = {
          ...(map[key] || {}), platform: pf.id, series: clean(d.series), season: d.movie ? 1 : (+d.season || 1), movie: !!d.movie,
          ...(d.movie ? {} : { episode: +d.episode }), title: clean(d.title) || (map[key] || {}).title || '',
          status: 'watched', lastPosition: 1, duration: 1, url: String(d.url || '').slice(0, 500), updatedAt: Date.now(), byHand: true
        };
      } else delete map[key];
      await localSet({ [ST_KEY]: map });
      // unticking: also the hand-ticked mark in the library and the same episode on other services is left alone
      if (d.watched) ensureLookup(pf.id, d.series, d.movie);
      return { watched: !!d.watched };
    }),

    // a whole season at once: { series, list: [[season, episode, title, url], …], watched }
    episodes: (d, sender) => serial(async () => {
      const pf = await partnerPlatform(sender);
      if (!pf) throw new Error('Erst hello senden');
      if (!d.series || !Array.isArray(d.list) || !d.list.length) throw new Error('Keine Folgen');
      const map = (await localGet([ST_KEY]))[ST_KEY] || {};
      let n = 0;
      for (const [s, e, title, url] of d.list.slice(0, 400)) {
        if (!(+e > 0)) continue;
        const one = { series: d.series, season: +s || 1, episode: +e };
        const key = keyOf(pf.id, one);
        if (d.watched) {
          if ((map[key] || {}).status === 'watched') continue;
          map[key] = {
            ...(map[key] || {}), platform: pf.id, series: clean(d.series), season: one.season, episode: one.episode, movie: false,
            title: clean(title) || (map[key] || {}).title || '', status: 'watched', lastPosition: 1, duration: 1,
            url: String(url || '').slice(0, 500), updatedAt: Date.now(), byHand: true
          };
        } else if (map[key]) delete map[key];
        n++;
      }
      await localSet({ [ST_KEY]: map });
      if (d.watched) ensureLookup(pf.id, d.series, false);
      return { changed: n };
    }),

    async show(d, sender) {
      const pf = await partnerPlatform(sender);
      if (pf && !d.movie) await rememberAliases(pf, d.name, d.alts);
      // the partner's own season sizes, for the absolute numbering across services
      if (pf && d.seasonSizes && typeof d.seasonSizes === 'object') {
        const k = pf.id + ':' + C.norm(d.name);
        const all = (await localGet([STRUCT_KEY]))[STRUCT_KEY] || {};
        const cur = { ...(all[k] || {}) };
        let changed = false;
        for (const [s, n] of Object.entries(d.seasonSizes)) if (+n > 0 && +n > (cur[s] || 0)) { cur[s] = +n; changed = true; }
        if (changed) { all[k] = cur; await localSet({ [STRUCT_KEY]: all }); }
      }
      const lib = await library();
      const s = await locate(lib, pf, d);
      if (!s) return null;
      const own = pf ? lib.struct[pf.id + ':' + C.norm(d.name)] : null;
      const seasons = C.metaSeasons(s.meta);
      const eps = {};
      for (const [season, ep] of (Array.isArray(d.eps) ? d.eps : []).slice(0, 400)) {
        const info = s.movie ? s.absInfo.get(1) : s.absInfo.get(C.absOf(+season, +ep, own, seasons));
        if (info) eps[season + ':' + ep] = { status: info.status, frac: info.frac, via: pf && info.platform === pf.id ? null : info.platform };
      }
      const pfs = (await localGet([PF_KEY]))[PF_KEY] || {};
      const names = { crunchyroll: 'Crunchyroll', prime: 'Prime Video', disney: 'Disney+', joyn: 'Joyn', netflix: 'Netflix', manual: 'abgehakt' };
      for (const p of Object.values(pfs)) names[p.id] = p.name;
      for (const v of Object.values(eps)) v.via = v.via ? (names[v.via] || v.via) : null;
      return {
        key: s.key, title: s.title, status: s.status, auto: s.auto, rating: s.rating, fav: s.fav, wl: s.wl,
        watched: s.watched, total: s.total, movie: s.movie, poster: s.poster,
        score: s.meta && s.meta.score, eps
      };
    },

    // d.eps (optional): { name: [[season, episode], …] } → per show also eps: { "s:e": status }
    async shows(d, sender) {
      const lib = await library();
      const pf = d.eps ? await partnerPlatform(sender) : null;
      const out = {};
      for (const n of (Array.isArray(d.names) ? d.names : []).slice(0, 300)) {
        const s = find(lib, n, null, d.alts && d.alts[n]);
        if (!s || (s.status === 'planned' && !s.wl && !s.item)) continue;
        out[n] = { status: s.status, wl: s.wl, watched: s.watched, total: s.total, movie: s.movie };
        const want = d.eps && Array.isArray(d.eps[n]) ? d.eps[n].slice(0, 60) : null;
        if (want) {
          const own = pf ? lib.struct[pf.id + ':' + C.norm(n)] : null;
          const seasons = C.metaSeasons(s.meta);
          const eps = {};
          for (const [season, ep] of want) {
            const info = s.absInfo.get(C.absOf(+season, +ep, own, seasons));
            if (info) eps[season + ':' + ep] = info.status;
          }
          out[n].eps = eps;
        }
      }
      return out;
    },

    async setStatus(d, sender) {
      const lib = await library();
      const s = await locate(lib, await partnerPlatform(sender), d);
      if (!s) throw new Error('Nicht in der Bibliothek');
      if (d.status === 'auto') {
        const it = { ...itemFor(s) };
        delete it.status; delete it.manualAt;
        await syncSet({ [ITEM_PREFIX + it.ref]: it });
        return true;
      }
      if (!C.STATUS[d.status]) throw new Error('Unbekannter Status');
      const patch = { status: d.status, manualAt: Date.now() };
      if (d.status === 'done') patch.completedAt = Date.now();
      await patchItem(s, patch);
      return true;
    },

    async rate(d, sender) {
      const lib = await library();
      const s = await locate(lib, await partnerPlatform(sender), d);
      if (!s) throw new Error('Nicht in der Bibliothek');
      await patchItem(s, { rating: Math.max(0, Math.min(5, Math.round(+d.rating || 0))) });
      return true;
    },

    async watchlist(d, sender) {
      const lib = await library();
      let s = await locate(lib, await partnerPlatform(sender), d);
      if (s) { await patchItem(s, { wl: !!d.on }); return true; }
      if (!d.on) return true;
      // not in the library yet: look it up online, put it on the watchlist
      const set = (await syncGet([SET_KEY]))[SET_KEY] || {};
      const provs = { tvmaze: true, anilist: true, tmdb: false, ...(set.providers || {}) };
      if (P) P.setTmdbKey(set.tmdbKey || '');
      const enabled = Object.keys(provs).filter((p) => provs[p] && (p !== 'tmdb' || set.tmdbKey));
      const hit = P && enabled.length ? await P.lookup(clean(d.name), '', enabled, d.movie ? 'movie' : 'show').catch(() => null) : null;
      const ref = hit ? hit.ref : C.localRef(d.name);
      if (hit) {
        const meta = (await localGet([META_KEY]))[META_KEY] || {};
        meta[hit.ref] = { ...hit, fetchedAt: 0 };
        await localSet({ [META_KEY]: meta });
      }
      await syncSet({ [ITEM_PREFIX + ref]: { ref, name: hit ? hit.name : clean(d.name), poster: hit ? hit.poster : '', year: hit && hit.year, network: hit && hit.network, type: d.movie ? 'movie' : 'show', wl: true, addedAt: Date.now() } });
      return true;
    },

    async open(d, sender) {
      const lib = await library();
      const s = await locate(lib, await partnerPlatform(sender), d);
      const hash = s ? 'show/' + encodeURIComponent(s.key) : 'library';
      await chrome.tabs.create({ url: chrome.runtime.getURL('ui/library.html') + '#' + hash });
      return true;
    }
  };

  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    if (!sender || !PARTNERS.includes(sender.id)) return false;
    if (!msg || msg.type !== 'NINA_PARTNER') return false;
    const fn = OPS[msg.op];
    if (!fn) { sendResponse({ ok: false, error: 'Unbekannte Aktion' }); return false; }
    Promise.resolve().then(() => fn(msg.data || {}, sender.id))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((e) => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
    return true;
  });
})();
