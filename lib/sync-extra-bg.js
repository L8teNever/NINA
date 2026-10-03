// sync-extra-bg.js — background part of "everything the same on every PC".
// Most settings already live in chrome.storage.sync. Two things don't fit
// there and used to stay on one device:
//
//  • the new tab background image (a data URL, often several MB — far over
//    Chrome's 100 KB sync quota): it goes to Google Drive (NINA/
//    nina-background.json) when Drive is connected; chrome.storage.sync only
//    carries a small marker { updatedAt, has } so other PCs know to fetch it.
//  • the code of custom HTML blocks on the new tab (nina_widget_html):
//    split into chunks of chrome.storage.sync (up to ~50 KB in total).
//
// Local writes (new tab page, options page) are pushed; changes arriving
// from another device are pulled into chrome.storage.local, which the pages
// already listen to.

(function () {
  'use strict';

  const localGet = (k) => new Promise((r) => chrome.storage.local.get(k, r));
  const localSet = (o) => new Promise((r) => chrome.storage.local.set(o, r));
  const syncGet = (k) => new Promise((r) => chrome.storage.sync.get(k, r));
  const syncSet = (o) => new Promise((r, j) => chrome.storage.sync.set(o, () => (chrome.runtime.lastError ? j(chrome.runtime.lastError) : r())));

  // writes we make ourselves (pulls) must not be pushed straight back
  const quiet = {};
  const isQuiet = (key) => quiet[key] && Date.now() - quiet[key] < 3000;

  // ── Background image ─────────────────────────────────────────────────
  const BG_KEY = 'nina_bg_image';        // local: data URL or null
  const BG_AT = 'nina_bg_image_at';      // local: when this device's image was set/pulled
  const BG_META = 'nina_bg_meta';        // sync: { updatedAt, has }
  const BG_FILE = 'nina-background.json';

  async function driveToken() {
    const l = await localGet(['nina_drive_connected']);
    if (!l.nina_drive_connected) return null;
    return new Promise((r) => chrome.identity.getAuthToken({ interactive: false }, (t) => r(chrome.runtime.lastError ? null : t)));
  }
  async function driveJson(token, url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error('Drive ' + res.status);
    return res.json();
  }
  async function findDrive(token, name, parent, folder) {
    let q = "name='" + name + "' and trashed=false";
    if (folder) q += " and mimeType='application/vnd.google-apps.folder'";
    if (parent) q += " and '" + parent + "' in parents";
    const r = await driveJson(token, 'https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id)&q=' + encodeURIComponent(q));
    return r.files && r.files[0] ? r.files[0].id : null;
  }
  async function ninaFolder(token) {
    const id = await findDrive(token, 'NINA', null, true);
    if (id) return id;
    const r = await driveJson(token, 'https://www.googleapis.com/drive/v3/files', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'NINA', mimeType: 'application/vnd.google-apps.folder' })
    });
    return r.id;
  }
  async function driveWriteBg(token, payload) {
    const folder = await ninaFolder(token);
    const id = await findDrive(token, BG_FILE, folder, false);
    const body = JSON.stringify(payload);
    if (id) {
      await driveJson(token, 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
      });
      return;
    }
    const boundary = 'nina_bg_' + Date.now();
    const multipart = [
      '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '',
      JSON.stringify({ name: BG_FILE, parents: [folder], mimeType: 'application/json' }),
      '--' + boundary, 'Content-Type: application/json', '', body, '--' + boundary + '--'
    ].join('\r\n');
    await driveJson(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multipart
    });
  }
  async function driveReadBg(token) {
    const folder = await findDrive(token, 'NINA', null, true);
    const id = folder && await findDrive(token, BG_FILE, folder, false);
    if (!id) return null;
    const res = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
    return res.ok ? res.json() : null;
  }

  // Only marked as synced (BG_AT) once it really went out — an image set
  // while Drive wasn't connected is pushed later (see the end of this file).
  async function pushBg(image) {
    const updatedAt = Date.now();
    if (image) {
      const token = await driveToken();
      if (!token) return; // Drive not connected: the image can't travel yet
      try { await driveWriteBg(token, { image, updatedAt }); } catch (_) { return; } // no marker without the file
    }
    try { await syncSet({ [BG_META]: { updatedAt, has: !!image } }); } catch (_) { return; }
    await localSet({ [BG_AT]: updatedAt });
  }

  // an image this PC has but never sent (older NINA, or Drive connected later)
  async function pushPendingBg() {
    const l = await localGet([BG_KEY, BG_AT]);
    if (l[BG_KEY] && !l[BG_AT]) await pushBg(l[BG_KEY]);
  }

  async function pullBg() {
    const meta = (await syncGet([BG_META]))[BG_META];
    if (!meta || !meta.updatedAt) return;
    const l = await localGet([BG_AT]);
    if ((l[BG_AT] || 0) >= meta.updatedAt) return;
    if (!meta.has) {
      quiet[BG_KEY] = Date.now();
      await localSet({ [BG_KEY]: null, [BG_AT]: meta.updatedAt });
      return;
    }
    const token = await driveToken();
    if (!token) return;
    let file = null;
    try { file = await driveReadBg(token); } catch (_) { return; }
    if (!file || !file.image || (file.updatedAt || 0) < meta.updatedAt) return;
    quiet[BG_KEY] = Date.now();
    await localSet({ [BG_KEY]: file.image, [BG_AT]: meta.updatedAt });
  }

  // ── Custom HTML blocks: chunked into chrome.storage.sync ──────────────
  const WH_KEY = 'nina_widget_html';     // local: { widgetId: html }
  const WH_META = 'nina_whtml_meta';     // sync: { n, at }
  const WH_AT = 'nina_whtml_at';         // local
  const WH_CHUNK = 'nina_whtml_';        // sync: nina_whtml_0 … (strings)
  const CHUNK = 3000;                    // chars; 8 KB per item even with umlauts
  const MAX_CHUNKS = 16;

  async function pushHtml(map) {
    const text = JSON.stringify(map || {});
    const n = Math.ceil(text.length / CHUNK);
    if (n > MAX_CHUNKS) return; // too big for sync: stays on this device
    const at = Date.now();
    const old = (await syncGet([WH_META]))[WH_META];
    const items = { [WH_META]: { n, at } };
    for (let i = 0; i < n; i++) items[WH_CHUNK + i] = text.slice(i * CHUNK, (i + 1) * CHUNK);
    quiet[WH_AT] = at;
    await localSet({ [WH_AT]: at });
    try {
      await syncSet(items);
      if (old && old.n > n) chrome.storage.sync.remove(Array.from({ length: old.n - n }, (_, i) => WH_CHUNK + (n + i)));
    } catch (_) {}
  }

  async function pullHtml() {
    const meta = (await syncGet([WH_META]))[WH_META];
    if (!meta || !meta.at) return;
    const l = await localGet([WH_AT]);
    if ((l[WH_AT] || 0) >= meta.at) return;
    const keys = Array.from({ length: meta.n }, (_, i) => WH_CHUNK + i);
    const parts = await syncGet(keys);
    let map;
    try { map = JSON.parse(keys.map((k) => parts[k] || '').join('')); } catch (_) { return; }
    quiet[WH_KEY] = Date.now();
    await localSet({ [WH_KEY]: map, [WH_AT]: meta.at });
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes[BG_KEY] && !isQuiet(BG_KEY)) {
        const a = changes[BG_KEY].oldValue || null, b = changes[BG_KEY].newValue || null;
        if (a !== b) pushBg(b);
      }
      if (changes[WH_KEY] && !isQuiet(WH_KEY)) pushHtml(changes[WH_KEY].newValue);
    } else if (area === 'sync') {
      if (changes[BG_META]) pullBg();
      if (changes[WH_META]) pullHtml();
    }
  });

  // after a restart / when this PC was offline
  const catchUp = async () => {
    await pullBg();
    await pushPendingBg();
    await pullHtml();
    const l = await localGet([WH_KEY, WH_AT]);
    if (l[WH_KEY] && Object.keys(l[WH_KEY]).length && !l[WH_AT]) pushHtml(l[WH_KEY]);
  };
  catchUp();
  if (chrome.alarms) {
    chrome.alarms.get('nina-sync-extra', (a) => { if (!a) chrome.alarms.create('nina-sync-extra', { periodInMinutes: 15, delayInMinutes: 1 }); });
    chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'nina-sync-extra') catchUp(); });
  }
  // Drive just got connected here: fetch / send the image
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.nina_drive_connected && c.nina_drive_connected.newValue) catchUp();
  });
})();
