// newtab-widgets.js — extra blocks for the arrangeable new tab page
// (newtab-layout.js adds/places them; this file renders them and provides
// their right-click options):
//  • "links": quick-access buttons with favicon — your own list, the most
//    visited sites (chrome.topSites) or recently visited ones (history);
//    count, columns and labels adjustable. Any number of them.
//  • "html": your own HTML/CSS/JS, rendered in ui/widget-sandbox.html (a
//    sandboxed page, no access to NINA or Chrome). The code is kept in
//    chrome.storage.local (too large for synced storage), so it stays on this
//    device; position/size sync like everything else.

(function () {
  'use strict';

  const HTML_KEY = 'nina_widget_html'; // local: { widgetId: html }
  const favicon = (url) => 'chrome-extension://' + chrome.runtime.id + '/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=32';
  const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return u; } };

  const style = document.createElement('style');
  style.textContent = `
    .nwg { width: 100%; height: 100%; box-sizing: border-box; }
    .nwg-links { display: grid; gap: 10px; align-content: center; height: 100%; }
    .nwg-link {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-width: 0;
      padding: 12px 8px; border-radius: 20px; text-decoration: none; color: #d4d4d8;
      background: rgba(30,31,34,.75); border: 1px solid rgba(255,255,255,.08);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 12px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.05);
      transition: transform .25s cubic-bezier(0.16,1,0.3,1), border-color .25s, box-shadow .25s, background .25s;
    }
    .nwg-link:hover { transform: translateY(-2px); border-color: rgba(6,182,212,.4); background: rgba(37,39,42,.85); box-shadow: 0 0 24px rgba(6,182,212,.18), 0 12px 30px rgba(0,0,0,.35); }
    .nwg-link .nwg-ico { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.06); flex: 0 0 auto; }
    .nwg-link img { width: 22px; height: 22px; }
    .nwg-link span { max-width: 100%; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nwg-links.nolabels .nwg-link span { display: none; }
    .nwg-links.nolabels .nwg-link { padding: 10px; }
    .nwg-empty { display: flex; align-items: center; justify-content: center; height: 100%; padding: 12px; box-sizing: border-box; text-align: center; color: #71717a; font-size: 13px; border: 1px dashed rgba(255,255,255,.12); border-radius: 18px; }
    .nwg-html { position: relative; border-radius: 20px; overflow: hidden; }
    .nwg-html.glass { background: rgba(30,31,34,.75); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(12px); box-shadow: 0 20px 40px rgba(0,0,0,.3); }
    .nwg-html iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; }

    /* dialog */
    #nwg-dialog { position: fixed; inset: 0; z-index: 3000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.55); backdrop-filter: blur(6px); }
    #nwg-dialog.open { display: flex; }
    .nwg-dlg { width: min(640px, calc(100vw - 32px)); padding: 24px; border-radius: 28px; background: #1e1f22; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 30px 80px rgba(0,0,0,.6); font: 14px/1.5 system-ui, sans-serif; color: #d4d4d8; }
    .nwg-dlg h4 { margin: 0 0 6px; font-size: 18px; color: #fff; }
    .nwg-dlg p { margin: 0 0 12px; font-size: 12px; color: #71717a; }
    .nwg-dlg textarea { width: 100%; box-sizing: border-box; min-height: 220px; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.35); color: #f4f4f5; font: 13px/1.5 ui-monospace, Consolas, monospace; outline: none; resize: vertical; }
    .nwg-dlg textarea:focus { border-color: rgba(6,182,212,.5); }
    .nwg-dlg-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
    .nwg-dlg-btns button { height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: none; color: #d4d4d8; font: inherit; font-weight: 600; cursor: pointer; }
    .nwg-dlg-btns button.primary { background: #06b6d4; border-color: transparent; color: #000; }

    /* links editor */
    .nwg-le-list { display: flex; flex-direction: column; gap: 8px; max-height: min(46vh, 420px); overflow-y: auto; padding: 2px; }
    .nwg-le-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 4px; border-radius: 16px; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.06); transition: border-color .15s, opacity .15s; }
    .nwg-le-row:focus-within { border-color: rgba(6,182,212,.45); }
    .nwg-le-row.dragging { opacity: .45; }
    .nwg-le-handle { width: 18px; text-align: center; color: #52525b; cursor: grab; user-select: none; letter-spacing: -3px; font-size: 13px; }
    .nwg-le-handle:hover { color: #a1a1aa; }
    .nwg-le-ico { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 10px; background: rgba(255,255,255,.06); display: flex; align-items: center; justify-content: center; }
    .nwg-le-ico img { width: 18px; height: 18px; }
    .nwg-le-row input { min-width: 0; height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid transparent; background: rgba(255,255,255,.04); color: #f4f4f5; font: 13px/1 system-ui, sans-serif; outline: none; }
    .nwg-le-row input:focus { background: rgba(255,255,255,.07); border-color: rgba(6,182,212,.35); }
    .nwg-le-row input::placeholder { color: #71717a; }
    .nwg-le-name { flex: 2; }
    .nwg-le-url { flex: 3; }
    .nwg-le-del { width: 32px; height: 32px; flex: 0 0 auto; border: 0; border-radius: 999px; background: none; color: #71717a; font-size: 18px; cursor: pointer; }
    .nwg-le-del:hover { background: rgba(239,68,68,.14); color: #f87171; }
    .nwg-le-empty { padding: 18px; text-align: center; color: #71717a; font-size: 13px; border: 1px dashed rgba(255,255,255,.12); border-radius: 16px; }
    .nwg-le-add { margin-top: 10px; height: 38px; width: 100%; border-radius: 14px; border: 1px dashed rgba(6,182,212,.45); background: none; color: #22d3ee; font: 600 13px system-ui, sans-serif; cursor: pointer; }
    .nwg-le-add:hover { background: rgba(6,182,212,.08); }
    .nwg-le-sugg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 14px; }
    .nwg-le-sugg:empty { display: none; }
    .nwg-le-sugg-label { font-size: 12px; color: #71717a; margin-right: 2px; }
    .nwg-le-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 180px; height: 30px; padding: 0 10px 0 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); color: #d4d4d8; font: 12px system-ui, sans-serif; cursor: pointer; }
    .nwg-le-chip:hover { border-color: rgba(6,182,212,.45); color: #fff; }
    .nwg-le-chip img { width: 14px; height: 14px; }
    .nwg-le-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `;
  document.head.appendChild(style);

  const TYPES = {
    links: { label: 'Schnellzugriff', min: [4, 3] },
    html: { label: 'Eigenes HTML', min: [3, 2] }
  };
  const SOURCES = { custom: 'Eigene Links', top: 'Meistbesucht', recent: 'Zuletzt besucht' };

  function newWidget(type, preset) {
    if (type === 'links') {
      return { type, w: 16, h: 5, opts: { source: preset || 'custom', links: [], count: 8, cols: 4, labels: true } };
    }
    return { type: 'html', w: 12, h: 8, opts: { glass: true } };
  }

  function label(g) {
    if (!g) return 'Baustein';
    if (g.type === 'links') return (g.opts && g.opts.source && g.opts.source !== 'custom' ? SOURCES[g.opts.source] : TYPES.links.label);
    return TYPES[g.type] ? TYPES[g.type].label : 'Baustein';
  }

  // ── Links ─────────────────────────────────────────────────────────────
  function linksFor(opts) {
    const n = opts.count || 8;
    const ok = (u) => /^https?:/i.test(u || '');
    if (opts.source === 'top') {
      return new Promise((r) => (chrome.topSites ? chrome.topSites.get((s) => r((s || []).filter((x) => ok(x.url)).slice(0, n).map((x) => ({ name: x.title || domainOf(x.url), url: x.url })))) : r([])));
    }
    if (opts.source === 'recent') {
      return new Promise((r) => {
        if (!chrome.history) return r([]);
        chrome.history.search({ text: '', maxResults: 200 }, (items) => {
          const seen = new Set(), out = [];
          for (const it of items || []) {
            if (!ok(it.url)) continue;
            const host = domainOf(it.url);
            if (seen.has(host)) continue; // one per site
            seen.add(host);
            out.push({ name: it.title || host, url: it.url });
            if (out.length >= n) break;
          }
          r(out);
        });
      });
    }
    return Promise.resolve((opts.links || []).slice(0, n));
  }

  async function renderLinks(el, g) {
    const o = g.opts;
    const list = await linksFor(o);
    el.textContent = '';
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'nwg-empty';
      e.textContent = o.source === 'custom' ? 'Rechtsklick → „Links bearbeiten …“ um Seiten hinzuzufügen' : 'Noch keine Seiten im Verlauf.';
      el.appendChild(e);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'nwg-links' + (o.labels === false ? ' nolabels' : '');
    grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(o.cols || 4, list.length)) + ', minmax(0, 1fr))';
    for (const l of list) {
      const a = document.createElement('a');
      a.className = 'nwg-link';
      a.href = l.url;
      a.title = l.name + '\n' + l.url;
      const ico = document.createElement('div');
      ico.className = 'nwg-ico';
      const img = document.createElement('img');
      img.src = favicon(l.url);
      img.alt = '';
      ico.appendChild(img);
      const s = document.createElement('span');
      s.textContent = l.name || domainOf(l.url);
      a.append(ico, s);
      grid.appendChild(a);
    }
    el.appendChild(grid);
  }

  // ── HTML ──────────────────────────────────────────────────────────────
  const getHtml = (id) => new Promise((r) => chrome.storage.local.get([HTML_KEY], (res) => r(((res[HTML_KEY] || {})[id]) || '')));
  const setHtml = (id, html) => new Promise((r) => chrome.storage.local.get([HTML_KEY], (res) => {
    const m = res[HTML_KEY] || {};
    if (html == null) delete m[id]; else m[id] = html;
    chrome.storage.local.set({ [HTML_KEY]: m }, r);
  }));

  async function renderHtml(el, g, id) {
    el.textContent = '';
    el.classList.toggle('glass', g.opts.glass !== false);
    const html = await getHtml(id);
    if (!html) {
      const e = document.createElement('div');
      e.className = 'nwg-empty';
      e.textContent = 'Rechtsklick → „HTML bearbeiten …“ und Code einfügen';
      el.appendChild(e);
      return;
    }
    const f = document.createElement('iframe');
    f.src = chrome.runtime.getURL('ui/widget-sandbox.html');
    f.addEventListener('load', () => f.contentWindow.postMessage({ ninaWidgetHtml: html }, '*'));
    el.appendChild(f);
  }

  // ── Public ────────────────────────────────────────────────────────────
  function create(id, g) {
    const el = document.createElement('div');
    el.className = 'nwg nwg-' + g.type;
    el.dataset.nwg = id;
    render(id, g, el);
    return el;
  }
  function render(id, g, el) {
    if (g.type === 'links') renderLinks(el, g);
    else if (g.type === 'html') renderHtml(el, g, id);
  }

  const el = (tag, props, kids) => {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const k of kids || []) n.append(k);
    return n;
  };

  // Modal shell: title, hint, any body; onSave() returning false keeps it open.
  function openDialog(title, hint, body, onSave, focusEl) {
    let d = document.getElementById('nwg-dialog');
    if (!d) { d = document.createElement('div'); d.id = 'nwg-dialog'; document.body.appendChild(d); }
    d.textContent = '';
    const box = el('div', { className: 'nwg-dlg' });
    const cancel = el('button', { textContent: 'Abbrechen' });
    const save = el('button', { textContent: 'Speichern', className: 'primary' });
    const close = () => d.classList.remove('open');
    cancel.addEventListener('click', close);
    save.addEventListener('click', () => { if (onSave() !== false) close(); });
    d.onmousedown = (e) => { if (e.target === d) close(); };
    // keep typing away from the new tab's own shortcuts
    for (const t of ['keydown', 'keyup', 'keypress']) box.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Escape') close(); });
    box.append(el('h4', { textContent: title }), el('p', { textContent: hint }), body, el('div', { className: 'nwg-dlg-btns' }, [cancel, save]));
    d.appendChild(box);
    d.classList.add('open');
    if (focusEl) setTimeout(() => focusEl.focus(), 30);
  }

  function dialog(title, hint, value, onSave) {
    const ta = el('textarea', { value, spellcheck: false });
    openDialog(title, hint, ta, () => onSave(ta.value), ta);
  }

  const normUrl = (u) => {
    u = (u || '').trim();
    if (u && !/^[a-z][\w+.-]*:/i.test(u)) u = 'https://' + u;
    return u;
  };

  // Links editor: one row per link (icon, name, address), drag to reorder,
  // + to add, quick-add from the most visited sites.
  function linksDialog(links, onSave) {
    const list = el('div', { className: 'nwg-le-list' });
    let dragRow = null;

    function addRow(l, focus) {
      const ico = el('img', { alt: '' });
      const setIco = () => {
        const u = normUrl(url.value);
        ico.style.visibility = /^https?:\/\/[^/\s]+\.[^/\s]/i.test(u) ? '' : 'hidden';
        if (ico.style.visibility === '') ico.src = favicon(u);
      };
      const handle = el('span', { className: 'nwg-le-handle', title: 'Ziehen zum Sortieren', textContent: '⋮⋮' });
      const name = el('input', { className: 'nwg-le-name', placeholder: 'Name (optional)', value: l.name || '', spellcheck: false });
      const url = el('input', { className: 'nwg-le-url', placeholder: 'Adresse, z. B. youtube.com', value: l.url || '', spellcheck: false });
      const del = el('button', { className: 'nwg-le-del', title: 'Entfernen', textContent: '×' });
      const row = el('div', { className: 'nwg-le-row' }, [handle, el('span', { className: 'nwg-le-ico' }, [ico]), name, url, del]);
      setIco();
      url.addEventListener('input', () => {
        setIco();
        name.placeholder = url.value.trim() ? domainOf(normUrl(url.value)) : 'Name (optional)';
      });
      if (url.value) name.placeholder = domainOf(normUrl(url.value));
      url.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = row.nextElementSibling;
        if (next) next.querySelector('.nwg-le-url').focus(); else addRow({}, true);
      });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); url.focus(); } });
      del.addEventListener('click', () => { row.remove(); paintEmpty(); });

      // drag only from the handle
      handle.addEventListener('mousedown', () => { row.draggable = true; });
      row.addEventListener('dragstart', (e) => { dragRow = row; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => { row.draggable = false; row.classList.remove('dragging'); dragRow = null; });

      list.appendChild(row);
      paintEmpty();
      if (focus) { url.focus(); row.scrollIntoView({ block: 'nearest' }); }
    }

    list.addEventListener('dragover', (e) => {
      if (!dragRow) return;
      e.preventDefault();
      const after = [...list.querySelectorAll('.nwg-le-row:not(.dragging)')]
        .find((r) => e.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      if (after) list.insertBefore(dragRow, after); else list.appendChild(dragRow);
    });

    const empty = el('div', { className: 'nwg-le-empty', textContent: 'Noch keine Links – unten hinzufügen.' });
    function paintEmpty() { empty.style.display = list.querySelector('.nwg-le-row') ? 'none' : ''; }

    const add = el('button', { className: 'nwg-le-add', textContent: '+ Link hinzufügen' });
    add.addEventListener('click', () => addRow({}, true));

    // quick add: most visited sites not in the list yet
    const sugg = el('div', { className: 'nwg-le-sugg' });
    if (chrome.topSites) {
      chrome.topSites.get((sites) => {
        const have = () => new Set([...list.querySelectorAll('.nwg-le-url')].map((i) => domainOf(normUrl(i.value))));
        const items = (sites || []).filter((s) => /^https?:/i.test(s.url)).slice(0, 12);
        if (!items.length) return;
        sugg.append(el('span', { className: 'nwg-le-sugg-label', textContent: 'Schnell hinzufügen:' }));
        for (const s of items) {
          const chip = el('button', { className: 'nwg-le-chip', title: s.url }, [
            el('img', { src: favicon(s.url), alt: '' }),
            el('span', { textContent: s.title || domainOf(s.url) })
          ]);
          chip.addEventListener('click', () => {
            if (!have().has(domainOf(s.url))) addRow({ name: s.title || '', url: s.url });
            chip.remove();
          });
          sugg.append(chip);
        }
      });
    }

    (links.length ? links : [{}]).forEach((l) => addRow(l));
    const body = el('div', { className: 'nwg-le' }, [list, empty, add, sugg]);
    openDialog('Links bearbeiten', 'Name und Adresse pro Link. An ⋮⋮ ziehen zum Sortieren, Enter springt zur nächsten Zeile.', body, () => {
      onSave([...list.querySelectorAll('.nwg-le-row')].map((r) => ({
        name: r.querySelector('.nwg-le-name').value.trim(),
        url: normUrl(r.querySelector('.nwg-le-url').value)
      })).filter((l) => l.url));
    }, list.querySelector('.nwg-le-url'));
  }

  // Right-click entries for a custom block. api: { item, stepper, hr, changed() }
  function fillMenu(id, g, api) {
    const rerender = () => { const el = document.querySelector('[data-nwg="' + id + '"]'); if (el) render(id, g, el); };
    const changed = () => { api.changed(); rerender(); };
    if (g.type === 'links') {
      // The kind (own links / most visited / recent) is fixed by which block
      // was added under "+ Baustein" — they're separate blocks on purpose.
      if (g.opts.source === 'custom') {
        api.item('Links bearbeiten …', () => linksDialog(g.opts.links || [], (links) => {
          g.opts.links = links;
          if ((g.opts.count || 0) < links.length) g.opts.count = links.length;
          changed();
        }));
        api.hr();
      }
      api.stepper('Anzahl', g.opts.count || 8, 1, 30, (n) => { g.opts.count = n; changed(); });
      api.stepper('Spalten', g.opts.cols || 4, 1, 10, (n) => { g.opts.cols = n; changed(); });
      api.item('Beschriftung anzeigen', () => { g.opts.labels = g.opts.labels === false; changed(); }, g.opts.labels !== false ? '✓' : '');
    } else if (g.type === 'html') {
      api.item('HTML bearbeiten …', async () => {
        const cur = await getHtml(id);
        dialog('Eigenes HTML', 'HTML, CSS und JavaScript (inline). Läuft abgeschottet ohne Zugriff auf NINA oder Chrome. Externe Skripte werden nicht geladen, Bilder/Schriften schon.',
          cur, async (val) => { await setHtml(id, val); rerender(); });
      });
      api.item('Glas-Hintergrund', () => { g.opts.glass = g.opts.glass === false; changed(); }, g.opts.glass !== false ? '✓' : '');
    }
  }

  function removeData(id, g) { if (g && g.type === 'html') setHtml(id, null); }

  window.NinaCustomWidgets = { TYPES, SOURCES, newWidget, label, create, render, fillMenu, removeData };
})();
