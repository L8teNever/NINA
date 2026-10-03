// anilist-settings.js — "AniList" section of the options page: client id,
// connect/disconnect, auto-sync switch. The actual login and API calls live
// in the background (lib/anilist-bg.js).

(function () {
  'use strict';

  const K_CLIENT = 'nina_anilist_client_id';
  const K_AUTOSYNC = 'nina_anilist_autosync';
  const $ = (id) => document.getElementById(id);

  const call = (op, data) => new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op, data }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'Keine Antwort' });
    });
  });

  let connected = false;

  async function refresh() {
    const r = await call('status');
    if (!r.ok) { $('al-status-text').textContent = 'Fehler: ' + r.error; return; }
    const s = r.result;
    connected = s.connected;
    $('al-redirect').textContent = s.redirectUrl;
    if (document.activeElement !== $('al-client-id')) $('al-client-id').value = s.clientId;
    $('al-autosync').checked = s.autoSync;
    $('al-connect-btn').textContent = connected ? 'Trennen' : 'Verbinden';
    $('al-status-text').textContent = connected
      ? 'Verbunden als ' + ((s.user && s.user.name) || 'AniList-Nutzer')
      : (s.clientId ? 'Nicht verbunden' : 'Nicht verbunden – zuerst Client-ID eintragen');
    const av = $('al-avatar');
    if (connected && s.user && s.user.avatar) { av.src = s.user.avatar; av.hidden = false; } else { av.hidden = true; }
  }

  // ── Abgleich ──────────────────────────────────────────────────────────
  const getLocal = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(text, cls, boxId) {
    const box = $(boxId || 'al-export-log');
    box.hidden = false;
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  // One item per Crunchyroll season: the highest watched episode number,
  // or the full episode count if NINA has the whole season as watched.
  async function buildExportPlan() {
    const res = await getLocal(['nina_cr_watch_status', 'nina_cr_ep_season']);
    const map = res.nina_cr_watch_status || {};
    const epSeason = res.nina_cr_ep_season || {};
    const plan = new Map();
    let skipped = 0;
    const add = (seriesId, seriesTitle, seasonTitle, ep, guessed) => {
      const key = seriesId + '|' + seasonTitle.trim().toLowerCase();
      const cur = plan.get(key);
      if (!cur || ep > cur.episode) plan.set(key, { key, seriesTitle, seasonTitle, episode: ep, guessed: guessed && (!cur || cur.guessed) });
    };
    for (const [id, e] of Object.entries(map)) {
      if (!e || e.status !== 'watched') continue;
      if (id.startsWith('season:')) {
        if (e.seriesId && e.series && e.seasonTitle && e.episodes) add(e.seriesId, e.series, e.seasonTitle, e.episodes, false);
        continue;
      }
      const n = /^\s*E(\d+)\b/i.exec(e.title || '');
      if (!e.seriesId || !e.series || !n) { skipped++; continue; }
      const season = epSeason[id];
      add(e.seriesId, e.series, season || 'Staffel 1', Number(n[1]), !season);
    }
    return { items: [...plan.values()].sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle)), skipped };
  }

  let exportPlan = null;
  async function previewExport() {
    $('al-export-log').textContent = '';
    $('al-export-run').hidden = true;
    if (!connected) { log('Bitte zuerst mit AniList verbinden.', 'err'); return; }
    exportPlan = await buildExportPlan();
    if (!exportPlan.items.length) {
      log('Nichts zum Übertragen gefunden.' + (exportPlan.skipped ? ' ' + exportPlan.skipped + ' ältere Folgen ohne Serien-Info (einmal öffnen, dann klappt es).' : ''), 'skip');
      return;
    }
    log(exportPlan.items.length + ' Staffeln werden übertragen:');
    for (const it of exportPlan.items) {
      log('• ' + it.seriesTitle + ' – ' + it.seasonTitle + ': bis Folge ' + it.episode + (it.guessed ? ' (Staffel geschätzt)' : ''));
    }
    if (exportPlan.skipped) log(exportPlan.skipped + ' ältere Folgen ohne Serien-Info werden übersprungen (einmal öffnen, dann klappt es).', 'skip');
    $('al-export-run').hidden = false;
  }

  async function runExport() {
    if (!exportPlan) return;
    $('al-export-run').hidden = true;
    $('al-export-btn').disabled = true;
    log('— Übertragung läuft —');
    let ok = 0;
    for (const it of exportPlan.items) {
      const r = await call('episodeWatched', { ...it, force: true });
      const name = it.seriesTitle + ' – ' + it.seasonTitle;
      if (!r.ok) log('✗ ' + name + ': ' + r.error, 'err');
      else if (r.result.updated) { ok++; log('✓ ' + r.result.title + ': Folge ' + r.result.progress + (r.result.episodes ? '/' + r.result.episodes : '') + (r.result.status === 'COMPLETED' ? ' (abgeschlossen)' : ''), 'ok'); }
      else {
        const why = { already: 'schon aktuell', completed: 'schon abgeschlossen', 'no-match': 'kein AniList-Eintrag gefunden', 'out-of-range': 'Folgennummer passt nicht', 'not-connected': 'nicht verbunden' }[r.result.skipped] || r.result.skipped;
        log('– ' + name + ': ' + why, 'skip');
      }
      await sleep(800); // AniList allows ~90 requests/minute
    }
    log('Fertig: ' + ok + ' aktualisiert.');
    $('al-export-btn').disabled = false;
    exportPlan = null;
  }

  async function runImport() {
    const L = (text, cls) => log(text, cls, 'al-import-log');
    $('al-import-log').textContent = '';
    if (!connected) { L('Bitte zuerst mit AniList verbinden.', 'err'); return; }
    $('al-import-btn').disabled = true;
    L('AniList-Liste wird geladen …');
    const r = await call('importList');
    $('al-import-btn').disabled = false;
    if (!r.ok) { L('Fehler: ' + r.error, 'err'); return; }
    const c = r.result.counts;
    const names = { CURRENT: 'am Schauen', COMPLETED: 'abgeschlossen', REPEATING: 'erneut', PAUSED: 'pausiert', DROPPED: 'abgebrochen', PLANNING: 'geplant' };
    L('✓ ' + r.result.total + ' Einträge importiert: ' + Object.keys(c).map((k) => c[k] + ' ' + (names[k] || k)).join(', '), 'ok');
    L('Serien-Poster auf Crunchyroll zeigen das jetzt an. Folgen werden beim Öffnen der jeweiligen Serie in NINA als gesehen markiert.');
    showImportInfo();
  }

  async function showImportInfo() {
    const res = await getLocal(['nina_anilist_list']);
    const l = res.nina_anilist_list;
    if (l && l.importedAt) {
      $('al-import-btn').textContent = 'Neu importieren';
      $('al-import-btn').title = 'Zuletzt: ' + new Date(l.importedAt).toLocaleString('de-DE') + ' (' + l.entries.length + ' Einträge)';
    }
  }

  // ── Watchlist bulk run (done by crunchyroll-watch-status.js in a
  // Crunchyroll tab, which has the session; progress comes back via storage)
  const WL_KEY = 'nina_cr_watchlist_sync';
  const WL_REQ = 'nina_cr_watchlist_bulk_request';

  function showWatchlistStatus(text, pct) {
    $('al-wl-progress').hidden = false;
    $('al-wl-status').textContent = text;
    $('al-wl-bar').style.width = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';
  }

  function showWatchlistProgress(state) {
    const b = state && state.bulk;
    const btn = $('al-wl-btn');
    if (!b) return;
    if (b.running) {
      btn.disabled = true;
      btn.textContent = 'Läuft …';
      showWatchlistStatus(b.done + ' von ' + b.total + ' Serien' + (b.current ? ' · gerade: ' + b.current : '') + ' · Crunchyroll-Tab bitte offen lassen',
        b.total ? (b.done / b.total) * 100 : 0);
    } else if (b.finishedAt) {
      btn.disabled = false;
      btn.textContent = 'Erneut übertragen';
      showWatchlistStatus('✓ Fertig am ' + new Date(b.finishedAt).toLocaleString('de-DE') + ' · ' + b.total + ' Serien geprüft · neue Watchlist-Serien kommen ab jetzt automatisch dazu', 100);
    }
  }

  async function startWatchlistBulk() {
    if (!connected) { showWatchlistStatus('Bitte zuerst mit AniList verbinden.', 0); return; }
    $('al-wl-btn').disabled = true;
    $('al-wl-btn').textContent = 'Startet …';
    await new Promise((r) => chrome.storage.local.set({ [WL_REQ]: Date.now() }, r));
    const tabs = await new Promise((r) => chrome.tabs.query({ url: '*://*.crunchyroll.com/*' }, r));
    // Visible tab: Chrome slows timers down a lot in background tabs.
    if (!tabs.length) chrome.tabs.create({ url: 'https://www.crunchyroll.com/de/watchlist', active: true });
    else chrome.tabs.update(tabs[0].id, { active: true });
    showWatchlistStatus('Wartet auf den Crunchyroll-Tab …', 0);
  }

  function init() {
    if (!$('cat-anilist')) return;

    $('al-wl-btn').addEventListener('click', startWatchlistBulk);
    chrome.storage.local.get([WL_KEY], (res) => showWatchlistProgress(res[WL_KEY]));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[WL_KEY]) showWatchlistProgress(changes[WL_KEY].newValue);
    });

    $('al-export-btn').addEventListener('click', previewExport);
    $('al-export-run').addEventListener('click', runExport);
    $('al-import-btn').addEventListener('click', runImport);
    showImportInfo();

    $('al-client-id').addEventListener('change', (e) => {
      const v = e.target.value.trim();
      chrome.storage.sync.set({ [K_CLIENT]: v }, refresh);
    });

    $('al-autosync').addEventListener('change', (e) => {
      chrome.storage.sync.set({ [K_AUTOSYNC]: e.target.checked });
    });

    // Crunchyroll watchlist switches (read by crunchyroll-watch-status.js).
    const SWITCHES = { 'al-plan-watchlist': 'nina_anilist_plan_watchlist' };
    chrome.storage.sync.get(Object.values(SWITCHES), (res) => {
      for (const id in SWITCHES) {
        $(id).checked = res[SWITCHES[id]] !== false;
        $(id).addEventListener('change', (e) => chrome.storage.sync.set({ [SWITCHES[id]]: e.target.checked }));
      }
    });

    $('al-copy').addEventListener('click', () => {
      navigator.clipboard.writeText($('al-redirect').textContent).then(() => {
        $('al-copy').textContent = 'Kopiert';
        setTimeout(() => { $('al-copy').textContent = 'Kopieren'; }, 1500);
      }).catch(() => {});
    });

    $('al-connect-btn').addEventListener('click', async () => {
      const btn = $('al-connect-btn');
      btn.disabled = true;
      if (connected) {
        await call('logout');
      } else {
        // Save a just-typed id first (the change event may not have fired).
        const v = $('al-client-id').value.trim();
        await new Promise((r) => chrome.storage.sync.set({ [K_CLIENT]: v }, r));
        $('al-status-text').textContent = 'Anmeldung läuft …';
        const r = await call('login');
        if (!r.ok) $('al-status-text').textContent = 'Fehler: ' + r.error;
      }
      btn.disabled = false;
      const msg = $('al-status-text').textContent;
      await refresh();
      if (!connected && msg.startsWith('Fehler')) $('al-status-text').textContent = msg;
    });

    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
