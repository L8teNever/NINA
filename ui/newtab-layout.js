// newtab-layout.js — freely arrangeable new tab page.
//
// "Startseite anordnen" (settings drawer of the new tab) switches into an
// edit mode with a visible grid: the blocks Uhr, Suche and Anime-Neuigkeiten
// can be dragged anywhere, resized by their corner (snapping to the grid) and
// shown/hidden with the eye button. "Fertig" saves the arrangement
// (chrome.storage.sync, so it follows your Google account), "Zurücksetzen"
// goes back to the original centered page.
//
// Without a saved arrangement nothing changes: the page keeps its original
// layout. With one, the blocks are moved into absolutely positioned boxes
// (positions in grid cells, so it adapts to any window size):
//  • the clock is scaled to fit its box,
//  • search and news take the box's width.

(function () {
  'use strict';

  const KEY = 'nina_newtab_layout';
  const COLS = 48, ROWS = 32; // finer grid (older layouts used 24 × 16, see migrate)
  const $ = (id) => document.getElementById(id);

  const WIDGETS = {
    clock:  { label: 'Uhr',               find: () => document.querySelector('.main-clock'), fit: 'scale', min: [6, 3] },
    search: { label: 'Suche',             find: () => $('searchHeader'), visible: () => $('search-form'), fit: 'width', min: [10, 2] },
    news:   { label: 'Anime-Neuigkeiten', find: () => $('nina-news-strip'),                 fit: 'width', min: [8, 3] }
  };
  // Extra blocks added with "+ Baustein" (newtab-widgets.js): id "w_…" with
  // { type, opts } in the layout; any number of them.
  const CW = () => window.NinaCustomWidgets;
  const customEls = {};
  const isCustom = (id) => !WIDGETS[id];
  function def(id) {
    if (WIDGETS[id]) return WIDGETS[id];
    const g = layout && layout.widgets[id];
    const t = g && CW() && CW().TYPES[g.type];
    return {
      label: CW() ? CW().label(g) : 'Baustein',
      find: () => customEls[id] || null,
      fit: 'fill',
      min: t ? t.min : [3, 2]
    };
  }

  // ── Styles ────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #nlay { position: fixed; inset: 0; z-index: 10; pointer-events: none; }
    body.nlay-active #main-dashboard-container { display: none !important; }
    body.nbm-open #nlay { opacity: 0; pointer-events: none !important; transition: opacity .35s ease; }
    .nlay-w { position: absolute; display: flex; align-items: center; justify-content: center; pointer-events: auto; box-sizing: border-box; }
    .nlay-w.nlay-hidden { display: none; }
    .nlay-w[data-w="search"] { z-index: 3; } /* suggestions dropdown above the other blocks */
    .nlay-w > .nlay-content { display: flex; align-items: center; justify-content: center; width: 100%; }
    .nlay-w[data-fit="scale"] > .nlay-content { width: auto; transform-origin: center center; }
    .nlay-w[data-fit="fill"] > .nlay-content { width: 100%; height: 100%; }
    .nlay-w[data-fit="width"] #searchHeader > div { max-width: none !important; }
    .nlay-w[data-fit="width"] #nina-news-strip { max-width: none !important; }
    #nlay #searchHeader, #nlay #nina-news-strip { width: 100%; }

    /* Edit mode */
    body.nlay-edit #nlay {
      background-image:
        linear-gradient(to right, rgba(6,182,212,.16) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(6,182,212,.16) 1px, transparent 1px);
      background-size: calc(100% / ${COLS}) calc(100% / ${ROWS});
    }
    body.nlay-edit .nlay-w {
      border: 2px dashed rgba(6,182,212,.55); border-radius: 18px; background: rgba(6,182,212,.04);
      cursor: move; transition: border-color .15s, background .15s;
    }
    body.nlay-edit .nlay-w:hover, body.nlay-edit .nlay-w.dragging { border-color: #06b6d4; background: rgba(6,182,212,.08); }
    body.nlay-edit .nlay-w { z-index: 5 !important; }
    body.nlay-edit .nlay-w.dragging { z-index: 6 !important; }

    /* Right-click menu */
    #nlay-menu {
      position: fixed; z-index: 2000; min-width: 230px; padding: 6px; display: none;
      background: #1e1f22; border: 1px solid rgba(255,255,255,.08); border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,.55); font: 13px/1.4 system-ui, sans-serif; color: #d4d4d8;
    }
    #nlay-menu.open { display: block; }
    #nlay-menu .nlay-mh { padding: 8px 12px 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #71717a; }
    #nlay-menu button.nlay-mi { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border: 0; border-radius: 10px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    #nlay-menu button.nlay-mi:hover { background: rgba(255,255,255,.06); color: #fff; }
    #nlay-menu .nlay-check { color: #06b6d4; font-weight: 700; }
    #nlay-menu .nlay-step { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px 6px 12px; }
    #nlay-menu .nlay-step span.v { min-width: 22px; text-align: center; color: #fff; font-weight: 700; }
    #nlay-menu .nlay-step button { width: 28px; height: 28px; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; background: none; color: #d4d4d8; cursor: pointer; font: 700 15px/1 system-ui, sans-serif; }
    #nlay-menu .nlay-step button:hover { border-color: rgba(6,182,212,.5); color: #fff; }
    #nlay-menu hr { border: 0; border-top: 1px solid rgba(255,255,255,.06); margin: 4px 6px; }
    body.nlay-edit .nlay-w.nlay-hidden { display: flex; opacity: .35; }
    .nlay-cover { display: none; position: absolute; inset: 0; z-index: 1000; border-radius: 16px; }
    body.nlay-edit .nlay-cover { display: block; }
    .nlay-tag {
      display: none; position: absolute; top: -14px; left: 14px; z-index: 1001; align-items: center; gap: 6px;
      padding: 3px 6px 3px 10px; border-radius: 999px; background: #06b6d4; color: #000;
      font: 700 11px/1.4 system-ui, sans-serif; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
    }
    body.nlay-edit .nlay-tag { display: inline-flex; }
    .nlay-tag button { width: 22px; height: 22px; border: 0; border-radius: 999px; background: rgba(0,0,0,.15); color: #000; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .nlay-tag button:hover { background: rgba(0,0,0,.3); }
    .nlay-tag svg { width: 14px; height: 14px; }
    .nlay-resize {
      display: none; position: absolute; right: -9px; bottom: -9px; z-index: 1001; width: 18px; height: 18px;
      border-radius: 6px; background: #06b6d4; cursor: nwse-resize; box-shadow: 0 0 0 3px rgba(0,0,0,.4);
    }
    body.nlay-edit .nlay-resize { display: block; }

    #nlay-bar {
      position: fixed; left: 50%; bottom: 28px; z-index: 70; transform: translateX(-50%);
      display: none; align-items: center; gap: 10px; padding: 10px 12px 10px 18px;
      background: rgba(30,31,34,.92); border: 1px solid rgba(255,255,255,.08); border-radius: 999px;
      backdrop-filter: blur(12px); box-shadow: 0 20px 50px rgba(0,0,0,.5);
      font: 13px/1.4 system-ui, sans-serif; color: #a1a1aa;
    }
    body.nlay-edit #nlay-bar { display: flex; }
    #nlay-bar { max-width: calc(100vw - 32px); flex-wrap: wrap; justify-content: center; row-gap: 8px; border-radius: 28px; }
    #nlay-bar > * { white-space: nowrap; flex: 0 0 auto; }
    #nlay-bar b { color: #fff; font-weight: 700; }
    #nlay-bar button { height: 36px; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: none; color: #d4d4d8; font: inherit; font-weight: 600; cursor: pointer; }
    #nlay-bar button:hover { color: #fff; border-color: rgba(6,182,212,.5); }
    #nlay-bar button.primary { background: #06b6d4; color: #000; border-color: transparent; }
    #nlay-bar .nlay-sep { width: 1px; height: 22px; background: rgba(255,255,255,.1); }
    #nlay-bar .nlay-chip { height: 30px; padding: 0 12px; font-size: 12px; }
    #nlay-bar .nlay-chip.off { opacity: .45; text-decoration: line-through; }
  `;
  document.head.appendChild(style);

  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17.94 17.94A10.07 10.07 0 0112 19c-7 0-11-7-11-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19"/><path d="M1 1l22 22"/></svg>';

  // ── State ─────────────────────────────────────────────────────────────
  let layout = null;          // saved: { widgets: { id: {x,y,w,h,show} } } or null = original page
  let editing = false;
  let backup = null;          // layout before editing (for "Abbrechen")
  const homes = {};           // id -> { parent, next } original DOM position
  const boxes = {};           // id -> wrapper element

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Where a block is right now, in grid cells (to start editing from the
  // current look instead of some fixed default).
  function measure(id) {
    const elx = WIDGETS[id].visible ? WIDGETS[id].visible() : WIDGETS[id].find();
    if (!elx) return null;
    const r = elx.getBoundingClientRect();
    const L = layerRect();
    const cw = L.width / COLS, ch = L.height / ROWS;
    const w = clamp(Math.round(r.width / cw), WIDGETS[id].min[0], COLS);
    const h = clamp(Math.round(r.height / ch) || 1, WIDGETS[id].min[1], ROWS);
    return { x: clamp(Math.round((r.left - L.left) / cw), 0, COLS - w), y: clamp(Math.round((r.top - L.top) / ch), 0, ROWS - h), w, h, show: true };
  }

  // Starting arrangement (first time / "Zurücksetzen"): the blocks where they
  // sit on the original page, but all with the same width, centered — the
  // original page's search bar is a bit wider than the clock.
  function defaultBuiltins() {
    const out = {};
    for (const id of Object.keys(WIDGETS)) { const m = measure(id); if (m) out[id] = m; }
    const ids = Object.keys(out);
    if (!ids.length) return out;
    const w = Math.max(...ids.map((id) => out[id].w));
    const x = Math.round((COLS - w) / 2);
    for (const id of ids) { out[id].w = w; out[id].x = x; }
    if (out.news) out.news.attach = true;
    return out;
  }

  // "attach": the news cards sit right under the search bar (same width) and
  // follow it — until you drag/resize them yourself.
  function attachNews() {
    const n = layout && layout.widgets.news, s = layout && layout.widgets.search;
    if (!n || !s || !n.attach) return;
    n.x = s.x;
    n.w = s.w;
    n.h = Math.max(n.h || 4, WIDGETS.news.min[1]);
    n.y = Math.min(s.y + s.h + 1, ROWS - n.h);
  }

  // The grid area: the whole window, or the part left of the side panel.
  function layerRect() {
    const r = ensureLayer().getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  }

  function ensureLayer() {
    let layer = $('nlay');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'nlay';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function box(id) {
    if (boxes[id]) return boxes[id];
    const w = document.createElement('div');
    w.className = 'nlay-w';
    w.dataset.w = id;
    w.dataset.fit = def(id).fit;
    const content = document.createElement('div');
    content.className = 'nlay-content';
    const cover = document.createElement('div');
    cover.className = 'nlay-cover';
    const tag = document.createElement('div');
    tag.className = 'nlay-tag';
    tag.innerHTML = '<span></span><button type="button" title="Ein-/ausblenden"></button>';
    tag.firstChild.textContent = def(id).label;
    const resize = document.createElement('div');
    resize.className = 'nlay-resize';
    resize.title = 'Größe ändern';
    w.append(content, cover, tag, resize);
    ensureLayer().appendChild(w);
    tag.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); toggleShow(id); });
    cover.addEventListener('pointerdown', (e) => startDrag(e, id, 'move'));
    resize.addEventListener('pointerdown', (e) => startDrag(e, id, 'resize'));
    boxes[id] = w;
    new ResizeObserver(() => fit(id)).observe(w);
    return w;
  }

  // Move a block into its box (remembering where it came from).
  function adopt(id) {
    if (isCustom(id)) {
      if (!CW()) return false;
      const b = box(id);
      if (!customEls[id]) {
        customEls[id] = CW().create(id, layout.widgets[id]);
        b.querySelector('.nlay-content').appendChild(customEls[id]);
      }
      return true;
    }
    const elx = WIDGETS[id].find();
    if (!elx) return false;
    const b = box(id);
    const content = b.querySelector('.nlay-content');
    if (elx.parentElement !== content) {
      if (!homes[id]) homes[id] = { parent: elx.parentElement, next: elx.nextSibling };
      content.appendChild(elx);
    }
    return true;
  }

  function restoreAll() {
    for (const id of Object.keys(homes)) {
      const elx = WIDGETS[id].find();
      const h = homes[id];
      if (elx && h.parent) h.parent.insertBefore(elx, h.next && h.next.parentNode === h.parent ? h.next : null);
      delete homes[id];
    }
    for (const id of Object.keys(boxes)) { boxes[id].remove(); delete boxes[id]; delete customEls[id]; }
    const layer = $('nlay');
    if (layer) layer.remove();
    document.body.classList.remove('nlay-active');
  }

  function place(id) {
    if (id === 'news' || id === 'search') attachNews();
    if (id === 'search' && boxes.news && layout.widgets.news && layout.widgets.news.attach) place('news');
    const g = layout.widgets[id];
    const b = boxes[id];
    if (!g || !b) return;
    b.style.left = (g.x / COLS * 100) + '%';
    b.style.top = (g.y / ROWS * 100) + '%';
    b.style.width = (g.w / COLS * 100) + '%';
    b.style.height = (g.h / ROWS * 100) + '%';
    b.classList.toggle('nlay-hidden', g.show === false);
    const btn = b.querySelector('.nlay-tag button');
    btn.innerHTML = g.show === false ? EYE_OFF : EYE;
    b.querySelector('.nlay-tag span').textContent = def(id).label;
    fit(id);
  }

  // Clock: scale to the box. Others: full width.
  function fit(id) {
    const b = boxes[id];
    if (!b || def(id).fit !== 'scale') return;
    const content = b.querySelector('.nlay-content');
    content.style.transform = 'none';
    const w = content.offsetWidth, h = content.offsetHeight;
    if (!w || !h) return;
    const s = Math.min(b.clientWidth / w, b.clientHeight / h, 4);
    content.style.transform = 'scale(' + Math.max(0.2, s).toFixed(3) + ')';
  }

  function migrate(l) {
    if (!l || l.cols === COLS) return l;
    const f = COLS / (l.cols || 24);
    for (const id of Object.keys(l.widgets || {})) {
      const g = l.widgets[id];
      g.x = Math.round(g.x * f); g.y = Math.round(g.y * f); g.w = Math.round(g.w * f); g.h = Math.round(g.h * f);
    }
    l.cols = COLS;
    return l;
  }

  function apply() {
    if (!layout) { restoreAll(); return; }
    document.body.classList.add('nlay-active');
    for (const id of Object.keys(boxes)) {
      if (!layout.widgets[id] && isCustom(id)) { boxes[id].remove(); delete boxes[id]; delete customEls[id]; }
    }
    for (const id of Object.keys(layout.widgets)) {
      if (adopt(id)) place(id);
    }
  }

  // The news strip appears later (after AniList answered): adopt it then.
  new MutationObserver(() => {
    if (!layout) return;
    const s = WIDGETS.news.find();
    if (s && !layout.widgets.news && layout.widgets.search) {
      layout.widgets.news = { x: 0, y: 0, w: 8, h: 4, show: true, attach: true };
    }
    if (!layout.widgets.news) return;
    if (s && (!boxes.news || s.parentElement !== boxes.news.querySelector('.nlay-content'))) { adopt('news'); place('news'); }
  }).observe(document.body, { childList: true, subtree: true });

  // ── Edit mode ─────────────────────────────────────────────────────────
  function startEdit() {
    if (editing) return;
    backup = layout ? JSON.parse(JSON.stringify(layout)) : null;
    if (!layout) {
      layout = { v: 1, cols: COLS, widgets: {} };
      Object.assign(layout.widgets, defaultBuiltins());
    }
    // Blocks that exist but aren't in the layout yet (e.g. news appeared later).
    for (const id of Object.keys(WIDGETS)) {
      if (!layout.widgets[id]) { const m = measure(id); if (m) layout.widgets[id] = id === 'news' ? { ...m, attach: true } : m; }
    }
    editing = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.classList.add('nlay-edit');
    apply();
    renderBar();
  }

  function finishEdit(save) {
    editing = false;
    document.body.classList.remove('nlay-edit');
    if (save) {
      chrome.storage.sync.set({ [KEY]: layout });
    } else {
      const before = backup ? backup.widgets : {};
      for (const [k, g] of Object.entries(layout ? layout.widgets : {})) if (isCustom(k) && !before[k] && CW()) CW().removeData(k, g);
      layout = backup;
      apply();
    }
    for (const id of Object.keys(boxes)) fit(id);
    changed();
  }

  function resetLayout() {
    // Put everything back into the original page, measure where it sits
    // there, and continue arranging from that. Saved only with "Fertig".
    const customs = {};
    for (const [k, g] of Object.entries(layout ? layout.widgets : {})) if (isCustom(k)) customs[k] = g;
    restoreAll();
    document.body.classList.remove('nlay-edit');
    requestAnimationFrame(() => {
      layout = { v: 1, cols: COLS, widgets: { ...customs } };
      Object.assign(layout.widgets, defaultBuiltins());
      document.body.classList.add('nlay-edit');
      apply();
      renderBar();
    });
  }

  function toggleShow(id) {
    const g = layout.widgets[id];
    g.show = g.show === false;
    place(id);
    renderBar();
  }

  function renderBar() {
    let bar = $('nlay-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nlay-bar';
      document.body.appendChild(bar);
    }
    bar.textContent = '';
    const txt = document.createElement('span');
    txt.innerHTML = '<b>Startseite anordnen</b> · ziehen, Ecke für Größe';
    bar.appendChild(txt);
    const sep = () => { const s = document.createElement('span'); s.className = 'nlay-sep'; bar.appendChild(s); };
    sep();
    for (const id of Object.keys(layout.widgets)) {
      const chip = document.createElement('button');
      chip.className = 'nlay-chip' + (layout.widgets[id].show === false ? ' off' : '');
      chip.textContent = def(id).label;
      chip.title = 'Ein-/ausblenden';
      chip.addEventListener('click', () => toggleShow(id));
      bar.appendChild(chip);
    }
    sep();
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(ev); }); bar.appendChild(b); };
    mk('+ Baustein', '', (ev) => openAddMenu(ev));
    mk('Zurücksetzen', '', resetLayout);
    mk('Abbrechen', '', () => finishEdit(false));
    mk('Fertig', 'primary', () => finishEdit(true));
    changed();
  }
  const changed = () => document.dispatchEvent(new CustomEvent('nlay-change'));

  function startDrag(e, id, kind) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const g = layout.widgets[id];
    if (id === 'news') g.attach = false;
    const start = { x: e.clientX, y: e.clientY, g: { ...g } };
    const L = layerRect();
    const cw = L.width / COLS, ch = L.height / ROWS;
    const b = boxes[id];
    b.classList.add('dragging');
    const min = def(id).min;
    const move = (ev) => {
      const dx = Math.round((ev.clientX - start.x) / cw), dy = Math.round((ev.clientY - start.y) / ch);
      if (kind === 'move') {
        g.x = clamp(start.g.x + dx, 0, COLS - g.w);
        g.y = clamp(start.g.y + dy, 0, ROWS - g.h);
      } else {
        g.w = clamp(start.g.w + dx, min[0], COLS - g.x);
        g.h = clamp(start.g.h + dy, min[1], ROWS - g.y);
      }
      place(id);
    };
    const up = () => {
      b.classList.remove('dragging');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  addEventListener('keydown', (e) => { if (editing && e.key === 'Escape') finishEdit(false); });
  addEventListener('resize', () => { for (const id of Object.keys(boxes)) fit(id); });

  // ── Right-click menu on a block ───────────────────────────────────────
  // Uhr: Sekunden an/aus. Neuigkeiten: wie viele Karten, in wie vielen
  // Spalten (nina_news_strip, read by newtab-anime.js). Every block:
  // ausblenden, anordnen. Right-clicking into the search field keeps the
  // browser's own menu (copy/paste).
  const NEWS_KEY = 'nina_news_strip';
  function widgetAt(target) {
    for (const id of Object.keys(boxes)) if (isCustom(id) && boxes[id].contains(target)) return id;
    for (const id of Object.keys(WIDGETS)) {
      const elx = WIDGETS[id].find();
      if (elx && elx.contains(target)) return id;
      if (boxes[id] && boxes[id].contains(target)) return id;
    }
    return null;
  }

  function openAddMenu(ev) {
    let menu = $('nlay-menu');
    if (!menu) { openContextMenu({ clientX: 0, clientY: 0 }, 'clock'); menu = $('nlay-menu'); }
    menu.textContent = '';
    const h = document.createElement('div'); h.className = 'nlay-mh'; h.textContent = 'Baustein hinzufügen'; menu.appendChild(h);
    const add = (label, type, preset) => {
      const b = document.createElement('button');
      b.className = 'nlay-mi';
      b.textContent = label;
      b.addEventListener('click', () => { menu.classList.remove('open'); addWidget(type, preset); });
      menu.appendChild(b);
    };
    add('Schnellzugriff – eigene Links', 'links', 'custom');
    add('Meistbesuchte Seiten', 'links', 'top');
    add('Zuletzt besuchte Seiten', 'links', 'recent');
    add('Eigenes HTML', 'html');
    menu.classList.add('open');
    const r = ev.currentTarget.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, r.top - menu.offsetHeight - 8) + 'px';
  }

  function addWidget(type, preset) {
    if (!CW()) return;
    const n = CW().newWidget(type, preset);
    const id = 'w_' + Math.random().toString(36).slice(2, 8);
    // the free spot closest to the middle (centered if nothing is free)
    const cx = (COLS - n.w) / 2, cy = (ROWS - n.h) / 2;
    const free = (xx, yy) => !Object.values(layout.widgets).some((g) => g.show !== false &&
      xx < g.x + g.w && xx + n.w > g.x && yy < g.y + g.h && yy + n.h > g.y);
    let x = Math.round(cx), y = Math.round(cy), best = Infinity;
    for (let yy = 0; yy <= ROWS - n.h; yy++) {
      for (let xx = 0; xx <= COLS - n.w; xx++) {
        const d = (xx - cx) ** 2 + (yy - cy) ** 2;
        if (d < best && free(xx, yy)) { best = d; x = xx; y = yy; }
      }
    }
    layout.widgets[id] = { x, y, w: n.w, h: n.h, show: true, type: n.type, opts: n.opts };
    apply();
    renderBar();
  }

  function removeWidget(id) {
    if (CW()) CW().removeData(id, layout.widgets[id]);
    delete layout.widgets[id];
    apply();
    if (editing) renderBar(); else chrome.storage.sync.set({ [KEY]: layout });
  }

  function ensureLayoutFor(id) {
    if (!layout) {
      layout = { v: 1, cols: COLS, widgets: {} };
      Object.assign(layout.widgets, defaultBuiltins());
    }
    if (!layout.widgets[id]) { const m = measure(id); if (m) layout.widgets[id] = m; }
  }

  function hideWidget(id) {
    ensureLayoutFor(id);
    if (!layout.widgets[id]) return;
    layout.widgets[id].show = false;
    apply();
    if (editing) renderBar(); else chrome.storage.sync.set({ [KEY]: layout });
  }

  async function openContextMenu(e, id) {
    let menu = $('nlay-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'nlay-menu';
      document.body.appendChild(menu);
      document.addEventListener('mousedown', (ev) => { if (!menu.contains(ev.target)) menu.classList.remove('open'); }, true);
      addEventListener('keydown', (ev) => { if (ev.key === 'Escape') menu.classList.remove('open'); });
    }
    menu.textContent = '';
    const head = (txt) => { const h = document.createElement('div'); h.className = 'nlay-mh'; h.textContent = txt; menu.appendChild(h); };
    const item = (label, run, right) => {
      const b = document.createElement('button');
      b.className = 'nlay-mi';
      b.innerHTML = '<span></span>' + (right ? '<span class="nlay-check">' + right + '</span>' : '');
      b.firstChild.textContent = label;
      b.addEventListener('click', () => { menu.classList.remove('open'); run(); });
      menu.appendChild(b);
    };
    const stepper = (label, value, min, max, onChange) => {
      const row = document.createElement('div');
      row.className = 'nlay-step';
      const l = document.createElement('span'); l.textContent = label;
      const ctr = document.createElement('div'); ctr.style.cssText = 'display:flex;align-items:center;gap:8px';
      const minus = document.createElement('button'); minus.textContent = '−';
      const v = document.createElement('span'); v.className = 'v'; v.textContent = value;
      const plus = document.createElement('button'); plus.textContent = '+';
      const set = (n) => { value = Math.max(min, Math.min(max, n)); v.textContent = value; onChange(value); };
      minus.addEventListener('click', () => set(value - 1));
      plus.addEventListener('click', () => set(value + 1));
      ctr.append(minus, v, plus);
      row.append(l, ctr);
      menu.appendChild(row);
    };
    const hr = () => menu.appendChild(document.createElement('hr'));

    head(def(id).label);
    if (id === 'clock') {
      const toggle = $('seconds-toggle');
      const on = !toggle || toggle.checked;
      item('Sekunden anzeigen', () => {
        if (!toggle) return;
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => fit('clock'), 50);
      }, on ? '✓' : '');
    }
    if (id === 'news') {
      const s = (await new Promise((r) => chrome.storage.sync.get([NEWS_KEY], r)))[NEWS_KEY] || {};
      let count = s.count || 3, cols = s.cols || 3;
      const save = () => chrome.storage.sync.set({ [NEWS_KEY]: { count, cols } });
      stepper('Anzahl Karten', count, 1, 12, (n) => { count = n; save(); });
      stepper('Spalten (nebeneinander)', cols, 1, 6, (n) => { cols = n; save(); });
      item('Neuigkeiten-Leiste öffnen', () => { const b = $('nina-news-btn'); if (b) b.click(); });
    }
    if (isCustom(id) && CW()) {
      CW().fillMenu(id, layout.widgets[id], {
        item, stepper, hr,
        changed: () => { place(id); if (editing) renderBar(); else chrome.storage.sync.set({ [KEY]: layout }); }
      });
    }
    hr();
    item('Ausblenden', () => hideWidget(id));
    if (isCustom(id)) item('Baustein löschen', () => removeWidget(id));
    if (!editing) item('Startseite anpassen …', () => (window.NinaStudio ? window.NinaStudio.open() : startEdit()));

    menu.classList.add('open');
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(e.clientX, innerWidth - w - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - h - 8)) + 'px';
  }

  document.addEventListener('contextmenu', (e) => {
    if (window.__ninaBookmarksOpen) return;
    const id = widgetAt(e.target);
    if (!id) return;
    // keep the browser menu (paste …) inside the search field, unless arranging
    if (!editing && e.target.closest && e.target.closest('input, textarea')) return;
    e.preventDefault();
    openContextMenu(e, id);
  });

  // ── Menu entry in the settings drawer ─────────────────────────────────
  function addMenuEntry() {
    const menu = $('settings-main-menu');
    if (!menu || $('menu-layout-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'menu-layout-btn';
    btn.className = 'flex items-center justify-between w-full bg-[#0b0c0e] border border-zinc-800/60 hover:border-cyan-500/40 p-4 rounded-xl text-left transition-all group cursor-pointer';
    btn.innerHTML = `
      <div class="flex items-center gap-3 w-full">
        <div class="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h5v7H4V5zm10-1h5a1 1 0 011 1v4h-6V4zM4 15h6v5H5a1 1 0 01-1-1v-4zm10-2h6v6a1 1 0 01-1 1h-5v-7z"/></svg>
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-white font-semibold text-sm truncate">Startseite anpassen</div>
          <div class="text-zinc-500 text-xs truncate">Aussehen, Anordnung &amp; Bausteine – mit Live-Vorschau</div>
        </div>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-zinc-500 group-hover:text-white transition-colors shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>`;
    btn.addEventListener('click', () => {
      const close = $('close-settings-x');
      if (close) close.click();
      setTimeout(() => (window.NinaStudio ? window.NinaStudio.open() : startEdit()), 300);
    });
    menu.insertBefore(btn, menu.firstChild);
  }

  window.NinaLayout = {
    COLS, ROWS,
    get layout() { return layout; },
    get editing() { return editing; },
    label: (id) => def(id).label,
    isCustom,
    startEdit, finishEdit, resetLayout, toggleShow, removeWidget, openAddMenu,
    refit: () => { for (const id of Object.keys(boxes)) fit(id); }
  };

  // ── Start ─────────────────────────────────────────────────────────────
  function init() {
    addMenuEntry();
    chrome.storage.sync.get([KEY], (r) => {
      layout = r[KEY] && r[KEY].widgets ? migrate(r[KEY]) : null;
      apply();
    });
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'sync' || !c[KEY] || editing) return;
      layout = c[KEY].newValue && c[KEY].newValue.widgets ? migrate(c[KEY].newValue) : null;
      apply();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
