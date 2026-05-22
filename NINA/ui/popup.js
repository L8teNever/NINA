// popup.js — Shared by popup.html and sidepanel.html
'use strict';

const SPEED_MIN  = 0.25;
const SPEED_MAX  = 10;
const SPEED_STEP = 0.25;
const VOL_MIN    = 0;
const VOL_MAX    = 6;
const VOL_STEP   = 0.1;

let currentSpeed  = 1;
let currentVolume = 1;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 100) / 100));
const clampSpeed = (v) => clamp(v, SPEED_MIN, SPEED_MAX);
const clampVol   = (v) => clamp(v, VOL_MIN,   VOL_MAX);

const $ = (id) => document.getElementById(id);

function updateSliderTrack(slider, prop) {
  if (!slider) return;
  const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.setProperty(prop, pct + '%');
}

function updateSpeedUI(speed) {
  const display = $('popup-speed-display');
  const slider  = $('popup-slider');
  if (display) display.textContent = speed.toFixed(2) + '×';
  if (slider) {
    slider.value = speed;
    updateSliderTrack(slider, '--pct');
  }
  document.querySelectorAll('.chip[data-speed]').forEach((btn) => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });
}

function updateVolUI(gain) {
  const display = $('popup-vol-display');
  const slider  = $('popup-vol-slider');
  if (display) display.textContent = Math.round(gain * 100) + '%';
  if (slider) {
    slider.value = gain;
    updateSliderTrack(slider, '--vpct');
  }
}

function updateAutoSkipBtn(enabled) {
  const btn = $('popup-autoskip-btn');
  if (btn) btn.checked = !!enabled;
}

function toggleSection(id) {
  const section = $(id);
  if (!section) return;
  const wasExpanded = section.classList.contains('expanded');
  document.querySelectorAll('.m3-section').forEach((s) => s.classList.remove('expanded'));
  if (!wasExpanded) section.classList.add('expanded');
}

// Chrome cannot inject into chrome://, edge://, about:, view-source:, or the Web Store.
function canInject(url) {
  if (!url) return false;
  return /^https?:|^file:/i.test(url) && !/^https?:\/\/chrome\.google\.com\/webstore/i.test(url);
}

async function getActiveInjectableTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || !canInject(tab.url)) return null;
  return tab;
}

async function setSpeed(speed) {
  speed = clampSpeed(speed);
  currentSpeed = speed;
  updateSpeedUI(speed);

  chrome.storage.local.set({ joyn_speed: speed });

  const tab = await getActiveInjectableTab();
  if (!tab) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: (s) => {
        try { localStorage.setItem('joyn_speed_value', s); } catch (_) {}
        if (typeof window.__joynForceSpeed === 'function') window.__joynForceSpeed(s);
        document.querySelectorAll('video').forEach((v) => {
          try { v.playbackRate = s; } catch (_) {}
        });
      },
      args: [speed],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (s) => {
        const findVids = (root) => {
          const out = [];
          try { root.querySelectorAll('video').forEach((v) => out.push(v)); } catch (_) {}
          try {
            root.querySelectorAll('*').forEach((el) => {
              if (el.shadowRoot) findVids(el.shadowRoot).forEach((v) => out.push(v));
            });
          } catch (_) {}
          return out;
        };
        findVids(document).forEach((v) => {
          try { v.playbackRate = s; } catch (_) {}
        });
      },
      args: [speed],
    });
  } catch (err) {
    console.warn('[SpeedCtrl] inject error:', err.message);
  }
}

async function setVolume(gain) {
  gain = clampVol(gain);
  currentVolume = gain;
  updateVolUI(gain);

  chrome.storage.local.set({ joyn_volume: gain });

  const tab = await getActiveInjectableTab();
  if (!tab) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      world: 'MAIN',
      func: (g) => { window.postMessage({ __uscVolume: g }, '*'); },
      args: [gain],
    });
  } catch (err) {
    console.warn('[SpeedCtrl] volume notify error:', err.message);
  }
}

function updateAutoLikeUI(enabled, threshold) {
  const sw      = $('popup-autolike-btn');
  const slider  = $('popup-autolike-slider');
  const display = $('autolike-display');
  const text    = $('autolike-threshold-text');
  if (sw) sw.checked = !!enabled;
  if (slider) {
    slider.value = threshold;
    updateSliderTrack(slider, '--pct');
    slider.disabled = !enabled;
  }
  if (display) display.textContent = threshold + '%';
  if (text) text.textContent = threshold;
}

function init() {
  chrome.storage.local.get(
    ['joyn_speed', 'joyn_volume', 'joyn_autoskip', 'joyn_autolike_enabled', 'joyn_autolike_threshold'],
    (res) => {
      const speed  = parseFloat(res.joyn_speed);
      const volume = parseFloat(res.joyn_volume);
      currentSpeed  = isFinite(speed)  ? clampSpeed(speed)  : 1;
      currentVolume = isFinite(volume) ? clampVol(volume)   : 1;
      const autoSkip = res.joyn_autoskip !== undefined ? !!res.joyn_autoskip : true;
      const autoLikeEnabled = res.joyn_autolike_enabled !== undefined ? !!res.joyn_autolike_enabled : true;
      const t = parseFloat(res.joyn_autolike_threshold);
      const autoLikeThreshold = isFinite(t) ? Math.max(1, Math.min(100, Math.round(t))) : 10;
      updateSpeedUI(currentSpeed);
      updateVolUI(currentVolume);
      updateAutoSkipBtn(autoSkip);
      updateAutoLikeUI(autoLikeEnabled, autoLikeThreshold);
      runDiagnostics();
    },
  );

  $('popup-up')   ?.addEventListener('click', () => setSpeed(currentSpeed + SPEED_STEP));
  $('popup-down') ?.addEventListener('click', () => setSpeed(currentSpeed - SPEED_STEP));
  $('popup-reset')?.addEventListener('click', () => setSpeed(1));
  $('popup-slider')?.addEventListener('input', (e) => setSpeed(parseFloat(e.target.value)));
  $('popup-presets')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-speed]');
    if (btn) setSpeed(parseFloat(btn.dataset.speed));
  });

  $('popup-vol-up')    ?.addEventListener('click', () => setVolume(currentVolume + VOL_STEP));
  $('popup-vol-down')  ?.addEventListener('click', () => setVolume(currentVolume - VOL_STEP));
  $('popup-vol-reset') ?.addEventListener('click', () => setVolume(1));
  $('popup-vol-slider')?.addEventListener('input', (e) => setVolume(parseFloat(e.target.value)));

  $('popup-autoskip-btn')?.addEventListener('change', (e) => {
    chrome.storage.local.set({ joyn_autoskip: !!e.target.checked });
  });

  $('popup-autolike-btn')?.addEventListener('change', (e) => {
    const enabled = !!e.target.checked;
    chrome.storage.local.set({ joyn_autolike_enabled: enabled });
    const slider = $('popup-autolike-slider');
    if (slider) slider.disabled = !enabled;
  });

  $('popup-autolike-slider')?.addEventListener('input', (e) => {
    const v = Math.max(1, Math.min(100, Math.round(parseFloat(e.target.value))));
    chrome.storage.local.set({ joyn_autolike_threshold: v });
    updateSliderTrack(e.target, '--pct');
    const display = $('autolike-display');
    const text    = $('autolike-threshold-text');
    if (display) display.textContent = v + '%';
    if (text) text.textContent = v;
  });

  document.querySelectorAll('.section-header').forEach((header) => {
    header.addEventListener('click', function () {
      const parent = this.closest('.m3-section');
      if (parent) toggleSection(parent.id);
    });
  });

  $('popup-slider')?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP;
    setSpeed(currentSpeed + delta);
  }, { passive: false });

  $('popup-vol-slider')?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? VOL_STEP : -VOL_STEP;
    setVolume(currentVolume + delta);
  }, { passive: false });

  updateSliderTrack($('popup-slider'),     '--pct');
  updateSliderTrack($('popup-vol-slider'), '--vpct');

  $('status-recheck')?.addEventListener('click', () => runDiagnostics());
  $('status-functest')?.addEventListener('click', () => runFunctionalTest());
}

// ── Diagnostics ────────────────────────────────────────────────────────────────
const EPSILON = 0.05;

async function runDiagnostics() {
  const badge  = $('status-badge');
  const report = $('status-report');
  if (!badge || !report) return;

  setBadge('checking', '— prüfe …');
  report.innerHTML = '';

  const tab = await getActiveInjectableTab();
  if (!tab) {
    setBadge('warn', '— n/a');
    report.appendChild(line('warn', 'Diese Seite kann nicht geprüft werden (chrome://, Web Store o. ä.).'));
    return;
  }

  let frames = [];
  let audio  = [];
  try {
    const speedResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: () => (typeof window.__uscDiagnose === 'function' ? window.__uscDiagnose() : null),
    });
    frames = speedResults.map((r) => r.result).filter(Boolean);

    const audioResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: () => (typeof window.__uscDiagnoseAudio === 'function' ? window.__uscDiagnoseAudio() : null),
    });
    audio = audioResults.map((r) => r.result).filter(Boolean);
  } catch (err) {
    setBadge('error', '✗ Inject fehlgeschlagen');
    report.appendChild(line('error', err.message || String(err)));
    return;
  }

  renderReport(frames, audio);
}

function setBadge(level, text) {
  const badge = $('status-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.remove('status-ok', 'status-warn', 'status-error', 'status-checking');
  badge.classList.add('status-' + level);
}

function line(level, text) {
  const div = document.createElement('div');
  div.className = 'status-line status-' + level;
  div.textContent = text;
  return div;
}

function renderReport(frames, audio) {
  const report = $('status-report');
  report.innerHTML = '';

  const allVideos = frames.flatMap((f) => f.videos.map((v) => ({ ...v, frameOrigin: f.origin, frameTarget: f.targetRate })));
  const interceptOk = frames.length > 0 && frames.every((f) => f.interceptActive);
  const target = currentSpeed;

  if (frames.length === 0) {
    setBadge('error', '✗ Kein Frame');
    report.appendChild(line('error', 'Speed-Patch wurde in keinem Frame gefunden. Erweiterung neu laden?'));
    return;
  }

  if (allVideos.length === 0) {
    setBadge('warn', '— kein Video');
    report.appendChild(line('warn', 'Kein <video>-Element auf der Seite. Öffne ein Video und prüfe erneut.'));
    report.appendChild(line('info', `Frames mit Speed-Patch: ${frames.length}`));
    return;
  }

  const problems = [];
  let allMatch = true;

  for (let i = 0; i < allVideos.length; i++) {
    const v = allVideos[i];
    const rateOk = Math.abs(v.rate - target) < EPSILON;
    if (!rateOk) allMatch = false;
    const label = `Video ${i + 1}: ${v.rate.toFixed(2)}× ${rateOk ? '✓' : '✗ (Ziel ' + target.toFixed(2) + '×)'}`;
    report.appendChild(line(rateOk ? 'ok' : 'error', label));
    if (!rateOk) {
      if (v.paused) problems.push('Video pausiert — Rate snappt beim Abspielen zurück.');
      else if (v.readyState < 2) problems.push('Video lädt noch — bitte gleich erneut prüfen.');
      else problems.push('Player setzt Rate aktiv zurück (z. B. Netflix/Disney+). Intercept versucht erneut beim nächsten ratechange-Event.');
    }
  }

  if (!interceptOk) {
    allMatch = false;
    report.appendChild(line('error', 'playbackRate-Intercept inaktiv — Browser blockiert Prototyp-Patch.'));
  }

  if (audio.length) {
    const targetGain = currentVolume;
    const gains = audio.flatMap((a) => a.videos.map((v) => v.gain).filter((g) => g != null));
    const ctxStates = audio.map((a) => a.ctxState);
    if (Math.abs(targetGain - 1) > 0.01) {
      if (!gains.length) {
        report.appendChild(line('warn', 'Audio Boost: GainNode noch nicht angelegt — wird beim ersten Klick aktiv.'));
      } else {
        const ok = gains.every((g) => Math.abs(g - targetGain) < 0.05);
        report.appendChild(line(ok ? 'ok' : 'error',
          'Audio Boost: ' + gains.map((g) => Math.round(g * 100) + '%').join(', ') +
          (ok ? ' ✓' : ' ✗ (Ziel ' + Math.round(targetGain * 100) + '%)')));
        if (!ok) allMatch = false;
      }
    }
    if (ctxStates.some((s) => s === 'suspended')) {
      report.appendChild(line('warn', 'AudioContext suspended — Browser fordert Klick auf der Seite.'));
    }
  }

  report.appendChild(line('info', `Frames: ${frames.length} · Videos: ${allVideos.length} · Intercept: ${interceptOk ? 'aktiv' : 'inaktiv'}`));

  if (allMatch) {
    setBadge('ok', '✓ Alles OK');
  } else {
    setBadge('error', '✗ Abweichung');
    if (problems.length) {
      const uniq = [...new Set(problems)];
      for (const p of uniq) report.appendChild(line('info', '↳ ' + p));
    }
  }
}

// ── Funktionstest (active probe) ──────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execAll(tabId, fn, args = []) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    func: fn,
    args,
  });
}

async function runFunctionalTest() {
  const report = $('test-report');
  if (!report) return;
  report.innerHTML = '';
  const btn = $('status-functest');
  if (btn) btn.disabled = true;
  report.appendChild(line('info', 'Starte Funktionstest …'));

  const tab = await getActiveInjectableTab();
  if (!tab) {
    report.innerHTML = '';
    report.appendChild(line('error', 'Diese Seite kann nicht geprüft werden (chrome://, Web Store oder Datei-URL).'));
    if (btn) btn.disabled = false;
    return;
  }

  const savedSpeed = currentSpeed;
  const testRate   = Math.abs(savedSpeed - 1) < 0.01 ? 1.75 : 1.0;
  report.innerHTML = '';

  try {
    // ─ 1) Patch presence ────────────────────────────────────────────────────
    const probeResults = await execAll(tab.id, () => ({
      hasDiag:  typeof window.__uscDiagnose      === 'function',
      hasAudio: typeof window.__uscDiagnoseAudio === 'function',
      hasForce: typeof window.__joynForceSpeed   === 'function',
      origin:   location.origin,
      url:      location.href,
    }));
    const probes = probeResults.map((r) => r.result).filter(Boolean);
    if (!probes.length) {
      report.appendChild(line('error', '1/5 · Content-Scripts fehlen — Erweiterung lädt auf dieser Seite nicht. Prüfe Berechtigungen / lade die Erweiterung neu.'));
      throw new Error('no probes');
    }
    const allLoaded = probes.every((p) => p.hasDiag && p.hasForce);
    if (!allLoaded) {
      report.appendChild(line('error', `1/5 · Patch unvollständig in ${probes.filter((p) => !p.hasDiag).length}/${probes.length} Frames. Site blockiert MAIN-world Script-Injection (CSP).`));
      throw new Error('patch missing');
    }
    report.appendChild(line('ok', `1/5 · Patch geladen in ${probes.length} Frame(s) ✓`));

    // ─ 2) Video discovery ──────────────────────────────────────────────────
    const diagBefore = await execAll(tab.id, () => window.__uscDiagnose());
    const framesBefore = diagBefore.map((r) => r.result).filter(Boolean);
    const videosBefore = framesBefore.flatMap((f) => f.videos);
    if (!videosBefore.length) {
      report.appendChild(line('error', '2/5 · Kein <video>-Element gefunden. Öffne ein Video und starte den Test erneut.'));
      throw new Error('no video');
    }
    report.appendChild(line('ok', `2/5 · ${videosBefore.length} Video(s) erkannt ✓`));

    // ─ 3) Force-set rate to a different value ──────────────────────────────
    await execAll(tab.id, (r) => window.__joynForceSpeed(r), [testRate]);
    await sleep(350);
    const diagAfter = await execAll(tab.id, () => window.__uscDiagnose());
    const videosAfter = diagAfter.map((r) => r.result).filter(Boolean).flatMap((f) => f.videos);
    const mismatched = videosAfter.filter((v) => Math.abs(v.rate - testRate) >= 0.05);
    if (!mismatched.length) {
      report.appendChild(line('ok', `3/5 · Override auf ${testRate.toFixed(2)}× erfolgreich ✓`));
    } else {
      report.appendChild(line('error', `3/5 · Override schlägt fehl bei ${mismatched.length}/${videosAfter.length} Video(s) ✗`));
      mismatched.forEach((v, i) => {
        const cause = v.paused ? 'Video pausiert — Rate snappt erst beim Play' :
                      v.readyState < 2 ? 'Video lädt noch (readyState ' + v.readyState + ')' :
                      'Player überschreibt playbackRate aktiv (typisch Netflix/Disney+/MediaSource-Streams)';
        report.appendChild(line('error', `   Video ${i + 1}: ${v.rate.toFixed(2)}× — ${cause}`));
      });
    }

    // ─ 4) Snap-back test (bypass attempt) ──────────────────────────────────
    const snapResults = await execAll(tab.id, () => {
      const v = document.querySelector('video');
      if (!v) return null;
      const before = v.playbackRate;
      v.playbackRate = 1.0;
      const immediate = v.playbackRate;
      return { before, immediate, target: window.__uscDiagnose().targetRate };
    });
    const snap = snapResults.map((r) => r.result).find(Boolean);
    if (snap) {
      if (Math.abs(testRate - 1) < 0.01) {
        report.appendChild(line('info', '4/5 · Snap-back-Test übersprungen (Ziel ist 1×)'));
      } else {
        const snapOk = Math.abs(snap.immediate - snap.target) < 0.05;
        if (snapOk) {
          report.appendChild(line('ok', `4/5 · Setter-Intercept fängt fremde playbackRate-Sets ab ✓`));
        } else {
          report.appendChild(line('error', `4/5 · Snap-back versagt: Player kann Rate auf ${snap.immediate.toFixed(2)}× setzen (Ziel ${snap.target.toFixed(2)}×) ✗`));
          report.appendChild(line('info', '   → Site verwendet vermutlich einen eigenen Prototyp-Wrapper. Versuche, die Seite neu zu laden.'));
        }
      }
    }

    // ─ 5) Audio context ────────────────────────────────────────────────────
    const audioResults = await execAll(tab.id, () => window.__uscDiagnoseAudio && window.__uscDiagnoseAudio());
    const audio = audioResults.map((r) => r.result).filter(Boolean);
    if (!audio.length) {
      report.appendChild(line('warn', '5/5 · Audio-Patch nicht gefunden ⚠'));
    } else {
      const states = audio.map((a) => a.ctxState);
      if (states.includes('running')) {
        report.appendChild(line('ok', '5/5 · AudioContext aktiv ✓'));
      } else if (states.includes('suspended')) {
        report.appendChild(line('warn', '5/5 · AudioContext suspended ⚠ — klicke einmal in das Video, dann teste erneut.'));
      } else {
        report.appendChild(line('info', '5/5 · AudioContext noch nicht initialisiert (wird beim ersten Boost > 100% angelegt).'));
      }
    }

    report.appendChild(line('info', `Domain: ${probes[0].origin}`));
  } catch (err) {
    if (err.message !== 'no probes' && err.message !== 'patch missing' && err.message !== 'no video') {
      report.appendChild(line('error', 'Test-Fehler: ' + (err.message || String(err))));
    }
  } finally {
    // Restore user's rate
    try {
      await execAll(tab.id, (r) => window.__joynForceSpeed && window.__joynForceSpeed(r), [savedSpeed]);
    } catch (_) {}
    if (btn) btn.disabled = false;
    runDiagnostics();
  }
}

document.addEventListener('DOMContentLoaded', init);
