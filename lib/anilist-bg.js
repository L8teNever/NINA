// anilist-bg.js — AniList integration, runs in the background service worker
// (loaded via importScripts from background.js). Content scripts and the
// options page talk to it with { type: 'NINA_ANILIST', op, ... } messages:
// the token never leaves the background, and cross-origin calls to
// graphql.anilist.co are made from here.
//
// Login uses AniList's implicit grant through chrome.identity.launchWebAuthFlow.
// The API client is the user's own (created at anilist.co/settings/developer
// with the redirect URL https://<extension-id>.chromiumapp.org/); its id is
// stored in chrome.storage.sync so it carries over to other devices.

(function () {
  'use strict';

  const API = 'https://graphql.anilist.co';
  const K_CLIENT = 'nina_anilist_client_id';   // sync
  const K_AUTOSYNC = 'nina_anilist_autosync';   // sync, default true
  const K_TOKEN = 'nina_anilist_token';         // local: { token, expiresAt }
  const K_USER = 'nina_anilist_user';           // local: { id, name, avatar }
  const K_MAP = 'nina_anilist_map';             // local: key -> { id, offset } | null
  const K_LINKS = 'nina_anilist_links';         // sync: the manual entries of K_MAP
  const TV_FORMATS = ['TV', 'TV_SHORT', 'ONA'];

  const MEDIA_FIELDS = `
    id format status episodes averageScore siteUrl
    title { romaji english userPreferred }
    coverImage { medium }
    nextAiringEpisode { episode }
    mediaListEntry { id status progress score(format: POINT_10) repeat }
    relations { edges { relationType node { id type format episodes } } }
  `;

  const syncGet = (keys) => new Promise((r) => chrome.storage.sync.get(keys, r));
  const localGet = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const localSet = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

  async function getToken() {
    const res = await localGet([K_TOKEN]);
    const t = res[K_TOKEN];
    if (!t || !t.token) return null;
    if (t.expiresAt && Date.now() > t.expiresAt) {
      await chrome.storage.local.remove([K_TOKEN, K_USER]);
      return null;
    }
    return t.token;
  }

  async function gql(query, variables, needAuth) {
    const token = await getToken();
    if (needAuth && !token) throw new Error('Nicht mit AniList verbunden');
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables: variables || {} }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 400 && /invalid token/i.test(JSON.stringify(json))) {
      await chrome.storage.local.remove([K_TOKEN, K_USER]);
      throw new Error('AniList-Anmeldung abgelaufen');
    }
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'AniList-Fehler');
    if (!res.ok) throw new Error('AniList HTTP ' + res.status);
    return json.data;
  }

  async function login() {
    const { [K_CLIENT]: clientId } = await syncGet([K_CLIENT]);
    if (!clientId) throw new Error('Bitte zuerst die AniList Client-ID eintragen');
    const url = 'https://anilist.co/api/v2/oauth/authorize?client_id=' + encodeURIComponent(clientId) + '&response_type=token';
    const redirect = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    const hash = new URLSearchParams((redirect || '').split('#')[1] || '');
    const token = hash.get('access_token');
    if (!token) throw new Error('Keine Anmeldung von AniList erhalten');
    const expiresIn = Number(hash.get('expires_in')) || 0;
    await localSet({ [K_TOKEN]: { token, expiresAt: expiresIn ? Date.now() + expiresIn * 1000 - 60000 : 0 } });
    const data = await gql('query { Viewer { id name avatar { medium } } }', {}, true);
    const user = { id: data.Viewer.id, name: data.Viewer.name, avatar: data.Viewer.avatar && data.Viewer.avatar.medium };
    await localSet({ [K_USER]: user });
    return user;
  }

  async function status() {
    const [s, l] = await Promise.all([syncGet([K_CLIENT, K_AUTOSYNC]), localGet([K_USER])]);
    const token = await getToken();
    return {
      connected: !!token,
      user: token ? l[K_USER] || null : null,
      clientId: s[K_CLIENT] || '',
      autoSync: s[K_AUTOSYNC] !== false,
      redirectUrl: chrome.identity.getRedirectURL()
    };
  }

  async function getMedia(id) {
    const data = await gql(`query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`, { id }, false);
    return data.Media;
  }


  const related = (media, type) => {
    const e = media.relations && media.relations.edges.find((x) => x.relationType === type && x.node.type === 'ANIME' && TV_FORMATS.includes(x.node.format));
    return e ? e.node : null;
  };

  // ── Matching a Crunchyroll season to an AniList entry ────────────────
  // AniList has one entry per cour ("Season 2", "2nd Season", "II",
  // "Part 2"), Crunchyroll numbers seasons its own way ("Staffel 2",
  // "Season 3", sometimes two AniList parts in one season). So instead of
  // counting sequels, search with English season wording, read the season /
  // part number out of every candidate's titles, and score candidates by
  // season number, part and episode count.
  const MATCH_VERSION = 3; // bump to re-match automatically linked seasons
  const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  function titlesOf(m) {
    const t = m.title || {};
    return [t.english, t.romaji, t.userPreferred, ...(m.synonyms || [])].filter(Boolean);
  }

  // Season and part of an AniList entry, from its titles.
  function seasonOfMedia(m) {
    let season = 0, part = 0;
    for (const raw of titlesOf(m)) {
      const t = norm(raw);
      let x;
      if (!season && (x = /\bseason (\d+)\b/.exec(t))) season = +x[1];
      if (!season && (x = /\b(\d+)(?:st|nd|rd|th) season\b/.exec(t))) season = +x[1];
      if (!season && (x = /\b(ii|iii|iv|vi|vii)\b/.exec(t))) season = ROMAN[x[1]];
      if (!season && (x = /\b(\d)\s*$/.exec(t)) && +x[1] > 1 && +x[1] < 10) season = +x[1];
      if (!part && (x = /\b(?:part|cour) (\d+)\b/.exec(t))) part = +x[1];
      if (!part && (x = /\b(\d+)(?:st|nd|rd|th) (?:part|cour)\b/.exec(t))) part = +x[1];
    }
    return { season: season || 1, part: part || 1 };
  }

  // "Staffel 2", "Season 3", "TSUKIMICHI -Moonlit Fantasy- Staffel 2",
  // or a named arc ("… Swordsmith Village Arc").
  function parseSeason(seriesTitle, seasonTitle) {
    const t = (seasonTitle || '').trim();
    const m = /(?:staffel|season)\s*(\d+)/i.exec(t);
    let rest = t.replace(/(?:staffel|season)\s*\d+/ig, ' ');
    if (seriesTitle) rest = rest.split(seriesTitle).join(' ');
    rest = rest.replace(/[\s\-–:()|]+/g, ' ').trim();
    return { number: m ? Number(m[1]) : 1, explicit: !!m, named: rest.length >= 3 ? rest : '' };
  }

  async function searchMany(queries) {
    const seen = new Map();
    for (const q of queries) {
      const data = await gql(`query ($s: String) { Page(perPage: 15) { media(search: $s, type: ANIME, sort: SEARCH_MATCH) {
        id format episodes synonyms startDate { year } title { romaji english userPreferred } } } }`, { s: q }, false);
      ((data.Page && data.Page.media) || []).forEach((m, i) => {
        if (!seen.has(m.id)) seen.set(m.id, { ...m, rank: seen.size + i * 0.01 });
      });
    }
    return [...seen.values()];
  }

  async function autoMatch(seriesTitle, seasonTitle, episodeCount, firstEpisode, altTitle) {
    const { number, explicit, named } = parseSeason(seriesTitle, seasonTitle);
    const queries = [];
    if (named) queries.push(seriesTitle + ' ' + named);
    if (number > 1) queries.push(seriesTitle + ' Season ' + number, seriesTitle + ' ' + ordinal(number) + ' Season');
    queries.push(seriesTitle);
    // English title from the URL slug, for shows whose German name AniList
    // doesn't know ("Die Parallelwelt-Chroniken des Aristokraten").
    if (altTitle && norm(altTitle) !== norm(seriesTitle)) {
      if (number > 1) queries.push(altTitle + ' Season ' + number);
      queries.push(altTitle);
    }
    const candidates = (await searchMany(queries)).filter((m) => TV_FORMATS.includes(m.format));
    if (!candidates.length) return null;

    // Must belong to the same show: share a meaningful word with its title.
    const showWords = norm(seriesTitle + ' ' + (altTitle || '')).split(' ').filter((w) => w.length > 3);
    const sameShow = (m) => !showWords.length || titlesOf(m).some((t) => showWords.some((w) => norm(t).includes(w)));
    const namedWords = norm(named).split(' ').filter((w) => w.length > 3);

    let best = null;
    for (const m of candidates) {
      if (!sameShow(m)) continue;
      const s = seasonOfMedia(m);
      let score = -m.rank * 0.2;
      // A named arc without a number says nothing about the season count.
      if (explicit || !named) score += s.season === number ? 10 : -4 * Math.abs(s.season - number);
      score += s.part === 1 ? 2 : -2;
      if (episodeCount && m.episodes) {
        const diff = Math.abs(m.episodes - episodeCount);
        score += diff <= 1 ? 4 : diff <= 3 ? 1 : 0;
      }
      if (namedWords.length && titlesOf(m).some((t) => namedWords.every((w) => norm(t).includes(w)))) score += 8;
      if (!best || score > best.score) best = { m, score };
    }
    if (!best) return null;
    // Crunchyroll sometimes keeps counting across seasons (this season
    // starts at E13): remember the offset so E13 becomes AniList episode 1.
    const offset = firstEpisode > 1 ? firstEpisode - 1 : 0;
    return { id: best.m.id, offset, v: MATCH_VERSION };
  }

  async function resolve({ key, seriesTitle, seasonTitle, episodeCount, firstEpisode, altTitle }) {
    const map = (await localGet([K_MAP]))[K_MAP] || {};
    // a link set by hand (here or on another PC) wins over automatic ones
    const links = (await syncGet([K_LINKS]))[K_LINKS] || {};
    if (key in links && JSON.stringify(map[key]) !== JSON.stringify(links[key])) {
      map[key] = links[key];
      await localSet({ [K_MAP]: map });
    }
    let link = map[key];
    if (link === null) return { media: null, unlinked: true };
    // Old automatic links (earlier matching rules) are redone once.
    if (link && link.auto && link.v !== MATCH_VERSION) link = undefined;
    if (!link) {
      link = await autoMatch(seriesTitle, seasonTitle, episodeCount, firstEpisode, altTitle);
      if (!link) return { media: null };
      map[key] = { ...link, auto: true };
      await localSet({ [K_MAP]: map });
    }
    const media = await getMedia(link.id);
    // A Crunchyroll season can span several AniList entries (Part 1 +
    // Part 2, 24 episodes = 12 + 12): collect the sequels it covers.
    const parts = [media];
    let covered = media.episodes || 0;
    const target = episodeCount || 0;
    while (target && covered && covered < target && parts.length < 4) {
      const seq = related(parts[parts.length - 1], 'SEQUEL');
      if (!seq) break;
      const next = await getMedia(seq.id);
      parts.push(next);
      if (!next.episodes) break;
      covered += next.episodes;
    }
    return { media, parts, offset: link.offset || 0, auto: !!link.auto };
  }

  // Manual link: an AniList URL/id, or null to switch syncing off for it.
  async function setLink({ key, value, offset }) {
    const map = (await localGet([K_MAP]))[K_MAP] || {};
    if (value === null) map[key] = null;
    else if (value === '') delete map[key];
    else {
      const m = /anilist\.co\/anime\/(\d+)/.exec(String(value)) || /^(\d+)$/.exec(String(value).trim());
      if (!m) throw new Error('Bitte einen AniList-Link wie anilist.co/anime/12345 angeben');
      map[key] = { id: Number(m[1]), offset: Number(offset) || 0 };
    }
    await localSet({ [K_MAP]: map });
    // manual links (and "unlinked") also go to the other PCs
    const links = (await syncGet([K_LINKS]))[K_LINKS] || {};
    if (value === '') delete links[key]; else links[key] = map[key];
    chrome.storage.sync.set({ [K_LINKS]: links });
  }

  async function save({ mediaId, progress, status: st, score }) {
    const vars = { mediaId };
    if (progress !== undefined) vars.progress = progress;
    if (st !== undefined) vars.status = st;
    if (score !== undefined) vars.scoreRaw = Math.round(score * 10);
    const data = await gql(`mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $scoreRaw: Int) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, scoreRaw: $scoreRaw) {
        id status progress score(format: POINT_10) repeat
      }
    }`, vars, true);
    const saved = data.SaveMediaListEntry;
    if (saved && saved.progress != null) rememberProgress(mediaId, saved.progress);
    return saved;
  }

  // Latest known AniList progress per show, so Crunchyroll's "Neue Folge"
  // poster badge disappears right after the new episode was watched.
  const K_PROGRESS = 'nina_anilist_progress'; // local: { mediaId: progress }
  async function rememberProgress(mediaId, progress) {
    const all = (await localGet([K_PROGRESS]))[K_PROGRESS] || {};
    if (all[mediaId] === progress) return;
    all[mediaId] = progress;
    await localSet({ [K_PROGRESS]: all });
  }

  // An episode was watched on a streaming site: move the AniList progress
  // forward (never backward), finishing the entry on the last episode.
  async function episodeWatched(info) {
    const s = await syncGet([K_AUTOSYNC]);
    // force: manual export from the options page, independent of auto-sync.
    if (!info.force && s[K_AUTOSYNC] === false) return { skipped: 'autosync-off' };
    if (!(await getToken())) return { skipped: 'not-connected' };
    const resolved = await resolve(info);
    let media = resolved.media;
    if (!media) return { skipped: 'no-match' };
    let ep = Number(info.episode);
    if (!isFinite(ep) || ep <= 0) return { skipped: 'no-episode' };
    if (resolved.offset && media.episodes && ep > media.episodes) ep -= resolved.offset;
    // Crunchyroll sometimes packs several AniList entries into one season
    // (Part 1 + Part 2): E12 of an 11-episode entry is E1 of its sequel.
    for (let i = 0; i < 5 && media.episodes && ep > media.episodes; i++) {
      const seq = related(media, 'SEQUEL');
      if (!seq) break;
      ep -= media.episodes;
      media = await getMedia(seq.id);
    }
    if (media.episodes && ep > media.episodes) return { skipped: 'out-of-range' };
    ep = Math.floor(ep);
    const entry = media.mediaListEntry;
    if (entry && entry.progress != null) rememberProgress(media.id, entry.progress);
    if (entry && entry.status === 'COMPLETED') return { skipped: 'completed', media };
    const done = media.episodes && ep >= media.episodes;
    if (entry && entry.progress >= ep) {
      // Progress already there, but the status can still be stale (e.g.
      // "Geplant" with 12/12): finish it, or move "Geplant" to "Schaue ich".
      const fixStatus = done && entry.status !== 'REPEATING' ? 'COMPLETED'
        : entry.status === 'PLANNING' ? 'CURRENT' : null;
      if (!fixStatus) return { skipped: 'already', media };
      const saved = await save({ mediaId: media.id, status: fixStatus });
      return { updated: true, progress: saved.progress, status: saved.status, title: media.title.userPreferred, episodes: media.episodes };
    }
    const nextStatus = done ? 'COMPLETED' : (entry && entry.status === 'REPEATING' ? 'REPEATING' : 'CURRENT');
    const saved = await save({ mediaId: media.id, progress: ep, status: nextStatus });
    return { updated: true, progress: saved.progress, status: saved.status, title: media.title.userPreferred, episodes: media.episodes };
  }

  // Import: the user's whole anime list, stored compactly so content scripts
  // can mark shows/episodes without hitting the API on every page.
  const K_LIST = 'nina_anilist_list'; // local: { importedAt, entries: [...] }
  async function importList() {
    const user = (await localGet([K_USER]))[K_USER];
    if (!user || !(await getToken())) throw new Error('Nicht mit AniList verbunden');
    const data = await gql(`query ($userId: Int) {
      MediaListCollection(userId: $userId, type: ANIME) {
        lists { entries { status progress score(format: POINT_10)
          media { id episodes siteUrl title { romaji english native userPreferred } synonyms } } }
      }
    }`, { userId: user.id }, true);
    const entries = [];
    const seen = new Set();
    for (const list of (data.MediaListCollection && data.MediaListCollection.lists) || []) {
      for (const e of list.entries || []) {
        if (!e.media || seen.has(e.media.id)) continue;
        seen.add(e.media.id);
        const t = e.media.title || {};
        entries.push({
          id: e.media.id,
          status: e.status,
          progress: e.progress || 0,
          episodes: e.media.episodes || 0,
          score: e.score || 0,
          title: t.userPreferred || t.romaji || t.english || '',
          titles: [t.english, t.romaji, t.userPreferred, t.native, ...(e.media.synonyms || [])].filter(Boolean)
        });
      }
    }
    await localSet({ [K_LIST]: { importedAt: Date.now(), entries } });
    const counts = {};
    for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
    return { total: entries.length, counts };
  }

  // Search for the "Verknüpfung ändern" picker.
  async function searchMedia({ q }) {
    const data = await gql(`query ($s: String) { Page(perPage: 20) { media(search: $s, type: ANIME, sort: SEARCH_MATCH) {
      id format episodes status seasonYear season siteUrl
      title { romaji english userPreferred } coverImage { medium }
      mediaListEntry { status progress }
    } } }`, { s: q }, false);
    return (data.Page && data.Page.media) || [];
  }

  // Crunchyroll watchlist -> AniList: put a season on "Geplant" — only if
  // it isn't on the AniList list at all yet (never overrides a status).
  const K_PLAN = 'nina_anilist_plan_watchlist'; // sync, default true
  async function planSeason(info) {
    const s = await syncGet([K_PLAN]);
    if (s[K_PLAN] === false) return { skipped: 'off' };
    if (!(await getToken())) return { skipped: 'not-connected' };
    const { media } = await resolve(info);
    if (!media) return { skipped: 'no-match' };
    if (media.mediaListEntry) return { skipped: 'exists', title: media.title.userPreferred };
    await save({ mediaId: media.id, status: 'PLANNING' });
    return { planned: true, title: media.title.userPreferred };
  }

  // ── Anime news: AniList's own notifications ──────────────────────────
  // "Folge 5 von X ist erschienen" (AIRING, for shows you're watching) and
  // "Neu auf AniList: Fortsetzung von X" (RELATED_MEDIA_ADDITION). Shown on
  // the new tab page; optionally as real desktop notifications, checked
  // every 30 minutes.
  const K_NOTIFS = 'nina_anilist_notifs';        // local: { items, fetchedAt, notifiedId }
  const K_NOTIF_DESKTOP = 'nina_notif_desktop';  // sync, default false
  const ALARM = 'nina-anilist-notifs';

  async function fetchNotifications() {
    if (!(await getToken())) return null;
    const data = await gql(`query {
      Page(perPage: 30) {
        notifications(type_in: [AIRING, RELATED_MEDIA_ADDITION], resetNotificationCount: false) {
          ... on AiringNotification { id type episode createdAt
            media { id siteUrl format title { userPreferred english romaji } coverImage { medium } mediaListEntry { progress } } }
          ... on RelatedMediaAdditionNotification { id type createdAt
            media { id siteUrl format title { userPreferred english romaji } coverImage { medium } mediaListEntry { progress } } }
        }
      }
    }`, {}, true);
    const items = ((data.Page && data.Page.notifications) || []).filter((n) => n && n.media).map((n) => ({
      id: n.id,
      type: n.type,
      episode: n.episode || null,
      createdAt: (n.createdAt || 0) * 1000,
      mediaId: n.media.id,
      title: n.media.title.userPreferred || n.media.title.romaji,
      titleEn: n.media.title.english || '',
      format: n.media.format || '',
      cover: n.media.coverImage && n.media.coverImage.medium,
      url: n.media.siteUrl,
      progress: n.media.mediaListEntry ? n.media.mediaListEntry.progress || 0 : null
    }));
    const prev = (await localGet([K_NOTIFS]))[K_NOTIFS] || {};
    const state = { ...prev, items, fetchedAt: Date.now() };
    await localSet({ [K_NOTIFS]: state });
    return state;
  }

  const notifText = (n) => n.type === 'AIRING'
    ? { title: n.title, message: 'Folge ' + n.episode + ' ist erschienen' }
    : { title: n.title, message: 'Neu: ' + (n.format === 'MOVIE' ? 'Film' : 'neue Staffel / Fortsetzung') + ' zu etwas auf deiner Liste' };

  async function checkNotifications() {
    let state;
    try { state = await fetchNotifications(); } catch (_) { return; }
    if (!state || !state.items.length) return;
    const maxId = Math.max(...state.items.map((n) => n.id));
    // First run: remember where we are, don't flood with old ones.
    if (!state.notifiedId) {
      await localSet({ [K_NOTIFS]: { ...state, notifiedId: maxId } });
      return;
    }
    const s2 = await syncGet([K_NOTIF_DESKTOP, 'nina_notif_muted', 'nina_notif_enabled', 'nina_notif_default']);
    const desktop = s2[K_NOTIF_DESKTOP];
    if (desktop === true && chrome.notifications) {
      // Same rule as the new tab page: default "on" -> everything except
      // muted shows; default "off" -> only shows switched on. A show matches
      // by AniList id or the first two title words (covers later seasons).
      const nrm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const matches = (map, n) => Object.entries(map || {}).some(([id, m]) => Number(id) === n.mediaId ||
        (m.key && m.key.length >= 6 && [nrm(n.title), nrm(n.titleEn)].some((t) => t && (t === m.key || t.startsWith(m.key + ' ')))));
      const isMuted = (n) => (s2.nina_notif_default === 'off' ? !matches(s2.nina_notif_enabled, n) : matches(s2.nina_notif_muted, n));
      const fresh = state.items.filter((n) => n.id > state.notifiedId && !isMuted(n) && Date.now() - n.createdAt < 3 * 24 * 60 * 60 * 1000);
      for (const n of fresh.slice(0, 5)) {
        const t = notifText(n);
        chrome.notifications.create('nina-al-' + n.id, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: t.title,
          message: t.message,
          contextMessage: 'AniList · NINA',
          priority: 0
        });
      }
    }
    if (maxId > state.notifiedId) await localSet({ [K_NOTIFS]: { ...state, notifiedId: maxId } });
  }

  // Click on a desktop notification: search the show on Crunchyroll.
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener(async (nid) => {
      if (!nid.startsWith('nina-al-')) return;
      const id = Number(nid.slice(8));
      const state = (await localGet([K_NOTIFS]))[K_NOTIFS] || {};
      const n = (state.items || []).find((x) => x.id === id);
      if (n) chrome.tabs.create({ url: 'https://www.crunchyroll.com/de/search?q=' + encodeURIComponent(n.titleEn || n.title) });
      chrome.notifications.clear(nid);
    });
  }

  if (chrome.alarms) {
    chrome.alarms.get(ALARM, (a) => { if (!a) chrome.alarms.create(ALARM, { periodInMinutes: 30, delayInMinutes: 1 }); });
    chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) checkNotifications(); });
  }

  // For the new tab page: stored list, refreshed if older than 10 minutes.
  async function getNotifications({ refresh } = {}) {
    const state = (await localGet([K_NOTIFS]))[K_NOTIFS] || {};
    if (refresh || !state.fetchedAt || Date.now() - state.fetchedAt > 10 * 60 * 1000) {
      try { return (await fetchNotifications()) || state; } catch (_) { return state; }
    }
    return state;
  }

  async function markNotificationsRead() {
    const state = (await localGet([K_NOTIFS]))[K_NOTIFS] || {};
    await localSet({ [K_NOTIFS]: { ...state, readAt: Date.now() } });
    return true;
  }

  const OPS = {
    notifications: getNotifications,
    markNotificationsRead,
    planSeason,
    importList,
    search: searchMedia,
    status,
    login,
    logout: async () => { await chrome.storage.local.remove([K_TOKEN, K_USER]); return true; },
    resolve,
    setLink,
    save,
    episodeWatched
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'NINA_ANILIST') return false;
    const fn = OPS[message.op];
    if (!fn) { sendResponse({ ok: false, error: 'Unbekannte Aktion' }); return false; }
    Promise.resolve(fn(message.data || {}))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: (err && err.message) || String(err) }));
    return true;
  });
})();
