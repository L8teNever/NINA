// watch-history.js — "Gesehen & Angefangen" section of the options page.
// Lists every YouTube video / Crunchyroll episode NINA has marked, merged
// from this device's local cache and the Drive files
// (NINA/youtube-watch-status.json, NINA/crunchyroll-watch-status.json).

(function () {
  'use strict';

  const PLATFORMS = {
    youtube: {
      localKey: 'nina_yt_watch_status',
      driveRead: () => window.NinaDrive.getWatchStatus(),
      url: (id) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(id),
      thumb: (id) => 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg'
    },
    crunchyroll: {
      localKey: 'nina_cr_watch_status',
      driveRead: () => window.NinaDrive.getCrunchyrollWatchStatus(),
      url: (id) => 'https://www.crunchyroll.com/watch/' + encodeURIComponent(id),
      thumb: null
    }
  };
  const PAGE_SIZE = 50;
  // Crunchyroll stores whole seasons as 'season:<id>' next to episodes.
  const isSeason = (k) => k.startsWith('season:');

  let platform = 'youtube';
  let filter = 'all';
  let query = '';
  let shown = PAGE_SIZE;
  let driveState = 'unknown'; // 'connected' | 'offline' | 'error'
  const data = { youtube: {}, crunchyroll: {} };
  const ytTitleCache = {}; // videoId -> { title, channel } | 'pending' | 'failed'

  const $ = (id) => document.getElementById(id);

  // Same rule as the content scripts: newer status wins, the furthest
  // position wins, and metadata from either side is kept.
  function merge(a, b) {
    const out = { ...a };
    for (const id in b) {
      const x = out[id], y = b[id];
      if (!x) { out[id] = y; continue; }
      const winner = (y.updatedAt || 0) >= (x.updatedAt || 0) ? y : x;
      const loser = winner === y ? x : y;
      const pos = isFinite(winner.lastPosition) && isFinite(loser.lastPosition)
        ? Math.max(winner.lastPosition, loser.lastPosition)
        : (winner.lastPosition ?? loser.lastPosition);
      out[id] = { ...loser, ...winner, lastPosition: pos };
    }
    return out;
  }

  const getLocal = (key) => new Promise((r) => chrome.storage.local.get([key], (res) => r(res[key] || {})));

  async function load() {
    $('wh-refresh').disabled = true;
    $('wh-summary').textContent = 'Lade…';
    for (const p in PLATFORMS) data[p] = await getLocal(PLATFORMS[p].localKey);
    render();

    try {
      const connected = window.NinaDrive.isConnected() || await window.NinaDrive.tryAutoConnect();
      if (connected) {
        for (const p in PLATFORMS) {
          const remote = await PLATFORMS[p].driveRead();
          if (remote) {
            data[p] = merge(data[p], remote);
            // Keep this device's cache current too, so badges on the sites
            // match without waiting for the next sync there.
            chrome.storage.local.set({ [PLATFORMS[p].localKey]: data[p] });
          }
        }
        driveState = 'connected';
      } else {
        driveState = 'offline';
      }
    } catch (_) {
      driveState = 'error';
    }
    $('wh-refresh').disabled = false;
    render();
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function entries() {
    const q = query.trim().toLowerCase();
    return Object.entries(data[platform])
      .filter(([, e]) => e && (e.status === 'watched' || e.status === 'started'))
      .filter(([, e]) => filter === 'all' || e.status === filter)
      .filter(([id, e]) => {
        if (!q) return true;
        const meta = ytTitleCache[id] && typeof ytTitleCache[id] === 'object' ? ytTitleCache[id] : {};
        return [id, e.title, e.channel, e.series, meta.title, meta.channel].some((s) => s && String(s).toLowerCase().includes(q));
      })
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  }

  function render() {
    const list = $('wh-list');
    const all = entries();
    const counts = { watched: 0, started: 0 };
    let seasonsWatched = 0;
    for (const [k, e] of Object.entries(data[platform])) {
      if (!e) continue;
      if (isSeason(k)) { if (e.status === 'watched') seasonsWatched++; continue; }
      if (counts[e.status] !== undefined) counts[e.status]++;
    }

    const driveNote = driveState === 'connected' ? 'inkl. Google Drive'
      : driveState === 'offline' ? 'nur dieses Gerät (Google Drive nicht verbunden)'
      : driveState === 'error' ? 'nur dieses Gerät (Drive konnte nicht geladen werden)'
      : '';
    $('wh-summary').textContent = counts.watched + ' gesehen · ' + counts.started + ' angefangen' + (seasonsWatched ? ' · ' + seasonsWatched + (seasonsWatched === 1 ? ' Staffel' : ' Staffeln') + ' komplett' : '') + (driveNote ? ' — ' + driveNote : '');

    list.textContent = '';
    if (platform === 'crunchyroll') { renderSeries(list); return; }
    if (!all.length) list.appendChild(emptyNote());
    for (const [id, e] of all.slice(0, shown)) list.appendChild(renderItem(id, e));
    $('wh-more').hidden = all.length <= shown;
  }

  function emptyNote() {
    const p = document.createElement('p');
    p.className = 'wh-summary';
    p.textContent = query ? 'Keine Treffer.' : 'Noch nichts markiert.';
    return p;
  }

  // ── Crunchyroll: grouped by show ─────────────────────────────────────
  // Episodes and seasons are grouped under their show. A show counts as
  // "Gesehen" once everything tracked for it is watched (all known seasons
  // complete, or — without season info — every tracked episode watched).
  const openSeries = new Set();
  const normName = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  function groupSeries() {
    const groups = new Map();
    const idToKey = new Map(); // seriesId -> group key, to merge id-only entries
    const entriesAll = Object.entries(data.crunchyroll)
      .filter(([, e]) => e && (e.status === 'watched' || e.status === 'started'))
      // Named entries first, so hint-only ones can join their show below.
      .sort((a, b) => (b[1].series ? 1 : 0) - (a[1].series ? 1 : 0));
    for (const [, e] of entriesAll) {
      if (e.seriesId && e.series) idToKey.set(e.seriesId, normName(e.series));
    }
    for (const [id, e] of entriesAll) {
      let key = (e.seriesId && idToKey.get(e.seriesId)) || normName(e.series) || normName(e.seriesHint) || '';
      // seriesHint comes from poster alt text and can carry extra words;
      // attach it to a known show whose name it contains.
      if (!e.series && key) {
        for (const k of groups.keys()) if (k && (key.includes(k) || k.includes(key))) { key = k; break; }
      }
      if (!groups.has(key)) groups.set(key, { key, name: '', seriesId: '', episodes: [], seasons: [], updatedAt: 0 });
      const g = groups.get(key);
      if (e.series && (!g.name || isSeason(id))) g.name = e.series;
      if (e.seriesId) g.seriesId = e.seriesId;
      g.updatedAt = Math.max(g.updatedAt, e.updatedAt || 0);
      (isSeason(id) ? g.seasons : g.episodes).push([id, e]);
    }
    for (const g of groups.values()) {
      if (!g.name) {
        const hint = g.episodes.map(([, e]) => e.seriesHint).find(Boolean);
        g.name = g.key ? (hint || 'Serie ohne Namen') : 'Unbekannte Serie';
      }
      const items = g.seasons.length ? g.seasons : g.episodes;
      g.status = items.every(([, e]) => e.status === 'watched') ? 'watched' : 'started';
      g.watchedEpisodes = g.episodes.filter(([, e]) => e.status === 'watched').length;
    }
    return [...groups.values()];
  }

  function renderSeries(list) {
    const q = query.trim().toLowerCase();
    const groups = groupSeries()
      .filter((g) => filter === 'all' || g.status === filter)
      .filter((g) => !q || g.name.toLowerCase().includes(q) ||
        g.episodes.some(([, e]) => (e.title || '').toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (!groups.length) list.appendChild(emptyNote());
    for (const g of groups.slice(0, shown)) list.appendChild(renderSeriesCard(g));
    $('wh-more').hidden = groups.length <= shown;
  }

  function renderSeriesCard(g) {
    const wrap = document.createElement('div');
    wrap.className = 'wh-series';

    const head = document.createElement('div');
    head.className = 'wh-item wh-series-head';
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    const open = openSeries.has(g.key);

    const chevron = document.createElement('span');
    chevron.className = 'wh-chevron';
    chevron.textContent = open ? '▾' : '▸';

    const body = document.createElement('div');
    body.className = 'wh-body';
    const title = document.createElement('div');
    title.className = 'wh-title';
    title.textContent = g.name;
    const sub = document.createElement('div');
    sub.className = 'wh-sub';
    const parts = [g.watchedEpisodes + (g.watchedEpisodes === 1 ? ' Folge' : ' Folgen') + ' gesehen'];
    const started = g.episodes.length - g.watchedEpisodes;
    if (started) parts.push(started + ' angefangen');
    const seasonsDone = g.seasons.filter(([, e]) => e.status === 'watched').length;
    if (g.seasons.length) parts.push(seasonsDone + '/' + g.seasons.length + (g.seasons.length === 1 ? ' Staffel' : ' Staffeln') + ' komplett');
    if (g.updatedAt) parts.push(fmtDate(g.updatedAt));
    sub.textContent = parts.join(' · ');
    body.append(title, sub);

    const badge = document.createElement('span');
    badge.className = 'wh-badge ' + (g.status === 'watched' ? 'wh-watched' : 'wh-started');
    badge.textContent = g.status === 'watched' ? 'Gesehen' : 'Angefangen';

    head.append(chevron, body);
    if (g.seriesId) {
      const link = document.createElement('a');
      link.className = 'wh-open';
      link.href = 'https://www.crunchyroll.com/series/' + encodeURIComponent(g.seriesId);
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Öffnen';
      link.addEventListener('click', (ev) => ev.stopPropagation());
      head.appendChild(link);
    }
    head.appendChild(badge);

    const toggle = () => {
      if (openSeries.has(g.key)) openSeries.delete(g.key); else openSeries.add(g.key);
      render();
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    wrap.appendChild(head);

    if (open) {
      const inner = document.createElement('div');
      inner.className = 'wh-series-items';
      const byTitle = (a, b) => String(a[1].seasonTitle || a[1].title || a[0])
        .localeCompare(String(b[1].seasonTitle || b[1].title || b[0]), 'de', { numeric: true });
      for (const [id, e] of [...g.seasons].sort(byTitle)) inner.appendChild(renderItem(id, e));
      for (const [id, e] of [...g.episodes].sort(byTitle)) inner.appendChild(renderItem(id, e));
      wrap.appendChild(inner);
    }
    return wrap;
  }

  function renderItem(id, e) {
    const cfg = PLATFORMS[platform];
    const a = document.createElement('a');
    a.className = 'wh-item';
    const season = isSeason(id);
    a.href = season && e.seriesId ? 'https://www.crunchyroll.com/series/' + encodeURIComponent(e.seriesId) : cfg.url(id);
    a.target = '_blank';
    a.rel = 'noopener';

    let thumb;
    if (cfg.thumb) {
      thumb = document.createElement('img');
      thumb.src = cfg.thumb(id);
      thumb.loading = 'lazy';
      thumb.alt = '';
    } else {
      thumb = document.createElement('div');
      thumb.className = 'wh-thumb-cr';
      thumb.textContent = season ? 'Staffel' : 'Crunchyroll';
    }
    thumb.classList.add('wh-thumb');

    const body = document.createElement('div');
    body.className = 'wh-body';
    const title = document.createElement('div');
    title.className = 'wh-title';
    const sub = document.createElement('div');
    sub.className = 'wh-sub';

    const meta = platform === 'youtube' ? ytMeta(id, e) : null;
    if (platform === 'youtube') {
      title.textContent = (meta && meta.title) || e.title || id;
    } else {
      title.textContent = season
        ? [e.series, e.seasonTitle].filter(Boolean).join(' – ') || 'Staffel'
        : (e.title || ('Folge ' + id));
    }
    const who = platform === 'youtube' ? ((meta && meta.channel) || e.channel)
      : season ? (e.episodes ? (e.watchedEpisodes ?? e.episodes) + '/' + e.episodes + ' Folgen gesehen' : '')
      : (e.series || e.seriesHint);
    const parts = [];
    if (who) parts.push(who);
    if (isFinite(e.lastPosition) && isFinite(e.duration) && e.duration > 0) {
      parts.push(fmtTime(e.lastPosition) + ' / ' + fmtTime(e.duration));
    }
    if (e.updatedAt) parts.push(fmtDate(e.updatedAt));
    sub.textContent = parts.join(' · ');

    body.append(title, sub);
    if (isFinite(e.lastPosition) && isFinite(e.duration) && e.duration > 0) {
      const bar = document.createElement('div');
      bar.className = 'wh-progress';
      const fill = document.createElement('div');
      fill.style.width = Math.min(100, (e.lastPosition / e.duration) * 100) + '%';
      fill.style.background = e.status === 'watched' ? '#3dd16f' : '#f5a623';
      bar.appendChild(fill);
      body.appendChild(bar);
    }

    const badge = document.createElement('span');
    badge.className = 'wh-badge ' + (e.status === 'watched' ? 'wh-watched' : 'wh-started');
    badge.textContent = e.status === 'watched' ? 'Gesehen' : 'Angefangen';

    a.append(thumb, body, badge);
    return a;
  }

  // Older entries were saved before titles were recorded; look those up
  // through YouTube's public oEmbed endpoint (one at a time, cached).
  const ytQueue = [];
  let ytBusy = false;
  function ytMeta(id, e) {
    if (e.title) return null;
    const cached = ytTitleCache[id];
    if (cached && typeof cached === 'object') return cached;
    if (!cached) {
      ytTitleCache[id] = 'pending';
      ytQueue.push(id);
      pumpYtQueue();
    }
    return null;
  }

  async function pumpYtQueue() {
    if (ytBusy) return;
    ytBusy = true;
    let changed = false;
    while (ytQueue.length) {
      const id = ytQueue.shift();
      try {
        const res = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
        if (!res.ok) throw new Error(res.status);
        const j = await res.json();
        ytTitleCache[id] = { title: j.title, channel: j.author_name };
        changed = true;
      } catch (_) {
        ytTitleCache[id] = 'failed';
      }
      if (changed && ytQueue.length % 10 === 0) { render(); changed = false; }
    }
    ytBusy = false;
    if (changed) render();
  }

  function setActive(groupId, attr, value) {
    for (const b of $(groupId).querySelectorAll('button')) b.classList.toggle('active', b.dataset[attr] === value);
  }

  function init() {
    if (!$('cat-watch-history')) return;
    $('wh-platform').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-platform]');
      if (!b) return;
      platform = b.dataset.platform;
      shown = PAGE_SIZE;
      setActive('wh-platform', 'platform', platform);
      render();
    });
    $('wh-filter').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      shown = PAGE_SIZE;
      setActive('wh-filter', 'filter', filter);
      render();
    });
    $('wh-search').addEventListener('input', (ev) => { query = ev.target.value; shown = PAGE_SIZE; render(); });
    $('wh-more').addEventListener('click', () => { shown += PAGE_SIZE; render(); });
    $('wh-refresh').addEventListener('click', load);
    // Live update while the page is open (e.g. a video finishes in another tab).
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const p in PLATFORMS) {
        if (changes[PLATFORMS[p].localKey]) {
          data[p] = merge(data[p], changes[PLATFORMS[p].localKey].newValue || {});
          if (p === platform) render();
        }
      }
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
