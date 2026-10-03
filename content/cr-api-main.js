// cr-api-main.js — runs in Crunchyroll's page (MAIN world) at document_start.
//
// The show page only lists the episodes of the selected season. To show
// "20/25" for every season in the season dropdown, NINA needs all seasons'
// episodes and which of them Crunchyroll counts as fully watched. The page
// already loads exactly that from Crunchyroll's own API with the signed-in
// session; this script notes the session header the page itself uses and,
// when NINA asks (window message), makes the same read-only requests. The
// header never leaves this page: only episode ids / numbers / watched flags
// are posted back to NINA's content script.

(function () {
  'use strict';

  if (window.__ninaCrApiMain) return;
  window.__ninaCrApiMain = true;

  let auth = null;
  let account = null;
  let locale = null;

  function note(url, header) {
    if (header && /^Bearer\s/.test(header)) auth = header;
    if (!url) return;
    const m = /\/content\/v2\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i.exec(url);
    if (m) account = m[1];
    const l = /[?&]locale=([a-z]{2}-[A-Z]{2})/.exec(url);
    if (l) locale = l[1];
  }

  function headerFrom(h) {
    if (!h) return null;
    try {
      if (h instanceof Headers) return h.get('authorization');
      if (Array.isArray(h)) { const p = h.find((x) => /^authorization$/i.test(x[0])); return p ? p[1] : null; }
      return h.Authorization || h.authorization || null;
    } catch (_) { return null; }
  }

  // The page adding a show to the watchlist (Crunchyroll's own button):
  // tell NINA, so the new show can go to "Geplant" on AniList right away.
  function noteWatchlistAdd(url, method) {
    if (!/^post$/i.test(method || '') || !/\/content\/v2\/[0-9a-f-]{36}\/watchlist(\?|$)/i.test(url || '')) return;
    setTimeout(() => window.postMessage({ __ninaCrWatchlistChanged: true }, location.origin), 1500);
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      note(url, headerFrom(init && init.headers) || (input instanceof Request ? headerFrom(input.headers) : null));
      noteWatchlistAdd(url, (init && init.method) || (input instanceof Request ? input.method : 'GET'));
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__ninaUrl = String(url); note(this.__ninaUrl, null); noteWatchlistAdd(this.__ninaUrl, method); } catch (_) {}
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { if (/^authorization$/i.test(k)) note(this.__ninaUrl, v); } catch (_) {}
    return origSet.apply(this, arguments);
  };

  function accountFromToken() {
    try {
      const p = JSON.parse(atob(auth.split(' ')[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.etp_user_id || p.account_id || null;
    } catch (_) { return null; }
  }

  async function get(path) {
    const res = await origFetch(path, { headers: { Authorization: auth }, credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function waitForSession(ms) {
    const until = Date.now() + ms;
    while (!auth && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    return !!auth;
  }

  async function seriesProgress(seriesId) {
    if (!(await waitForSession(15000))) throw new Error('no session');
    const loc = locale || 'de-DE';
    const seasons = (await get('/content/v2/cms/series/' + encodeURIComponent(seriesId) + '/seasons?locale=' + loc)).data || [];
    const out = [];
    for (const s of seasons) {
      const eps = (await get('/content/v2/cms/seasons/' + encodeURIComponent(s.id) + '/episodes?locale=' + loc)).data || [];
      out.push({
        id: s.id,
        title: s.title,
        number: s.season_number,
        episodes: eps.map((e) => ({ id: e.id, n: e.episode_number, fw: false }))
      });
    }
    // Crunchyroll's own "watched" flags, in chunks.
    const acc = account || accountFromToken();
    if (acc) {
      const all = out.flatMap((s) => s.episodes);
      const byId = new Map(all.map((e) => [e.id, e]));
      for (let i = 0; i < all.length; i += 50) {
        const ids = all.slice(i, i + 50).map((e) => e.id).join(',');
        try {
          const ph = (await get('/content/v2/' + acc + '/playheads?content_ids=' + ids + '&locale=' + loc)).data || [];
          for (const p of ph) {
            const e = byId.get(p.content_id);
            if (e && p.fully_watched) e.fw = true;
          }
        } catch (_) { break; }
      }
    }
    return out;
  }

  // Crunchyroll's watch history ("Verlauf"): every played episode with its
  // show and whether it was fully watched. Paged, newest first.
  async function watchHistory(maxPages) {
    if (!(await waitForSession(15000))) throw new Error('no session');
    const acc = account || accountFromToken();
    if (!acc) throw new Error('no account');
    const loc = locale || 'de-DE';
    let url = '/content/v2/' + acc + '/watch-history?page_size=100&locale=' + loc;
    const out = [];
    for (let p = 0; p < maxPages && url; p++) {
      const r = await get(url);
      for (const it of r.data || []) {
        const m = (it.panel && it.panel.episode_metadata) || {};
        out.push({
          id: it.id,
          fw: !!it.fully_watched,
          ph: it.playhead || 0,
          s: m.series_id,
          st: m.series_title,
          n: m.episode_number,
          t: it.panel && it.panel.title
        });
      }
      const next = r.meta && r.meta.next_page;
      url = next && next !== url ? next : '';
    }
    return out;
  }

  // Watchlist: one entry per show (with Crunchyroll's own "fully watched" /
  // "never watched" flags for it).
  async function watchlist() {
    if (!(await waitForSession(15000))) throw new Error('no session');
    const acc = account || accountFromToken();
    if (!acc) throw new Error('no account');
    const loc = locale || 'de-DE';
    const r = await get('/content/v2/discover/' + acc + '/watchlist?order=desc&n=1000&locale=' + loc);
    return (r.data || []).map((it) => {
      const m = (it.panel && it.panel.episode_metadata) || {};
      return {
        s: m.series_id,
        st: m.series_title,
        slug: m.series_slug_title || '',
        fw: !!it.fully_watched,
        never: !!it.never_watched,
        // release date of the show's latest/next episode shown here
        aired: Date.parse(m.premium_available_date || m.episode_air_date || m.available_date || '') || 0
      };
    }).filter((x) => x.s);
  }

  // The only write: take a finished show off the watchlist (when enabled
  // in NINA's settings), same request Crunchyroll's own remove button sends.
  async function watchlistRemove(seriesId) {
    if (!(await waitForSession(15000))) throw new Error('no session');
    const acc = account || accountFromToken();
    if (!acc) throw new Error('no account');
    const res = await origFetch('/content/v2/' + acc + '/watchlist/' + encodeURIComponent(seriesId) + '?locale=' + (locale || 'de-DE'),
      { method: 'DELETE', headers: { Authorization: auth }, credentials: 'include' });
    if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
    return {};
  }

  // Audio / subtitle languages of several shows in one request.
  async function seriesLocales(ids) {
    if (!(await waitForSession(15000))) throw new Error('no session');
    const out = {};
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40).map(encodeURIComponent).join(',');
      const r = await get('/content/v2/cms/objects/' + chunk + '?locale=' + (locale || 'de-DE'));
      for (const o of r.data || []) {
        const m = o.series_metadata || o.movie_listing_metadata || {};
        out[o.id] = { a: m.audio_locales || [], s: m.subtitle_locales || [] };
      }
    }
    return out;
  }

  const OPS = {
    seriesLocales: (d) => seriesLocales(d.ids || []).then((locales) => ({ locales })),
    seriesProgress: (d) => seriesProgress(d.seriesId).then((seasons) => ({ seasons })),
    watchHistory: (d) => watchHistory(d.maxPages || 30).then((items) => ({ items })),
    watchlist: () => watchlist().then((items) => ({ items })),
    watchlistRemove: (d) => watchlistRemove(d.seriesId)
  };

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || !OPS[e.data.__ninaCrApiReq]) return;
    const { reqId } = e.data;
    try {
      const result = await OPS[e.data.__ninaCrApiReq](e.data);
      window.postMessage({ __ninaCrApiRes: reqId, ok: true, ...result }, location.origin);
    } catch (err) {
      window.postMessage({ __ninaCrApiRes: reqId, ok: false, error: String(err && err.message || err) }, location.origin);
    }
  });
})();
