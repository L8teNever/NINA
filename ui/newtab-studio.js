// newtab-studio.js — "Startseite anpassen": a side panel docked on the right
// (like a browser side panel) with everything for the new tab in one place:
// blocks (show/hide, add, reset; drag/resize them on the page), clock,
// anime news cards and background. The page moves left of the panel and
// shows every change live.
//
// Arranging uses newtab-layout.js (window.NinaLayout, edit mode while the
// panel is open; "Fertig" saves, "Abbrechen"/Esc discards). Clock and
// background controls drive the existing inputs that newtab.js already
// listens to (they live in the hidden "Aussehen" page of the old drawer),
// so they are saved immediately, as before.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NEWS_KEY = 'nina_news_strip';
  const PANEL_W = 380, GAP = 12;

  const style = document.createElement('style');
  style.textContent = `
    #nst {
      position: fixed; top: ${GAP}px; right: ${GAP}px; bottom: ${GAP}px; width: ${PANEL_W}px; z-index: 1500;
      display: flex; flex-direction: column; box-sizing: border-box;
      background: #1e1f22; color: #d4d4d8; border: 1px solid rgba(255,255,255,.08); border-radius: 22px;
      box-shadow: 0 24px 70px rgba(0,0,0,.55);
      font: 14px/1.45 system-ui, "Segoe UI", sans-serif;
      transform: translateX(calc(100% + ${GAP * 2}px)); transition: transform .4s cubic-bezier(.16,1,.3,1);
    }
    body.nst-open #nst { transform: none; }
    body.nst-open #nlay { right: ${PANEL_W + GAP * 2}px; }
    #nlay { transition: right .4s cubic-bezier(.16,1,.3,1); }
    body.nst-open #nlay-bar { display: none !important; }
    body.nst-open #settings-btn, body.nst-open #nina-news-btn { opacity: 0; pointer-events: none; }
    /* old drawer entries replaced by this panel / the NINA settings page */
    #menu-shortcuts-btn, #menu-appearance-btn { display: none !important; }

    #nst header { display: flex; align-items: flex-start; gap: 12px; padding: 18px 18px 14px 22px; border-bottom: 1px solid rgba(255,255,255,.06); }
    #nst header div { flex: 1; min-width: 0; }
    #nst h3 { margin: 0; font-size: 17px; font-weight: 700; color: #fff; }
    #nst header p { margin: 2px 0 0; font-size: 12px; color: #71717a; }
    #nst .nst-x { width: 34px; height: 34px; flex: 0 0 auto; border: 0; border-radius: 999px; background: none; color: #a1a1aa; font-size: 20px; cursor: pointer; }
    #nst .nst-x:hover { background: rgba(255,255,255,.06); color: #fff; }

    #nst .nst-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 14px 16px 18px; }
    #nst .nst-body::-webkit-scrollbar { width: 10px; }
    #nst .nst-body::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
    #nst .nst-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 10px; border: 3px solid transparent; background-clip: padding-box; }
    #nst .nst-body::-webkit-scrollbar-thumb:hover { background: rgba(6,182,212,.6); background-clip: padding-box; }

    #nst h4 { margin: 18px 4px 8px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #71717a; }
    #nst .nst-card { background: #141518; border: 1px solid rgba(255,255,255,.05); border-radius: 16px; overflow: hidden; }
    #nst .nst-row { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; box-sizing: border-box; }
    #nst .nst-row + .nst-row { border-top: 1px solid rgba(255,255,255,.05); }
    #nst .nst-row > .nst-l { flex: 1; min-width: 0; color: #e4e4e7; font-weight: 550; }
    #nst .nst-row > .nst-l small { display: block; font-weight: 400; font-size: 12px; color: #71717a; }
    #nst .nst-hint { margin: 8px 4px 0; font-size: 12px; color: #71717a; }

    #nst .nst-block .nst-l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #nst .nst-block.off .nst-l { color: #71717a; text-decoration: line-through; }
    #nst .nst-ib { width: 32px; height: 32px; flex: 0 0 auto; border: 0; border-radius: 10px; background: none; color: #a1a1aa; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
    #nst .nst-ib:hover { background: rgba(255,255,255,.06); color: #fff; }
    #nst .nst-ib.del:hover { background: rgba(239,68,68,.14); color: #f87171; }
    #nst .nst-ib svg { width: 18px; height: 18px; }
    #nst .nst-btns { display: flex; gap: 8px; margin-top: 10px; }
    #nst .nst-btn { height: 36px; padding: 0 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: none; color: #d4d4d8; font: 600 13px system-ui, sans-serif; cursor: pointer; }
    #nst .nst-btn:hover { border-color: rgba(6,182,212,.5); color: #fff; }
    #nst .nst-btn.grow { flex: 1; }
    #nst .nst-btn.accent { border-style: dashed; border-color: rgba(6,182,212,.45); color: #22d3ee; }
    #nst .nst-btn.danger { color: #f87171; border-color: rgba(239,68,68,.3); }
    #nst .nst-btn.danger:hover { background: rgba(239,68,68,.1); }

    #nst .nst-switch { position: relative; width: 44px; height: 26px; flex: 0 0 auto; }
    #nst .nst-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
    #nst .nst-switch span { position: absolute; inset: 0; border-radius: 999px; background: #3f3f46; transition: background .2s; pointer-events: none; }
    #nst .nst-switch span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #e4e4e7; transition: transform .2s; }
    #nst .nst-switch input:checked + span { background: #06b6d4; }
    #nst .nst-switch input:checked + span::after { transform: translateX(18px); background: #0b0c0e; }

    #nst .nst-step { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(255,255,255,.05); }
    #nst .nst-step button { width: 30px; height: 30px; border: 0; border-radius: 9px; background: none; color: #d4d4d8; font: 700 16px/1 system-ui, sans-serif; cursor: pointer; }
    #nst .nst-step button:hover:not(:disabled) { background: rgba(6,182,212,.15); color: #fff; }
    #nst .nst-step button:disabled { opacity: .3; cursor: default; }
    #nst .nst-step b { min-width: 26px; text-align: center; color: #fff; font-variant-numeric: tabular-nums; }

    #nst .nst-color { position: relative; width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); overflow: hidden; flex: 0 0 auto; }
    #nst .nst-color input { position: absolute; inset: -8px; width: 50px; height: 50px; border: 0; padding: 0; cursor: pointer; }
    #nst .nst-link { border: 0; background: none; color: #22d3ee; font: 600 12px system-ui, sans-serif; cursor: pointer; padding: 4px; }
    #nst .nst-link:hover { text-decoration: underline; }
    #nst .nst-range { display: block; padding: 4px 14px 14px; }
    #nst .nst-range-h { display: flex; justify-content: space-between; font-size: 12px; color: #a1a1aa; margin-bottom: 8px; }
    #nst input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; margin: 0; cursor: pointer; }
    #nst input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 6px; background: linear-gradient(to right, #06b6d4 var(--p, 50%), rgba(255,255,255,.1) var(--p, 50%)); }
    #nst input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px rgba(6,182,212,.35); }

    #nst footer { display: flex; gap: 10px; padding: 14px 18px 18px; border-top: 1px solid rgba(255,255,255,.06); }
    #nst footer button { flex: 1; height: 42px; border-radius: 14px; border: 1px solid rgba(255,255,255,.1); background: none; color: #d4d4d8; font: 600 14px system-ui, sans-serif; cursor: pointer; }
    #nst footer button:hover { color: #fff; border-color: rgba(255,255,255,.25); }
    #nst footer button.primary { background: #06b6d4; border-color: transparent; color: #000; }
    #nst footer button.primary:hover { background: #22d3ee; }
  `;
  document.head.appendChild(style);

  const ICON = {
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 19c-7 0-11-7-11-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19"/><path d="M1 1l22 22"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>'
  };

  const el = (tag, props, kids) => {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const k of kids || []) n.append(k);
    return n;
  };
  const row = (label, sub, right) => {
    const l = el('div', { className: 'nst-l', textContent: label });
    if (sub) l.append(el('small', { textContent: sub }));
    return el('div', { className: 'nst-row' }, [l, ...[].concat(right || [])]);
  };
  function switchEl(checked, onChange) {
    const input = el('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { className: 'nst-switch' }, [input, el('span')]);
  }
  function stepper(value, min, max, onChange) {
    const minus = el('button', { type: 'button', textContent: '−' });
    const plus = el('button', { type: 'button', textContent: '+' });
    const v = el('b', { textContent: value });
    const paint = () => { v.textContent = value; minus.disabled = value <= min; plus.disabled = value >= max; };
    minus.addEventListener('click', () => { value = Math.max(min, value - 1); paint(); onChange(value); });
    plus.addEventListener('click', () => { value = Math.min(max, value + 1); paint(); onChange(value); });
    paint();
    return el('div', { className: 'nst-step' }, [minus, v, plus]);
  }
  // drive an input of the old drawer that newtab.js listens to
  function poke(input, prop, value, evt) {
    if (!input) return;
    input[prop] = value;
    input.dispatchEvent(new Event(evt, { bubbles: true }));
  }

  let panel = null, body = null, isOpen = false;

  function build() {
    if (panel) return;
    panel = el('aside', { id: 'nst' });
    panel.setAttribute('aria-label', 'Startseite anpassen');
    const close = el('button', { className: 'nst-x', title: 'Schließen (Änderungen an der Anordnung verwerfen)', textContent: '×' });
    close.addEventListener('click', () => done(false));
    panel.append(el('header', {}, [
      el('div', {}, [el('h3', { textContent: 'Startseite anpassen' }), el('p', { textContent: 'Änderungen siehst du links sofort.' })]),
      close
    ]));
    body = el('div', { className: 'nst-body' });
    panel.append(body);
    const cancel = el('button', { type: 'button', textContent: 'Abbrechen' });
    const ok = el('button', { type: 'button', className: 'primary', textContent: 'Fertig' });
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    panel.append(el('footer', {}, [cancel, ok]));
    // typing in the panel must not reach the new tab's shortcuts
    for (const t of ['keydown', 'keyup', 'keypress']) panel.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    document.body.appendChild(panel);

    // background image added/removed elsewhere → refresh that part
    const clear = $('btn-clear-bg');
    if (clear) new MutationObserver(() => { if (isOpen) render(); }).observe(clear, { attributes: true, attributeFilter: ['class'] });
  }

  let renderSeq = 0;
  async function render() {
    const L = window.NinaLayout;
    const seq = ++renderSeq;
    const strip = { count: 3, cols: 3, ...((await new Promise((r) => chrome.storage.sync.get([NEWS_KEY], r)))[NEWS_KEY] || {}) };
    if (seq !== renderSeq) return; // a newer render started meanwhile
    const scroll = body.scrollTop;
    body.textContent = '';

    // ── Bausteine ──
    body.append(el('h4', { textContent: 'Bausteine' }));
    const blocks = el('div', { className: 'nst-card' });
    const widgets = (L && L.layout && L.layout.widgets) || {};
    for (const id of Object.keys(widgets)) {
      const g = widgets[id];
      const off = g.show === false;
      const eye = el('button', { type: 'button', className: 'nst-ib', title: off ? 'Einblenden' : 'Ausblenden', innerHTML: off ? ICON.eyeOff : ICON.eye });
      eye.addEventListener('click', () => L.toggleShow(id));
      const right = [eye];
      if (L.isCustom(id)) {
        const del = el('button', { type: 'button', className: 'nst-ib del', title: 'Baustein löschen', innerHTML: ICON.trash });
        del.addEventListener('click', () => L.removeWidget(id));
        right.push(del);
      }
      const r = row(L.label(id), null, right);
      r.classList.add('nst-block');
      if (off) r.classList.add('off');
      blocks.append(r);
    }
    body.append(blocks);
    const add = el('button', { type: 'button', className: 'nst-btn accent grow', textContent: '+ Baustein hinzufügen' });
    add.addEventListener('click', (e) => L.openAddMenu(e));
    const reset = el('button', { type: 'button', className: 'nst-btn', textContent: 'Zurücksetzen' });
    reset.addEventListener('click', () => L.resetLayout());
    body.append(el('div', { className: 'nst-btns' }, [add, reset]));
    body.append(el('p', { className: 'nst-hint', textContent: 'Links auf der Seite ziehen zum Verschieben, Ecke unten rechts für die Größe. Rechtsklick auf einen Baustein für seine eigenen Optionen (z. B. Links bearbeiten).' }));

    // ── Uhr ──
    body.append(el('h4', { textContent: 'Uhr' }));
    const sec = $('seconds-toggle');
    body.append(el('div', { className: 'nst-card' }, [
      row('Sekunden anzeigen', null, switchEl(!sec || sec.checked, (v) => { poke(sec, 'checked', v, 'change'); setTimeout(() => L && L.refit(), 60); }))
    ]));

    // ── Anime-Neuigkeiten ──
    const saveStrip = () => chrome.storage.sync.set({ [NEWS_KEY]: { ...strip } });
    body.append(el('h4', { textContent: 'Anime-Neuigkeiten' }));
    body.append(el('div', { className: 'nst-card' }, [
      row('Anzahl Karten', null, stepper(strip.count, 1, 12, (v) => { strip.count = v; saveStrip(); })),
      row('Spalten', 'Karten nebeneinander', stepper(strip.cols, 1, 6, (v) => { strip.cols = v; saveStrip(); }))
    ]));

    // ── Hintergrund ──
    body.append(el('h4', { textContent: 'Hintergrund' }));
    const picker = $('bg-color-picker');
    const color = el('input', { type: 'color', value: picker ? picker.value : '#0b0c0e' });
    color.addEventListener('input', () => poke(picker, 'value', color.value, 'input'));
    const resetColor = el('button', { type: 'button', className: 'nst-link', textContent: 'Standard' });
    resetColor.addEventListener('click', () => { const b = $('reset-bg-color-btn'); if (b) b.click(); setTimeout(() => { if (picker) color.value = picker.value; }, 30); });

    const clearBtn = $('btn-clear-bg');
    const hasImage = !!clearBtn && !clearBtn.classList.contains('hidden');
    const upload = el('button', { type: 'button', className: 'nst-btn', textContent: hasImage ? 'Anderes Bild' : 'Bild hochladen' });
    upload.addEventListener('click', () => { const f = $('bg-upload'); if (f) f.click(); });
    const imgRight = [upload];
    if (hasImage) {
      const rm = el('button', { type: 'button', className: 'nst-btn danger', textContent: 'Entfernen' });
      rm.addEventListener('click', () => clearBtn.click());
      imgRight.push(rm);
    }
    const card = el('div', { className: 'nst-card' }, [
      row('Farbe', null, [resetColor, el('span', { className: 'nst-color' }, [color])]),
      row('Bild', hasImage ? 'Eigenes Bild aktiv' : 'Kein Bild', imgRight)
    ]);
    if (hasImage) {
      const slider = $('overlay-slider');
      const val = slider ? Number(slider.value) : 50;
      const range = el('input', { type: 'range', min: 0, max: 95, value: val });
      const out = el('span', { textContent: val + '%' });
      const paint = () => { range.style.setProperty('--p', (range.value / 95 * 100) + '%'); out.textContent = range.value + '%'; };
      range.addEventListener('input', () => { paint(); poke(slider, 'value', range.value, 'input'); });
      paint();
      card.append(el('div', { className: 'nst-range' }, [
        el('div', { className: 'nst-range-h' }, [el('span', { textContent: 'Bild abdunkeln' }), out]),
        range
      ]));
    }
    body.append(card);
    body.scrollTop = scroll;
  }

  function open() {
    const L = window.NinaLayout;
    if (!L) return;
    build();
    const drawer = $('settings-modal');
    if (drawer && drawer.classList.contains('active')) { const x = $('close-settings-x'); if (x) x.click(); }
    if (window.__ninaBookmarksOpen) return;
    isOpen = true;
    L.startEdit();
    document.body.classList.add('nst-open');
    render();
    // the page area got narrower: re-fit after the slide
    setTimeout(() => L.refit(), 450);
  }

  function teardown() {
    if (!isOpen) return;
    isOpen = false;
    document.body.classList.remove('nst-open');
    setTimeout(() => window.NinaLayout && window.NinaLayout.refit(), 450);
  }

  function done(save) {
    const L = window.NinaLayout;
    if (L && L.editing) L.finishEdit(save); // fires nlay-change → teardown
    teardown();
  }

  // layout changed (block shown/hidden/added, reset, edit ended)
  document.addEventListener('nlay-change', () => {
    if (!isOpen) return;
    if (!window.NinaLayout.editing) { teardown(); return; }
    render();
  });

  window.NinaStudio = { open, close: () => done(false) };
})();
