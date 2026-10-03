// platform-settings.js — switches on the streaming-service pages of the
// options page that live in one synced object: nina_volume_boost =
// { prime, netflix, disney, joyn } (missing or true = on). Read by the
// volume code in content/universal.js.

(function () {
  'use strict';

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
