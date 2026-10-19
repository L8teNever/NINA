// options.js — NINA Lite settings page: playback / auto-skip, plus page
// switching. Switches with data-sync-bool and the AniList section are handled
// by crunchyroll-settings.js and anilist-settings.js (shared with the main
// extension). Values go straight to the keys the content scripts read.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const paintSlider = (slider) => {
    const min = parseFloat(slider.min) || 0, max = parseFloat(slider.max) || 100;
    slider.style.setProperty('--value-percent', ((slider.value - min) / (max - min)) * 100 + '%');
  };

  // ── Fast-forward speed (hold) ──────────────────────────────────────────
  const ff = $('ffSpeedSlider');
  const setFF = (v, save) => {
    v = Math.max(1, Math.min(10, Math.round(v * 10) / 10));
    ff.value = v;
    $('ffSpeedVal').textContent = v.toFixed(2) + 'x';
    paintSlider(ff);
    if (save) chrome.storage.local.set({ joyn_ff_speed: v });
  };
  ff.addEventListener('input', () => setFF(parseFloat(ff.value), true));
  ff.addEventListener('wheel', (e) => { e.preventDefault(); setFF(parseFloat(ff.value) + (e.deltaY < 0 ? 0.1 : -0.1), true); }, { passive: false });

  // ── Auto-skip ──────────────────────────────────────────────────────────
  const toggle = $('toggleAutoSkip');
  const delay = $('autoSkipDelaySlider');
  const setDelay = (v, save) => {
    v = Math.max(0, Math.min(10, parseInt(v) || 0));
    delay.value = v;
    $('autoSkipDelayVal').textContent = v === 0 ? 'Sofort' : v + 's';
    paintSlider(delay);
    if (save) chrome.storage.local.set({ joyn_autoskip_delay: v });
  };
  const showDelay = () => $('autoSkipDelaySliderBlock').classList.toggle('hidden', !toggle.checked);
  toggle.addEventListener('change', () => { chrome.storage.local.set({ joyn_autoskip: toggle.checked }); showDelay(); });
  delay.addEventListener('input', () => setDelay(delay.value, true));
  delay.addEventListener('wheel', (e) => { e.preventDefault(); setDelay(parseInt(delay.value) + (e.deltaY < 0 ? 1 : -1), true); }, { passive: false });

  chrome.storage.local.get(['joyn_ff_speed', 'joyn_autoskip', 'joyn_autoskip_delay'], (r) => {
    setFF(parseFloat(r.joyn_ff_speed) || 2, false);
    toggle.checked = r.joyn_autoskip !== false;
    setDelay(r.joyn_autoskip_delay || 0, false);
    showDelay();
  });

  // ── Google account (Drive sync of the watch status) ────────────────────
  // The token always comes from the background (lite/background.js →
  // googleToken), which uses getAuthToken or, with a web client id, the
  // Google login window.
  const DRIVE_KEY = 'nina_drive_connected';
  const WEB_CLIENT_KEY = 'nina_google_web_client_id';
  const ask = (msg) => new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (res || { error: 'Keine Antwort' })));
  });
  let busy = false;
  const paintDrive = (state, detail) => {
    const colors = { on: '#22c55e', off: '#94a3b8', busy: '#f59e0b', error: '#ef4444' };
    $('drive-status-dot').style.background = colors[state];
    $('drive-status-text').textContent = state === 'on' ? (detail ? 'Verbunden als ' + detail : 'Verbunden')
      : state === 'busy' ? 'Anmeldung läuft …'
      : state === 'error' ? 'Anmeldung fehlgeschlagen: ' + detail : 'Nicht verbunden';
    $('drive-connect-btn').textContent = state === 'on' ? 'Trennen' : 'Verbinden';
  };
  const showAccount = (token) => fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => r.json()).then((i) => paintDrive('on', i.email)).catch(() => paintDrive('on'));
  chrome.storage.local.get([DRIVE_KEY], async (r) => {
    if (!r[DRIVE_KEY]) { paintDrive('off'); return; }
    const res = await ask({ type: 'NINA_GET_TOKEN', interactive: false });
    if (res.token) showAccount(res.token); else paintDrive('off');
  });
  $('drive-connect-btn').addEventListener('click', () => {
    if (busy) return;
    busy = true;
    chrome.storage.local.get([DRIVE_KEY], async (r) => {
      if (r[DRIVE_KEY]) {
        const res = await ask({ type: 'NINA_GET_TOKEN', interactive: false });
        await ask({ type: 'NINA_REVOKE_TOKEN', token: res.token });
        chrome.storage.local.remove(DRIVE_KEY, () => paintDrive('off'));
      } else {
        paintDrive('busy');
        const res = await ask({ type: 'NINA_GET_TOKEN', interactive: true });
        if (res.token) chrome.storage.local.set({ [DRIVE_KEY]: true }, () => { showAccount(res.token); ask({ type: 'NINA_DRIVE_PULL' }); });
        else paintDrive('error', res.error);
      }
      busy = false;
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    const v = area === 'local' && changes.nina_google_auth_result && changes.nina_google_auth_result.newValue;
    if (!v) return;
    if (v.ok) chrome.storage.local.get(['nina_google_web_token'], (s) => s.nina_google_web_token && showAccount(s.nina_google_web_token.token));
    else paintDrive('error', v.error);
  });

  // web client for phone browsers
  const redirect = chrome.identity && chrome.identity.getRedirectURL ? chrome.identity.getRedirectURL() : '';
  $('g-redirect').textContent = redirect || '(in diesem Browser nicht verfügbar)';
  $('g-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(redirect).then(() => {
      $('g-copy').textContent = 'Kopiert';
      setTimeout(() => { $('g-copy').textContent = 'Kopieren'; }, 1500);
    }).catch(() => {});
  });
  const webClient = $('g-web-client');
  chrome.storage.sync.get([WEB_CLIENT_KEY], (r) => { webClient.value = r[WEB_CLIENT_KEY] || ''; });
  webClient.addEventListener('change', () => {
    const v = webClient.value.trim();
    if (v) chrome.storage.sync.set({ [WEB_CLIENT_KEY]: v }); else chrome.storage.sync.remove(WEB_CLIENT_KEY);
    chrome.storage.local.remove('nina_google_web_token');
  });

  // ── Pages ──────────────────────────────────────────────────────────────
  function showSection(id) {
    if (!id || !$(id)) return;
    document.querySelectorAll('.setting-section').forEach((s) => s.classList.toggle('is-active', s.id === id));
    document.querySelectorAll('.sidebar-link, .m-tab').forEach((l) => l.classList.toggle('active', l.getAttribute('data-target') === id));
    $('settingsContainer').scrollTop = 0;
    const on = document.querySelector('.m-tab.active');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('.sidebar-link[data-target], .m-tab[data-target]').forEach((l) => {
    l.addEventListener('click', (e) => { e.preventDefault(); showSection(l.getAttribute('data-target')); });
  });
  showSection((location.hash || '').replace('#', '') || 'cat-playback');
})();
