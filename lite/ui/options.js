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
  // Same flow as the main settings page: the token comes from chrome.identity,
  // content/lib/google-drive.js (loaded on the tracked sites) picks the flag up.
  const DRIVE_KEY = 'nina_drive_connected';
  const paintDrive = (connected, email, error) => {
    $('drive-status-dot').style.background = connected ? '#22c55e' : (error ? '#ef4444' : '#94a3b8');
    $('drive-status-text').textContent = error ? 'Anmeldung fehlgeschlagen: ' + error
      : connected ? (email ? 'Verbunden als ' + email : 'Verbunden') : 'Nicht verbunden';
    $('drive-connect-btn').textContent = connected ? 'Trennen' : 'Verbinden';
  };
  const withEmail = (token) => fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => r.json()).then((i) => paintDrive(true, i.email)).catch(() => paintDrive(true));
  chrome.storage.local.get([DRIVE_KEY], (r) => {
    if (!r[DRIVE_KEY]) { paintDrive(false); return; }
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) paintDrive(false); else withEmail(token);
    });
  });
  $('drive-connect-btn').addEventListener('click', () => {
    chrome.storage.local.get([DRIVE_KEY], (r) => {
      if (r[DRIVE_KEY]) {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(token) }).catch(() => {});
            chrome.identity.removeCachedAuthToken({ token }, () => {});
          }
          chrome.storage.local.remove(DRIVE_KEY, () => paintDrive(false));
        });
      } else {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError || !token) {
            paintDrive(false, null, chrome.runtime.lastError ? chrome.runtime.lastError.message : 'kein Token erhalten');
            return;
          }
          chrome.storage.local.set({ [DRIVE_KEY]: true }, () => withEmail(token));
        });
      }
    });
  });

  // ── Pages ──────────────────────────────────────────────────────────────
  function showSection(id) {
    if (!id || !$(id)) return;
    document.querySelectorAll('.setting-section').forEach((s) => s.classList.toggle('is-active', s.id === id));
    document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.toggle('active', l.getAttribute('data-target') === id));
    $('settingsContainer').scrollTop = 0;
    const on = document.querySelector('.sidebar-link.active');
    if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }
  document.querySelectorAll('.sidebar-link[data-target]').forEach((l) => {
    l.addEventListener('click', (e) => { e.preventDefault(); showSection(l.getAttribute('data-target')); });
  });
  showSection((location.hash || '').replace('#', '') || 'cat-playback');
})();
