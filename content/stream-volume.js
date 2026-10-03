// stream-volume.js — volume slider up to 600 % + mouse wheel in the players
// of Prime Video, Disney+, Joyn and Netflix (top frame, all four sites).
//
// Works on the tab's volume in chrome.storage.local.tab_speeds[tabId] like
// the rest of NINA: up to 100 % it sets video.volume, above that
// audio-patch.js boosts (applied by frame-speed.js on every site).
// Its own little state, so it runs next to universal.js (Prime, Disney+,
// Netflix) as well as joyn.js (Joyn).

(function () {
  'use strict';
  if (window.__ninaStreamVolume) return;
  window.__ninaStreamVolume = true;

  const VOL_MIN = 0, VOL_MAX = 6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let currentVolume = 1;
  let myTabId = null;
  let tabSettingsLoaded = false;
  let volumeLocalUntil = 0; // ignore our own storage echoes while dragging

  chrome.runtime.sendMessage({ type: 'GET_TAB_SETTINGS' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res) {
      myTabId = res.tabId;
      if (res.volume !== undefined) currentVolume = clamp(Number(res.volume) || 1, VOL_MIN, VOL_MAX);
    }
    tabSettingsLoaded = true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.tab_speeds || !myTabId || Date.now() < volumeLocalUntil) return;
    const s = (changes.tab_speeds.newValue || {})[myTabId];
    if (s && s.volume !== undefined) currentVolume = clamp(Number(s.volume), VOL_MIN, VOL_MAX);
  });

  function collectVideos(root, out = []) {
    try { out.push(...root.querySelectorAll('video')); } catch (_) {}
    try { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collectVideos(el.shadowRoot, out); } catch (_) {}
    return out;
  }
  function findMainVideo() {
    let best = null, area = 0;
    for (const v of collectVideos(document)) {
      const a = v.offsetWidth * v.offsetHeight;
      if (a > area) { area = a; best = v; }
    }
    return best;
  }

  // ── Streaming players: volume slider up to 600 %, mouse wheel ──────────
  // Prime Video, Disney+, Joyn and Netflix keep their own volume slider and
  // look, but its scale becomes 0-600 % (linear; above 100 % audio-patch.js
  // boosts through tab_speeds as everywhere). Mouse wheel over the volume
  // icon or the slider: 10 % steps. The player never sees the slider input,
  // otherwise it would set its own volume over ours.
  // Switch per platform: settings → Streaming-Plattformen (nina_volume_boost).
  const VOL_PLATFORM = (() => {
    const h = location.hostname;
    if (/(^|\.)(primevideo\.com|amazon\.(de|com|co\.uk))$/i.test(h)) return 'prime';
    if (/(^|\.)disneyplus\.com$/i.test(h)) return 'disney';
    if (/(^|\.)joyn\.(de|at|ch)$/i.test(h)) return 'joyn';
    if (/(^|\.)netflix\.com$/i.test(h)) return 'netflix';
    return null;
  })();
  if (VOL_PLATFORM) {
    let volOn = true;
    chrome.storage.sync.get(['nina_volume_boost'], (r) => { volOn = !(r.nina_volume_boost && r.nina_volume_boost[VOL_PLATFORM] === false); });
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'sync' && c.nina_volume_boost) volOn = !(c.nina_volume_boost.newValue && c.nina_volume_boost.newValue[VOL_PLATFORM] === false);
    });

    const LABEL_CLS = 'nina-vol-label';
    const labelCss = `.${LABEL_CLS} { position: absolute; left: 50%; transform: translateX(-50%); z-index: 5;
      font: 700 11px/1 system-ui, sans-serif; color: #fff; white-space: nowrap; pointer-events: none;
      text-shadow: 0 1px 3px rgba(0,0,0,.8); }
      .${LABEL_CLS}.below { bottom: -22px; } .${LABEL_CLS}.above { top: -20px; }
      .nina-vol-fill { position: absolute; left: 0; bottom: 0; width: 100%; border-radius: inherit; background: currentColor; pointer-events: none; }
      html.nina-vol-open #usc-overlay, html.nina-vol-open #usc-backdrop { opacity: 0 !important; pointer-events: none !important; transition: opacity .15s; }`;
    const addCss = (root) => {
      if (root.__ninaVolCss) return;
      root.__ninaVolCss = true;
      const st = document.createElement('style');
      st.textContent = labelCss;
      (root === document ? (document.head || document.documentElement) : root).appendChild(st);
    };
    addCss(document);

    let volSaveTimer = null;
    let volOwnedUntil = 0; // the player may set video.volume back shortly after
    const frac = () => currentVolume / VOL_MAX;
    const pctStr = () => Math.round(frac() * 1000) / 10 + '%';

    function setStreamVolume(v) {
      v = clamp(Math.round(v * 100) / 100, VOL_MIN, VOL_MAX);
      currentVolume = v;
      volumeLocalUntil = Date.now() + 1000;
      volOwnedUntil = Date.now() + 1500;
      const video = findMainVideo();
      if (video) {
        video.muted = false;
        try { video.volume = Math.min(v, 1); } catch (_) {}
      }
      clearTimeout(volSaveTimer);
      volSaveTimer = setTimeout(() => {
        if (!myTabId || !chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.local.get(['tab_speeds'], (res) => {
          const tabSpeeds = res.tab_speeds || {};
          tabSpeeds[myTabId] = { ...(tabSpeeds[myTabId] || {}), volume: currentVolume };
          volumeLocalUntil = Date.now() + 1000;
          chrome.storage.local.set({ tab_speeds: tabSpeeds });
        });
      }, 120);
      paint();
    }
    // the player's own volume handling right after ours: keep ours
    document.addEventListener('volumechange', (e) => {
      const v = e.target;
      if (!volOn || !(v instanceof HTMLMediaElement) || v.muted || Date.now() > volOwnedUntil) return;
      const want = Math.min(currentVolume, 1);
      if (Math.abs(v.volume - want) > 0.02) { try { v.volume = want; } catch (_) {} }
    }, true);

    function setLabel(host, pos) {
      if (!host) return;
      addCss(host.getRootNode());
      let label = host.querySelector(':scope > .' + LABEL_CLS);
      if (!label) {
        label = document.createElement('span');
        label.className = LABEL_CLS + ' ' + pos;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(label);
      }
      const text = Math.round(currentVolume * 100) + '%';
      if (label.textContent !== text) label.textContent = text;
    }
    // re-assert our values when the player writes its own back — but never
    // more than a few times a second, so two writers can't loop forever
    const guarded = new WeakSet();
    function guard(node, apply) {
      if (!node || guarded.has(node)) return;
      guarded.add(node);
      let n = 0, since = Date.now();
      new MutationObserver(() => {
        if (Date.now() - since > 1000) { n = 0; since = Date.now(); }
        if (++n <= 8) apply();
      }).observe(node, { attributes: true, attributeFilter: ['style'] });
    }

    // ---- find elements, also inside shadow roots (Disney+, Joyn) ----
    // Players keep hidden copies of their controls around: prefer the
    // visible match, else the first.
    function deepFind(selector) {
      const all = [];
      (function walk(root) {
        all.push(...root.querySelectorAll(selector));
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
      })(document);
      return all.find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || all[0] || null;
    }

    // ---- Netflix: NINA's own slider above the volume button ----
    let nf = null, nfHideTimer = null;
    function nfPopup() {
      if (nf) return nf;
      const st = document.createElement('style');
      st.textContent = `
        #nina-nf-vol { position: fixed; z-index: 2147483000; width: 44px; height: 168px; display: none;
          box-sizing: border-box; padding: 30px 0 16px; background: #262626; border-radius: 4px;
          box-shadow: 0 4px 18px rgba(0,0,0,.6); cursor: pointer; touch-action: none; }
        #nina-nf-vol.open { display: block; }
        #nina-nf-vol .t { position: relative; width: 6px; height: 100%; margin: 0 auto; border-radius: 3px; background: rgba(255,255,255,.3); }
        #nina-nf-vol .f { position: absolute; left: 0; bottom: 0; width: 100%; border-radius: 3px; background: #e50914; }
        #nina-nf-vol .k { position: absolute; left: 50%; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: #e50914; box-shadow: 0 0 0 2px rgba(0,0,0,.25); }
        #nina-nf-vol .l { position: absolute; top: 8px; left: 0; right: 0; text-align: center; font: 700 11px/1 "Netflix Sans", system-ui, sans-serif; color: #fff; }
        /* Netflix's own slider sits under ours */
        [data-nina-nf-hide] { visibility: hidden !important; }`;
      (document.head || document.documentElement).appendChild(st);
      const box = document.createElement('div');
      box.id = 'nina-nf-vol';
      box.innerHTML = '<span class="l"></span><div class="t"><div class="f"></div><div class="k"></div></div>';
      nf = { box, track: box.querySelector('.t'), fill: box.querySelector('.f'), thumb: box.querySelector('.k'), label: box.querySelector('.l') };
      return nf;
    }
    // Netflix's own popup would peek out behind ours: find what sits under
    // our box (not ours, not the video) and hide its popup-sized container.
    function nfHideNative(box, btn) {
      const r = box.getBoundingClientRect();
      const x = r.left + r.width / 2;
      // Netflix's popup is taller than ours: look above, inside and at the
      // top edge of our box
      const ys = [r.top - 12, r.top + 6, r.top + r.height / 2, r.bottom - 6];
      box.style.pointerEvents = 'none';
      const hits = new Set();
      for (const y of ys) for (const e of document.elementsFromPoint(x, y)) hits.add(e);
      box.style.pointerEvents = '';
      for (const first of hits) {
        if (box.contains(first) || first.tagName === 'VIDEO' || first === document.body || first === document.documentElement) continue;
        let pick = null;
        for (let n = first, i = 0; n && i < 8; n = n.parentElement, i++) {
          if (btn && n.contains(btn)) break; // the control bar, not the popup
          const bb = n.getBoundingClientRect();
          if (bb.height > 420 || bb.width > 200) break; // reached the player itself
          pick = n;
        }
        if (pick && !pick.hasAttribute('data-nina-nf-hide')) pick.setAttribute('data-nina-nf-hide', '');
      }
    }
    let nfProbe = null;
    function nfShow(btn) {
      const p = nfPopup();
      const host = document.fullscreenElement || document.body;
      if (p.box.parentElement !== host) host.appendChild(p.box);
      const r = btn.getBoundingClientRect();
      p.box.style.left = Math.round(r.left + r.width / 2 - 22) + 'px';
      p.box.style.top = Math.round(r.top - 168 - 6) + 'px';
      p.box.classList.add('open');
      nfHideNative(p.box, btn);
      // Netflix renders its popup a moment after the hover: keep checking
      clearInterval(nfProbe);
      nfProbe = setInterval(() => { if (p.box.classList.contains('open')) nfHideNative(p.box, btn); else clearInterval(nfProbe); }, 120);
      clearTimeout(nfHideTimer);
      paint();
    }
    function nfHideSoon() {
      clearTimeout(nfHideTimer);
      nfHideTimer = setTimeout(() => {
        if (dragging || !nf) return;
        nf.box.classList.remove('open');
        clearInterval(nfProbe);
        for (const n of document.querySelectorAll('[data-nina-nf-hide]')) n.removeAttribute('data-nina-nf-hide');
      }, 450);
    }
    if (VOL_PLATFORM === 'netflix') {
      window.addEventListener('pointerover', (ev) => {
        if (!volOn) return;
        const btn = document.querySelector('[data-uia^="control-volume"]');
        if (!btn) return;
        if (inZone(ev, [btn, nf && nf.box])) nfShow(btn); else if (nf && nf.box.classList.contains('open')) nfHideSoon();
      }, true);
    }

    // Each adapter: { zone: elements for the wheel, track: element for the
    // pointer math, drag: area where dragging starts, paint() }, or null
    // while the player has no volume control.
    let cache = null, cacheAt = 0;
    const ADAPTERS = {
      // invisible vertical input[type=range] 0-100 over a track; white fill
      // gets style="height: X%"
      prime() {
        const input = [...document.querySelectorAll('input[type="range"]')]
          .find((i) => /volume|lautst/i.test(i.getAttribute('aria-label') || '') && !i.classList.contains('usc-slider'));
        if (!input) return null;
        const box = input.parentElement;
        const track = box && box.firstElementChild !== input ? box.firstElementChild : null;
        const fill = track && track.children.length > 1 ? track.children[track.children.length - 1] : null;
        const zone = box && box.parentElement && box.parentElement.parentElement;
        const apply = () => { if (fill.style.height !== pctStr()) fill.style.height = pctStr(); };
        return {
          zone: [zone || box], track: null, drag: null,
          paint() {
            if (input.step !== 'any') input.step = 'any';
            const pos = frac() * 100;
            if (Math.abs(Number(input.value) - pos) > 0.05) input.value = String(Math.round(pos * 10) / 10);
            input.setAttribute('aria-valuetext', Math.round(currentVolume * 100) + '%');
            if (fill) { apply(); guard(fill, apply); }
            setLabel(box, 'below');
          }
        };
      },
      // <volume-bar> in shadow roots: track .volume-bar__max-level, fill
      // .volume-bar__current-level (height), thumb (top: calc(100% - X%))
      disney() {
        const popup = deepFind('.volume-bar__container');
        const btn = deepFind('.audio-control-container') || deepFind('.toggle-mute-button');
        if (!popup && !btn) return null;
        const root = popup && popup.getRootNode();
        const track = root && root.querySelector('.volume-bar__max-level');
        const fill = root && root.querySelector('.volume-bar__current-level');
        const thumb = root && root.querySelector('.volume-bar__thumb');
        const apply = () => {
          if (fill && fill.style.height !== pctStr()) fill.style.height = pctStr();
          const top = 'calc(100% - ' + pctStr() + ')';
          if (thumb && thumb.style.top !== top) thumb.style.top = top;
        };
        return {
          zone: [btn, popup].filter(Boolean), track, drag: popup,
          paint() {
            if (!popup) return;
            apply();
            guard(fill, apply);
            guard(thumb, apply);
            if (thumb) { thumb.setAttribute('aria-valuenow', Math.round(currentVolume * 100)); thumb.setAttribute('aria-valuemax', '600'); }
            setLabel(popup, 'above');
          }
        };
      },
      // shadow root: .volume-container (icon, role=slider), popup
      // .volume-slider-container, track .volume-slider, fill .volume (height)
      joyn() {
        const btn = deepFind('.volume-container');
        const popup = deepFind('.volume-slider-container');
        if (!btn && !popup) return null;
        const root = (popup || btn).getRootNode();
        const track = root.querySelector('.volume-slider');
        const fill = track && track.querySelector('.volume');
        const apply = () => { if (fill && fill.style.height !== pctStr()) fill.style.height = pctStr(); };
        return {
          zone: [btn, popup].filter(Boolean), track, drag: popup,
          paint() {
            if (!popup) return;
            apply();
            guard(fill, apply);
            if (btn) btn.setAttribute('aria-label', 'Lautstärke bei ' + Math.round(currentVolume * 100) + '%');
            setLabel(popup, 'above');
          }
        };
      },
      // Netflix: its slider's markup is not known well enough to remap, so
      // NINA shows its own slider (Netflix look: dark box, red fill) above
      // the volume button while it's hovered, covering Netflix's own.
      netflix() {
        const btn = document.querySelector('[data-uia^="control-volume"]');
        if (!btn) return null;
        const p = nfPopup();
        return {
          zone: [btn, p.box], track: p.track, drag: p.box,
          paint() {
            p.fill.style.height = pctStr();
            p.thumb.style.bottom = 'calc(' + pctStr() + ' - 7px)';
            p.label.textContent = Math.round(currentVolume * 100) + '%';
          }
        };
      }
    };

    function els() {
      const age = Date.now() - cacheAt;
      // a hidden slider copy: look again soon, the visible one may be open now
      const dragHidden = cache && cache.drag && cache.drag.getBoundingClientRect().width === 0;
      if (cache && cache.zone.every((z) => z.isConnected) && (!cache.track || cache.track.isConnected) &&
          age < 2000 && !(dragHidden && age > 600)) return cache;
      cache = ADAPTERS[VOL_PLATFORM]();
      cacheAt = Date.now();
      return cache;
    }
    function paint() {
      const e = volOn && tabSettingsLoaded && els();
      const open = !!(e && e.drag && e.drag.getBoundingClientRect().width > 0);
      // NINA's own speed pill (bottom right) would sit on top of the slider
      document.documentElement.classList.toggle('nina-vol-open', open);
      // nothing to draw while the slider is closed
      if (e && (open || !e.drag)) e.paint();
    }
    const inZone = (ev, list) => {
      const path = ev.composedPath ? ev.composedPath() : [ev.target];
      return list.some((z) => z && path.includes(z));
    };

    // Prime: the native input moves; take its value instead of the player.
    const onInput = (ev) => {
      if (!volOn || VOL_PLATFORM !== 'prime') return;
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'range' || !/volume|lautst/i.test(t.getAttribute('aria-label') || '')) return;
      ev.stopImmediatePropagation();
      setStreamVolume(Number(t.value) / 100 * VOL_MAX);
    };
    window.addEventListener('input', onInput, true);
    window.addEventListener('change', onInput, true);

    // Custom sliders (Disney+, Joyn, Netflix): NINA does the dragging.
    function fromPointer(ev, track) {
      const r = track.getBoundingClientRect();
      const f = r.height >= r.width ? (r.bottom - ev.clientY) / r.height : (ev.clientX - r.left) / r.width;
      setStreamVolume(clamp(f, 0, 1) * VOL_MAX);
    }
    let dragging = null;
    window.addEventListener('pointerdown', (ev) => {
      if (!volOn || VOL_PLATFORM === 'prime' || ev.button !== 0) return;
      const e = els();
      if (!e || !e.track || !e.drag || !inZone(ev, [e.drag])) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      dragging = e.track;
      fromPointer(ev, dragging);
    }, true);
    window.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      fromPointer(ev, dragging);
    }, true);
    const endDrag = (ev) => {
      if (!dragging) return;
      ev.stopImmediatePropagation();
      dragging = null;
    };
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    // the players also listen to mouse/click events on their slider
    for (const t of ['mousedown', 'mouseup', 'click', 'touchstart']) {
      window.addEventListener(t, (ev) => {
        if (!volOn || VOL_PLATFORM === 'prime') return;
        const e = cache;
        if (e && e.drag && e.drag.isConnected && inZone(ev, [e.drag])) ev.stopImmediatePropagation();
      }, true);
    }

    // Mouse wheel over the icon or the slider: 10 % steps.
    window.addEventListener('wheel', (ev) => {
      if (!volOn || !ev.deltaY) return;
      const e = els();
      if (!e || !inZone(ev, e.zone)) return;
      ev.preventDefault();
      ev.stopPropagation();
      setStreamVolume(currentVolume + (ev.deltaY < 0 ? 0.1 : -0.1));
    }, { capture: true, passive: false });

    // slider shown (hover) → our value right away. Driven by the pointer
    // (the popup opens on hover) instead of watching every DOM change, which
    // live-TV pages produce nonstop.
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; try { paint(); } catch (_) {} });
    };
    let lastOver = 0;
    window.addEventListener('pointerover', () => {
      const now = Date.now();
      if (now - lastOver < 100) return;
      lastOver = now;
      schedule();
      setTimeout(schedule, 150); // the popup renders a moment after the hover
    }, true);
    setInterval(schedule, 700);
  }
})();
