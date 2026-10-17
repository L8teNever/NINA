// platform-settings.js — switches on the streaming-service pages of the
// options page that live in one synced object: nina_volume_boost =
// { prime, netflix, disney, joyn } (missing or true = on). Read by the
// volume code in content/universal.js.

(function () {
  'use strict';

  // nina_stream_track = { prime: { track, anilist }, … } (content/stream-watch.js)
  const TRACK_KEY = 'nina_stream_track';
  const trackInputs = document.querySelectorAll('[data-stream-track]');
  const paintTrack = (v) => {
    for (const i of trackInputs) i.checked = !(v && v[i.dataset.streamTrack] && v[i.dataset.streamTrack][i.dataset.field] === false);
  };
  chrome.storage.sync.get([TRACK_KEY], (r) => paintTrack(r[TRACK_KEY]));
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c[TRACK_KEY]) paintTrack(c[TRACK_KEY].newValue); });
  for (const i of trackInputs) {
    i.addEventListener('change', () => {
      chrome.storage.sync.get([TRACK_KEY], (r) => {
        const all = r[TRACK_KEY] || {};
        all[i.dataset.streamTrack] = { ...(all[i.dataset.streamTrack] || {}), [i.dataset.field]: i.checked };
        chrome.storage.sync.set({ [TRACK_KEY]: all });
      });
    });
  }

  const KEY = 'nina_volume_boost';
  const inputs = document.querySelectorAll('[data-vol-boost]');
  if (!inputs.length) return;

  function paint(v) {
    for (const input of inputs) input.checked = !(v && v[input.dataset.volBoost] === false);
  }
  chrome.storage.sync.get([KEY], (r) => paint(r[KEY]));
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'sync' && c[KEY]) paint(c[KEY].newValue); });

  for (const input of inputs) {
    input.addEventListener('change', () => {
      chrome.storage.sync.get([KEY], (r) => {
        chrome.storage.sync.set({ [KEY]: { ...(r[KEY] || {}), [input.dataset.volBoost]: input.checked } });
      });
    });
  }
})();
