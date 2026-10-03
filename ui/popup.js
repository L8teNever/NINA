// popup.js — the popup behind NINA's toolbar icon: speed and volume (up to
// 600 %) for the current tab, on any website. Values go into
// chrome.storage.local.tab_speeds[tabId]; the content scripts (streaming
// sites) or the scripts background.js injects (every other site) apply them.
// All other settings live on the options page (gear icon).

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let tab = null;
  let saveTimer = null;

  const canUse = (url) => /^https?:|^file:/i.test(url || '') && !/^https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url || '');

  function paint(kind, value) {
    const input = $(kind);
    input.value = value;
    const pct = ((value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--p', pct + '%');
    if (kind === 'speed') $('speed-val').textContent = Number(value).toFixed(2) + 'x';
    else $('audio-val').textContent = Math.round(value) + '%';
    for (const b of document.querySelectorAll('#' + kind + '-presets button')) {
      b.classList.toggle('on', Math.abs(Number(b.dataset.v) - Number(value)) < 0.001);
    }
  }

  function save(patch) {
    if (!tab) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.get(['tab_speeds'], (res) => {
        const all = res.tab_speeds || {};
        all[tab.id] = { ...(all[tab.id] || {}), ...patch, url: tab.url };
        chrome.storage.local.set({ tab_speeds: all });
      });
    }, 60);
  }

  const setSpeed = (v) => { v = Math.max(0.25, Math.min(4, Number(v))); paint('speed', v); save({ speed: v }); };
  const setAudio = (v) => { v = Math.max(0, Math.min(600, Number(v))); paint('audio', v); save({ volume: v / 100 }); };

  // Also shown inside web pages as the NINA panel (iframe, content/hotkeys.js):
  // there the page closes it and sizes it to our content.
  const embedded = window.top !== window;
  const closeMe = () => { if (embedded) parent.postMessage({ __ninaPanel: 'close' }, '*'); else window.close(); };
  if (embedded) {
    const report = () => parent.postMessage({ __ninaPanel: 'height', h: document.documentElement.scrollHeight }, '*');
    new ResizeObserver(report).observe(document.body || document.documentElement);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMe(); });
  }

  async function init() {
    $('settings').addEventListener('click', () => { chrome.runtime.openOptionsPage(); closeMe(); });
    $('reset').addEventListener('click', () => { setSpeed(1); setAudio(100); });
    $('speed').addEventListener('input', (e) => setSpeed(e.target.value));
    $('audio').addEventListener('input', (e) => setAudio(e.target.value));
    for (const b of document.querySelectorAll('#speed-presets button')) b.addEventListener('click', () => setSpeed(b.dataset.v));
    for (const b of document.querySelectorAll('#audio-presets button')) b.addEventListener('click', () => setAudio(b.dataset.v));
    // mouse wheel over a slider: fine steps
    $('speed').addEventListener('wheel', (e) => { e.preventDefault(); setSpeed(Math.round((Number($('speed').value) + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100); }, { passive: false });
    $('audio').addEventListener('wheel', (e) => { e.preventDefault(); setAudio(Number($('audio').value) + (e.deltaY < 0 ? 10 : -10)); }, { passive: false });
    // the shortcut that opens this popup closes it again
    if (self.NinaHotkeys) NinaHotkeys.load((cfg) => {
      document.addEventListener('keydown', (e) => {
        if (cfg.popup.enabled && cfg.popup.combos.includes(NinaHotkeys.fromEvent(e))) { e.preventDefault(); closeMe(); }
      });
    });

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !canUse(tab.url)) {
      document.body.classList.add('disabled');
      $('note').hidden = false;
      $('note').textContent = 'Auf dieser Seite erlaubt Chrome keine Erweiterungen (z. B. chrome://-Seiten, Web Store).';
      tab = null;
      paint('speed', 1);
      paint('audio', 100);
      return;
    }
    try { $('site').textContent = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (_) {}
    chrome.storage.local.get(['tab_speeds'], (res) => {
      const s = (res.tab_speeds || {})[tab.id] || {};
      const sp = parseFloat(s.speed), vol = parseFloat(s.volume);
      paint('speed', isFinite(sp) ? sp : 1);
      paint('audio', isFinite(vol) ? Math.round(vol * 100) : 100);
    });
    // keep in sync with keyboard shortcuts (A/D, W/S) used meanwhile
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'local' || !c.tab_speeds || !tab) return;
      const s = (c.tab_speeds.newValue || {})[tab.id];
      if (!s) return;
      if (document.activeElement !== $('speed') && isFinite(parseFloat(s.speed))) paint('speed', parseFloat(s.speed));
      if (document.activeElement !== $('audio') && isFinite(parseFloat(s.volume))) paint('audio', Math.round(parseFloat(s.volume) * 100));
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
