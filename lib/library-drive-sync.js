// library-drive-sync.js — "Meine Serien" on every device via Google Drive.
// Runs in the background worker of NINA and NINA Lite (importScripts). The
// worker provides self.ninaGoogleToken(interactive) → access token.
//
// Synced (both directions, merged — never one side simply overwriting the other):
//   NINA/library.json
//     items      the library entries (chrome.storage.sync "nlib:<ref>": status,
//                rating, watchlist, favourite, notes …) — per entry the newer
//                change wins; removals travel as tombstones
//     viewLog    viewing dates (local nina_view_log), union of all dates
//     localItems nina_library_local_items, struct (nina_stream_struct),
//                partner services (nina_partner_platforms / _alias): union
//     settings   the library settings incl. the TMDB API key (sync
//                nina_library_settings) — the newer change wins
//     lookup     nina_library_lookup (matched online refs for tracked shows)
//     meta       nina_library_meta (posters, episode counts, upcoming episodes for calendar)
//     pages      nina_stream_pages (show pages + episode links, "Folge starten")
//     epSeason   nina_cr_ep_season (Crunchyroll episode -> season)
//     (the settings also carry the library's filters: libFilter, libPlatform)
//   NINA/crunchyroll-watch-status.json, NINA/stream-watch-status.json
//     how far each episode / film was watched — the same files the streaming
//     site scripts already use, merged the same way
//
// The entries carry no change time, so this keeps its own per entry
// (local nina_lib_stamps), set whenever an "nlib:" key changes.
// Runs: on start, after the Drive login, when the library opens
// (message NINA_DRIVE_PULL), 20 s after a change, and every 15 minutes.
// { type: 'NINA_DRIVE_PULL', force: true } (button "Jetzt prüfen & hochladen")
// uploads every file even if Drive already looks up to date.

(function () {
  'use strict';
  if (self.ninaLibrarySync) return;

  const ITEM_PREFIX = 'nlib:';
  const STAMPS = 'nina_lib_stamps';
  const SET_KEY = 'nina_library_settings';            // sync
  const SET_STAMP = 'nina_lib_settings_t';            // local: when the settings last changed here
  const CONNECTED = 'nina_drive_connected';
  const LAST = 'nina_drive_last_sync';
  const FOLDER = 'NINA';
  const LIB_FILE = 'library.json';
  const TOMB_DAYS = 120;
  const LOOKUP_KEY = 'nina_library_lookup';
  const META_KEY = 'nina_library_meta';
  const LOOKUP_VER = 2;
  const WATCH = [
    { file: 'crunchyroll-watch-status.json', key: 'nina_cr_watch_status', merge: mergeCr },
    { file: 'stream-watch-status.json', key: 'nina_stream_watch_status', merge: mergeStream }
  ];
  const PAGES_KEY = 'nina_stream_pages';
  const EP_SEASON_KEY = 'nina_cr_ep_season';
  const LOCAL_KEYS = [PAGES_KEY, EP_SEASON_KEY, 'nina_view_log', 'nina_library_local_items', 'nina_stream_struct', 'nina_partner_platforms', 'nina_partner_alias', LOOKUP_KEY, META_KEY, ...WATCH.map((w) => w.key)];

  // ── merges ──────────────────────────────────────────────────────────────
  function mergeCr(a, b) {   // = content/crunchyroll-watch-status.js mergeStatusMaps
    const merged = { ...a };
    for (const id in b) {
      const existing = merged[id], incoming = b[id];
      if (!existing) { merged[id] = incoming; continue; }
      const winner = (incoming.updatedAt || 0) >= (existing.updatedAt || 0) ? incoming : existing;
      const loser = winner === incoming ? existing : incoming;
      const furthest = isFinite(winner.lastPosition) && isFinite(loser.lastPosition)
        ? Math.max(winner.lastPosition, loser.lastPosition)
        : (winner.lastPosition ?? loser.lastPosition);
      merged[id] = { ...loser, ...winner, lastPosition: furthest };
    }
    return merged;
  }
  function mergeStream(a, b) {   // = content/stream-watch.js merge
    const out = { ...a };
    for (const id in b) {
      const x = out[id], y = b[id];
      if (!x) { out[id] = y; continue; }
      const win = (y.updatedAt || 0) >= (x.updatedAt || 0) ? y : x;
      const lose = win === y ? x : y;
      const status = x.status === 'watched' || y.status === 'watched' ? 'watched' : win.status;
      out[id] = { ...lose, ...win, status };
    }
    return out;
  }
  function mergeViewLog(a, b) {
    const out = { ...a };
    for (const k in b) {
      const x = out[k], y = b[k];
      if (!x) { out[k] = y; continue; }
      // a date set by hand in the library ("ed:") replaces what was recorded: keep the newer list
      if (k.startsWith('ed:')) { out[k] = (y.at || 0) > (x.at || 0) ? y : x; continue; }
      const v = [...new Set([...(x.v || []), ...(y.v || [])])].sort((p, q) => p - q);
      out[k] = { ...y, ...x, v };
    }
    return out;
  }
  function mergeLookup(a, b) {
    const out = { ...(b || {}), ...(a || {}), __v: LOOKUP_VER };
    for (const k in b) {
      if (k === '__v') continue;
      const lVal = a ? a[k] : undefined;
      const rVal = b[k];
      if (!lVal && rVal) out[k] = rVal;
      else if (lVal && rVal && String(lVal).startsWith('local:') && !String(rVal).startsWith('local:')) out[k] = rVal;
    }
    return out;
  }
  function mergeMeta(a, b) {
    const out = { ...(b || {}) };
    for (const [ref, m] of Object.entries(a || {})) {
      if (!m) continue;
      const r = out[ref];
      if (!r) { out[ref] = m; continue; }
      const winner = (m.fetchedAt || 0) >= (r.fetchedAt || 0) ? m : r;
      const loser = winner === m ? r : m;
      const nextEp = (winner.next && winner.next.at > Date.now() - 36 * 3600e3)
        ? winner.next
        : ((loser.next && loser.next.at > Date.now() - 36 * 3600e3) ? loser.next : winner.next);
      const aired = mergeAired(winner.aired, loser.aired);
      out[ref] = { ...loser, ...winner, next: nextEp, ...(aired.length ? { aired } : {}) };
    }
    return out;
  }
  // episodes that aired (calendar "Vergangen"): one per season|episode, newest first
  function mergeAired(a, b) {
    const map = new Map();
    for (const e of [...(a || []), ...(b || [])]) if (e && e.at) { const k = (e.season || 0) + '|' + e.episode; if (!map.has(k)) map.set(k, e); }
    return [...map.values()].sort((x, y) => y.at - x.at).slice(0, 60);
  }
  const union = (a, b) => ({ ...(b || {}), ...(a || {}) });   // local wins
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ── own writes must not count as user changes ──────────────────────────
  const expected = new Map();   // area|key → JSON of the value we are writing (or 'null')
  const expect = (area, key, value) => expected.set(area + '|' + key, value === undefined ? 'null' : JSON.stringify(value));
  function isOwn(area, key, value) {
    const k = area + '|' + key;
    if (!expected.has(k)) return false;
    const own = expected.get(k) === (value === undefined ? 'null' : JSON.stringify(value));
    expected.delete(k);
    return own;
  }

  // ── Drive ──────────────────────────────────────────────────────────────
  function drive(token) {
    const auth = { Authorization: 'Bearer ' + token };
    const call = async (url, opts = {}) => {
      const r = await fetch(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
      if (!r.ok) throw new Error('Drive ' + r.status);
      return r.status === 204 ? null : r.json();
    };
    const find = async (name, parentId, mime) => {
      let q = "name='" + name.replace(/'/g, "\\'") + "' and trashed=false";
      if (mime) q += " and mimeType='" + mime + "'";
      if (parentId) q += " and '" + parentId + "' in parents";
      const res = await call('https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name)&q=' + encodeURIComponent(q));
      return res.files && res.files[0] ? res.files[0].id : null;
    };
    return {
      async folder() {
        const id = await find(FOLDER, null, 'application/vnd.google-apps.folder');
        if (id) return id;
        const created = await call('https://www.googleapis.com/drive/v3/files', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
        });
        return created.id;
      },
      async read(folderId, name) {
        const id = await find(name, folderId);
        if (!id) return { id: null, data: null };
        return { id, data: await call('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media') };
      },
      async write(folderId, name, id, data) {
        const body = JSON.stringify(data);
        if (id) {
          await call('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
          });
          return;
        }
        const boundary = 'nina_lib_' + Date.now();
        const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' });
        await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
          body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`
        });
      }
    };
  }

  // ── one sync run ────────────────────────────────────────────────────────
  async function run(force) {
    const { [CONNECTED]: connected } = await chrome.storage.local.get([CONNECTED]);
    if (typeof self.ninaGoogleToken !== 'function') return { skipped: 'no token source' };
    if (!connected) {
      // after removing + re-adding the extension the 'connected' flag is gone,
      // but Chrome may still hold the Google grant: reconnect silently, so the
      // library comes back from Drive by itself (desktop Chrome only — phones
      // would need a login tab for this)
      if (typeof self.ninaGoogleTokenSilent !== 'function') return { skipped: 'not connected' };
      if ((await chrome.storage.local.get(['nina_drive_off'])).nina_drive_off) return { skipped: 'disconnected by the user' };
      try { await self.ninaGoogleTokenSilent(); } catch (_) { return { skipped: 'not connected' }; }
      await chrome.storage.local.set({ [CONNECTED]: true });
    }
    const d = drive(await self.ninaGoogleToken(false));
    const folderId = await d.folder();
    const now = Date.now();

    // library.json: items + extras
    const lib = await d.read(folderId, LIB_FILE);
    const remote = lib.data || {};
    const syncAll = await chrome.storage.sync.get(null);
    const local = await chrome.storage.local.get([STAMPS, SET_STAMP, ...LOCAL_KEYS]);
    const stamps = local[STAMPS] || {};
    const localItems = {};
    for (const [k, v] of Object.entries(syncAll)) if (k.startsWith(ITEM_PREFIX) && v) localItems[k.slice(ITEM_PREFIX.length)] = v;

    const rItems = remote.items || {}, rTomb = remote.tomb || {};
    const outItems = {}, outTomb = {};
    const toSet = {}, toRemove = [];
    const refs = new Set([...Object.keys(localItems), ...Object.keys(rItems), ...Object.keys(rTomb),
      ...Object.keys(stamps).filter((r) => stamps[r].del)]);
    for (const ref of refs) {
      const st = stamps[ref];
      const l = localItems[ref] ? { it: localItems[ref], t: st && !st.del ? st.t : (localItems[ref].addedAt || 0) }
        : (st && st.del ? { del: true, t: st.t } : null);
      const r = rItems[ref] ? { it: rItems[ref].it, t: rItems[ref].t || 0 }
        : (rTomb[ref] ? { del: true, t: rTomb[ref] } : null);
      const win = !l ? r : !r ? l : (r.t > l.t ? r : l);
      if (!win) continue;
      if (win.del) {
        if (now - win.t < TOMB_DAYS * 864e5) outTomb[ref] = win.t;
        if (localItems[ref]) toRemove.push(ITEM_PREFIX + ref);
      } else {
        outItems[ref] = { it: win.it, t: win.t };
        if (!same(localItems[ref], win.it)) toSet[ITEM_PREFIX + ref] = win.it;
      }
      stamps[ref] = { t: win.t, del: !!win.del };
    }

    const extras = {
      viewLog: mergeViewLog(local.nina_view_log || {}, remote.viewLog || {}),
      localItems: union(local.nina_library_local_items, remote.localItems),
      struct: union(local.nina_stream_struct, remote.struct),
      partners: union(local.nina_partner_platforms, remote.partners),
      partnerAlias: union(local.nina_partner_alias, remote.partnerAlias),
      lookup: mergeLookup(local[LOOKUP_KEY] || {}, remote.lookup || {}),
      meta: mergeMeta(local[META_KEY] || {}, remote.meta || {}),
      pages: union(local[PAGES_KEY], remote.pages),
      epSeason: union(local[EP_SEASON_KEY], remote.epSeason)
    };
    // settings (TMDB key …): newer wins; settings never changed here count as oldest
    const lSet = syncAll[SET_KEY], lSetT = local[SET_STAMP] || 0;
    const rSet = remote.settings && remote.settings.it, rSetT = (remote.settings && remote.settings.t) || 0;
    const setWin = rSet && (!lSet || rSetT > lSetT) ? { it: rSet, t: rSetT } : (lSet ? { it: lSet, t: lSetT } : null);
    // a value only one side has (e.g. the TMDB key entered on the PC) is never lost to an empty one
    if (setWin) {
      const other = setWin.it === rSet ? lSet : rSet;
      const empty = (v) => v === undefined || v === null || v === '';
      if (other) for (const [k, v] of Object.entries(other)) if (empty(setWin.it[k]) && !empty(v)) setWin.it = { ...setWin.it, [k]: v };
    }
    if (setWin) extras.settings = setWin;
    if (setWin && !same(setWin.it, lSet)) toSet[SET_KEY] = setWin.it;
    const localWrites = { [STAMPS]: stamps };
    if (!same(extras.viewLog, local.nina_view_log || {})) localWrites.nina_view_log = extras.viewLog;
    if (!same(extras.localItems, local.nina_library_local_items || {})) localWrites.nina_library_local_items = extras.localItems;
    if (!same(extras.struct, local.nina_stream_struct || {})) localWrites.nina_stream_struct = extras.struct;
    if (!same(extras.partners, local.nina_partner_platforms || {})) localWrites.nina_partner_platforms = extras.partners;
    if (!same(extras.partnerAlias, local.nina_partner_alias || {})) localWrites.nina_partner_alias = extras.partnerAlias;
    if (!same(extras.lookup, local[LOOKUP_KEY] || {})) localWrites[LOOKUP_KEY] = extras.lookup;
    if (!same(extras.meta, local[META_KEY] || {})) localWrites[META_KEY] = extras.meta;
    if (!same(extras.pages, local[PAGES_KEY] || {})) localWrites[PAGES_KEY] = extras.pages;
    if (!same(extras.epSeason, local[EP_SEASON_KEY] || {})) localWrites[EP_SEASON_KEY] = extras.epSeason;
    if (setWin) localWrites[SET_STAMP] = setWin.t;

    // watch progress files
    const watchUploads = [];
    for (const w of WATCH) {
      const file = await d.read(folderId, w.file);
      const mine = local[w.key] || {};
      const merged = w.merge(mine, file.data || {});
      if (!same(merged, mine)) localWrites[w.key] = merged;
      if (force || !same(merged, file.data || {})) watchUploads.push([w.file, file.id, merged]);
    }

    // apply locally (marked as own writes)
    for (const [k, v] of Object.entries(toSet)) expect('sync', k, v);
    for (const k of toRemove) expect('sync', k, undefined);
    for (const [k, v] of Object.entries(localWrites)) if (k !== STAMPS && k !== SET_STAMP) expect('local', k, v);
    if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
    if (toRemove.length) await chrome.storage.sync.remove(toRemove);
    await chrome.storage.local.set(localWrites);

    // upload what Drive doesn't have yet
    const snapshot = { v: 1, items: outItems, tomb: outTomb, ...extras };
    const { updatedAt: _ignored, ...remoteBody } = remote;
    const libUpload = force || !same(snapshot, remoteBody);
    if (libUpload) await d.write(folderId, LIB_FILE, lib.id, { ...snapshot, updatedAt: now });
    for (const [name, id, data] of watchUploads) await d.write(folderId, name, id, data);

    const result = {
      at: now, items: Object.keys(outItems).length, pulled: Object.keys(toSet).filter((k) => k.startsWith(ITEM_PREFIX)).length, removed: toRemove.length,
      uploaded: (libUpload ? 1 : 0) + watchUploads.length,
      episodes: WATCH.reduce((n, w) => n + Object.keys(localWrites[w.key] || local[w.key] || {}).length, 0)
    };
    await chrome.storage.local.set({ [LAST]: result });
    return result;
  }

  let running = null, again = false;
  function sync(force) {
    if (running) {
      if (!force) { again = true; return running; }
      // a forced run waits for the current one, then runs itself
      return running.then(() => sync(true));
    }
    running = run(force).catch((e) => ({ error: e.message || String(e) })).finally(() => {
      running = null;
      if (again) { again = false; schedule(2000); }
    });
    return running;
  }
  let timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  }

  // ── change tracking ─────────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes[SET_KEY] && !isOwn('sync', SET_KEY, changes[SET_KEY].newValue)) {
        chrome.storage.local.set({ [SET_STAMP]: Date.now() });
        schedule(20000);
      }
      const keys = Object.keys(changes).filter((k) => k.startsWith(ITEM_PREFIX) && !isOwn('sync', k, changes[k].newValue));
      if (!keys.length) return;
      chrome.storage.local.get([STAMPS], (r) => {
        const stamps = r[STAMPS] || {};
        const t = Date.now();
        for (const k of keys) stamps[k.slice(ITEM_PREFIX.length)] = { t, del: changes[k].newValue === undefined };
        chrome.storage.local.set({ [STAMPS]: stamps });
      });
      schedule(20000);
    } else if (area === 'local') {
      if (changes[CONNECTED] && changes[CONNECTED].newValue) { schedule(1000); return; }
      const keys = Object.keys(changes).filter((k) => LOCAL_KEYS.includes(k) && !isOwn('local', k, changes[k].newValue));
      if (keys.length) schedule(30000);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'NINA_DRIVE_PULL') return false;
    sync(!!message.force).then(sendResponse);
    return true;
  });

  chrome.alarms.create('nina-library-sync', { periodInMinutes: 15 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'nina-library-sync') sync(); });
  schedule(5000);

  self.ninaLibrarySync = sync;
})();
