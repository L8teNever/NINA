// backup.js — "Daten sichern & übertragen" in the options page: export all
// of NINA's chrome.storage (local + sync) to a JSON file and import it again,
// e.g. into an installation with a different extension id. Login tokens are
// left out on purpose.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SKIP_LOCAL = new Set(['nina_anilist_token', 'nina_anilist_user', 'nina_drive_connected', 'tab_speeds']);

  const getAll = (area) => new Promise((r) => chrome.storage[area].get(null, r));
  const setAll = (area, obj) => new Promise((r, j) => chrome.storage[area].set(obj, () => (chrome.runtime.lastError ? j(chrome.runtime.lastError) : r())));

  async function exportData() {
    const [local, sync] = await Promise.all([getAll('local'), getAll('sync')]);
    for (const k of SKIP_LOCAL) delete local[k];
    const data = { nina: 'backup', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), local, sync };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nina-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('nina-backup-status').textContent = 'Exportiert: ' + Object.keys(local).length + ' lokale und ' + Object.keys(sync).length + ' synchronisierte Einträge.';
  }

  // Watch-status maps are merged (newer entry wins, furthest position kept),
  // everything else is taken from the file.
  const MERGE_MAPS = ['nina_yt_watch_status', 'nina_cr_watch_status'];
  function mergeMaps(a, b) {
    const out = { ...(a || {}) };
    for (const id in b || {}) {
      const x = out[id], y = b[id];
      if (!x) { out[id] = y; continue; }
      const winner = (y.updatedAt || 0) >= (x.updatedAt || 0) ? y : x;
      const loser = winner === y ? x : y;
      const pos = isFinite(winner.lastPosition) && isFinite(loser.lastPosition) ? Math.max(winner.lastPosition, loser.lastPosition) : (winner.lastPosition ?? loser.lastPosition);
      out[id] = { ...loser, ...winner, lastPosition: pos };
    }
    return out;
  }

  async function importData(file) {
    const status = $('nina-backup-status');
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.nina !== 'backup' || typeof data.local !== 'object') throw new Error('Keine NINA-Sicherung');
      const current = await getAll('local');
      const local = { ...data.local };
      for (const k of SKIP_LOCAL) delete local[k];
      for (const k of MERGE_MAPS) if (local[k]) local[k] = mergeMaps(current[k], local[k]);
      await setAll('local', local);
      if (data.sync && typeof data.sync === 'object') {
        // sync has small per-item limits; skip anything that doesn't fit.
        for (const [k, v] of Object.entries(data.sync)) {
          try { await setAll('sync', { [k]: v }); } catch (_) {}
        }
      }
      status.textContent = 'Importiert (' + Object.keys(local).length + ' Einträge). Seite wird neu geladen …';
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      status.textContent = 'Import fehlgeschlagen: ' + (e && e.message || e);
    }
  }

  function init() {
    if (!$('nina-export-btn')) return;
    $('nina-export-btn').addEventListener('click', exportData);
    $('nina-import-btn').addEventListener('click', () => $('nina-import-file').click());
    $('nina-import-file').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
