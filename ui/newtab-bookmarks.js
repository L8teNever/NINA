// newtab-bookmarks.js — the bookmarks view of the new tab page (button with
// the bookmark icon, top right). Shows Chrome's bookmarks:
//  • folder tree on the left (Lesezeichenleiste, Weitere, Mobil …),
//  • the open folder as tiles or as a list, with path/breadcrumbs,
//  • search over all bookmarks,
//  • per item: open, open in new tab, rename/edit, move, delete,
//  • new bookmark / new folder in the open folder.
// Updates live when bookmarks change anywhere in Chrome. Last folder and
// view (tiles/list) are remembered.

(function () {
  'use strict';

  if (!chrome.bookmarks) return;

  const LS_FOLDER = 'ninaBmFolder';
  const LS_MODE = 'ninaBmMode';
  const $ = (id) => document.getElementById(id);
  const ls = {
    get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }
  };

  // ── Styles ────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #nbm-view {
      position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
      padding: 88px 24px 32px; pointer-events: none;
    }
    #nbm-view.open { pointer-events: auto; }
    #nbm-card {
      width: min(1180px, 100%); height: min(78vh, 820px); display: flex; overflow: hidden;
      background: rgba(30, 31, 34, .78); border: 1px solid rgba(255, 255, 255, .08); border-radius: 32px;
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 30px 80px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 255, 255, .05);
      opacity: 0; transform: translateY(24px) scale(.98);
      transition: opacity .45s cubic-bezier(0.16, 1, 0.3, 1), transform .45s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #nbm-view.open #nbm-card { opacity: 1; transform: none; }
    #main-dashboard-container { transition: opacity .35s ease, transform .5s cubic-bezier(0.16, 1, 0.3, 1) !important; }
    body.nbm-open #main-dashboard-container { opacity: 0 !important; pointer-events: none; }
    body.nbm-open #nina-news-strip { opacity: 0; pointer-events: none; }

    /* Sidebar */
    #nbm-side { width: 260px; flex: 0 0 auto; display: flex; flex-direction: column; padding: 22px 12px 16px; border-right: 1px solid rgba(255,255,255,.06); background: rgba(0,0,0,.12); }
    .nbm-side-title { padding: 0 12px 12px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #71717a; }
    #nbm-tree { flex: 1; overflow-y: auto; padding-right: 4px; }
    .nbm-node { display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 10px; border: 0; border-radius: 12px; background: none; color: #a1a1aa; font: inherit; font-size: 13px; text-align: left; cursor: pointer; white-space: nowrap; }
    .nbm-node:hover { background: rgba(255,255,255,.05); color: #f4f4f5; }
    .nbm-node.active { background: rgba(6,182,212,.12); color: #fff; }
    .nbm-node .nbm-caret { width: 16px; flex: 0 0 auto; color: #52525b; transition: transform .2s; display: inline-flex; justify-content: center; }
    .nbm-node .nbm-caret.open { transform: rotate(90deg); }
    .nbm-node .nbm-caret.empty { visibility: hidden; }
    .nbm-node svg.nbm-fi { width: 16px; height: 16px; flex: 0 0 auto; color: #71717a; }
    .nbm-node.active svg.nbm-fi { color: var(--accent-color, #06b6d4); }
    .nbm-node span.nbm-nt { overflow: hidden; text-overflow: ellipsis; }

    /* Main */
    #nbm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    #nbm-top { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,.06); }
    #nbm-crumbs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; font-size: 15px; }
    .nbm-crumb { background: none; border: 0; padding: 4px 6px; border-radius: 8px; color: #a1a1aa; font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; }
    .nbm-crumb:hover { color: #fff; background: rgba(255,255,255,.05); }
    .nbm-crumb.last { color: #fff; font-weight: 700; cursor: default; background: none; }
    .nbm-sep { color: #52525b; }
    .nbm-search { position: relative; width: 260px; }
    .nbm-search input { width: 100%; box-sizing: border-box; height: 38px; padding: 0 14px 0 36px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.25); color: #f4f4f5; font: inherit; font-size: 13px; outline: none; transition: border-color .2s, box-shadow .2s; }
    .nbm-search input:focus { border-color: rgba(6,182,212,.5); box-shadow: 0 0 20px rgba(6,182,212,.15); }
    .nbm-search svg { position: absolute; left: 12px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); color: #71717a; pointer-events: none; }
    .nbm-seg { display: flex; padding: 3px; border-radius: 999px; background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.06); }
    .nbm-seg button { width: 34px; height: 30px; border: 0; border-radius: 999px; background: none; color: #71717a; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .nbm-seg button.on { background: rgba(6,182,212,.18); color: #fff; }
    .nbm-seg svg { width: 16px; height: 16px; }
    .nbm-icon-btn { height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.25); color: #d4d4d8; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .nbm-icon-btn:hover { border-color: rgba(6,182,212,.5); color: #fff; }
    .nbm-close { width: 38px; padding: 0; justify-content: center; font-size: 20px; }

    #nbm-content { flex: 1; overflow-y: auto; padding: 20px 22px 28px; }
    .nbm-section { margin: 4px 2px 12px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #71717a; }
    .nbm-section + .nbm-grid, .nbm-section + .nbm-list { margin-bottom: 22px; }
    .nbm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
    .nbm-list { display: flex; flex-direction: column; gap: 2px; }

    .nbm-item { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 18px; color: inherit; text-decoration: none; cursor: pointer; border: 1px solid rgba(255,255,255,.05); background: rgba(255,255,255,.025); transition: background .2s, border-color .2s, transform .2s; min-width: 0; }
    .nbm-item:hover { background: rgba(255,255,255,.06); border-color: rgba(6,182,212,.35); transform: translateY(-1px); }
    .nbm-grid .nbm-item { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; min-height: 92px; }
    .nbm-list .nbm-item { border-color: transparent; background: none; padding: 8px 12px; }
    .nbm-list .nbm-item:hover { transform: none; background: rgba(255,255,255,.05); border-color: transparent; }
    .nbm-ico { width: 34px; height: 34px; flex: 0 0 auto; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.06); }
    .nbm-list .nbm-ico { width: 28px; height: 28px; border-radius: 8px; }
    .nbm-ico img { width: 18px; height: 18px; }
    .nbm-ico svg { width: 18px; height: 18px; color: var(--accent-color, #06b6d4); }
    .nbm-txt { min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 2px; }
    .nbm-name { font-size: 13px; font-weight: 600; color: #f4f4f5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nbm-grid .nbm-name { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .nbm-sub { font-size: 11px; color: #71717a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nbm-more { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; border-radius: 999px; background: rgba(0,0,0,.35); color: #a1a1aa; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity .15s; }
    .nbm-list .nbm-more { position: static; margin-left: auto; background: none; }
    .nbm-item:hover .nbm-more, .nbm-more:focus { opacity: 1; }
    .nbm-more:hover { color: #fff; background: rgba(255,255,255,.12); }
    .nbm-more svg { width: 16px; height: 16px; }
    .nbm-empty { padding: 60px 20px; text-align: center; color: #71717a; font-size: 14px; }

    /* Context menu */
    #nbm-menu { position: fixed; z-index: 70; min-width: 210px; padding: 6px; border-radius: 16px; background: #1e1f22; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 20px 50px rgba(0,0,0,.55); display: none; }
    #nbm-menu.open { display: block; }
    #nbm-menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-radius: 10px; background: none; color: #d4d4d8; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
    #nbm-menu button:hover { background: rgba(255,255,255,.06); color: #fff; }
    #nbm-menu button.danger:hover { background: rgba(239,68,68,.15); color: #fca5a5; }
    #nbm-menu hr { border: 0; border-top: 1px solid rgba(255,255,255,.06); margin: 4px 6px; }

    /* Dialog */
    #nbm-dialog { position: fixed; inset: 0; z-index: 80; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.5); backdrop-filter: blur(6px); }
    #nbm-dialog.open { display: flex; }
    .nbm-dlg { width: min(420px, calc(100vw - 32px)); padding: 24px; border-radius: 28px; background: #1e1f22; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 30px 80px rgba(0,0,0,.6); }
    .nbm-dlg h4 { margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #fff; }
    .nbm-dlg label { display: block; margin: 12px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #71717a; }
    .nbm-dlg input, .nbm-dlg select { width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.3); color: #f4f4f5; font: inherit; font-size: 14px; outline: none; }
    .nbm-dlg input:focus, .nbm-dlg select:focus { border-color: rgba(6,182,212,.5); }
    .nbm-dlg select option { background: #1e1f22; }
    .nbm-dlg p { margin: 0; color: #a1a1aa; font-size: 14px; line-height: 1.5; }
    .nbm-dlg-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
    .nbm-dlg-btns button { height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: none; color: #d4d4d8; font: inherit; font-weight: 600; cursor: pointer; }
    .nbm-dlg-btns button.primary { background: var(--accent-color, #06b6d4); border-color: transparent; color: #000; }
    .nbm-dlg-btns button.danger { background: #ef4444; border-color: transparent; color: #fff; }

    @media (max-width: 760px) { #nbm-side { display: none; } .nbm-search { width: 160px; } }
  `;
  document.head.appendChild(style);

  const ICON = {
    folder: '<svg class="nbm-fi" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    caret: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
  };

  const favicon = (url) => 'chrome-extension://' + chrome.runtime.id + '/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=32';
  const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // ── State ─────────────────────────────────────────────────────────────
  let root = null;            // chrome.bookmarks tree root
  const byId = new Map();     // id -> node
  const parentOf = new Map(); // id -> parent id
  let folderId = ls.get(LS_FOLDER, '1');
  let mode = ls.get(LS_MODE, 'grid');
  let query = '';
  const expanded = new Set(['1', '2']);
  let isOpen = false;

  function index(node, parent) {
    byId.set(node.id, node);
    if (parent) parentOf.set(node.id, parent.id);
    for (const c of node.children || []) index(c, node);
  }
  function load() {
    return new Promise((resolve) => chrome.bookmarks.getTree((tree) => {
      root = tree[0];
      byId.clear(); parentOf.clear();
      index(root, null);
      if (!byId.has(folderId) || !byId.get(folderId).children) folderId = '1';
      resolve();
    }));
  }
  const folderName = (n) => n.title || (n.id === '0' ? 'Lesezeichen' : 'Ordner');
  const pathTo = (id) => { const out = []; for (let n = byId.get(id); n && n.id !== '0'; n = byId.get(parentOf.get(n.id))) out.unshift(n); return out; };

  // ── Build ─────────────────────────────────────────────────────────────
  function build() {
    const view = el('div');
    view.id = 'nbm-view';
    view.innerHTML = `
      <div id="nbm-card">
        <aside id="nbm-side"><div class="nbm-side-title">Ordner</div><div id="nbm-tree" class="custom-scrollbar"></div></aside>
        <section id="nbm-main">
          <div id="nbm-top">
            <div id="nbm-crumbs"></div>
            <div class="nbm-search">${ICON.search}<input id="nbm-q" type="text" placeholder="Lesezeichen durchsuchen …" autocomplete="off"></div>
            <div class="nbm-seg"><button id="nbm-grid" title="Kacheln">${ICON.grid}</button><button id="nbm-list" title="Liste">${ICON.list}</button></div>
            <button id="nbm-new" class="nbm-icon-btn" title="Neues Lesezeichen oder neuer Ordner">+ Neu</button>
            <button id="nbm-close" class="nbm-icon-btn nbm-close" title="Schließen (Esc)">×</button>
          </div>
          <div id="nbm-content" class="custom-scrollbar"></div>
        </section>
      </div>`;
    document.body.appendChild(view);

    const menu = el('div');
    menu.id = 'nbm-menu';
    document.body.appendChild(menu);
    const dialog = el('div');
    dialog.id = 'nbm-dialog';
    document.body.appendChild(dialog);

    view.addEventListener('mousedown', (e) => { if (e.target === view) close(); });
    $('nbm-close').addEventListener('click', close);
    $('nbm-grid').addEventListener('click', () => setMode('grid'));
    $('nbm-list').addEventListener('click', () => setMode('list'));
    $('nbm-new').addEventListener('click', (e) => openMenu(e.currentTarget, newMenu()));
    $('nbm-q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); renderContent(); });
    $('nbm-q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = $('nbm-content').querySelector('a.nbm-item'); if (first) first.click(); }
      if (e.key === 'Escape') { if (query) { e.target.value = ''; query = ''; renderContent(); e.stopPropagation(); } }
    });
    document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); }, true);
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (dialog.classList.contains('open')) { closeDialog(); return; }
        if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
        close();
        return;
      }
      // Typing anywhere goes to the bookmarks search.
      const a = document.activeElement;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) $('nbm-q').focus();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────
  function render() { renderTree(); renderCrumbs(); renderContent(); renderMode(); }

  function renderMode() {
    $('nbm-grid').classList.toggle('on', mode === 'grid');
    $('nbm-list').classList.toggle('on', mode === 'list');
  }

  function renderTree() {
    const tree = $('nbm-tree');
    tree.textContent = '';
    for (const p of pathTo(folderId)) expanded.add(p.id);
    const add = (node, depth) => {
      const subFolders = (node.children || []).filter((c) => c.children);
      const b = el('button', 'nbm-node' + (node.id === folderId && !query ? ' active' : ''));
      b.style.paddingLeft = (10 + depth * 14) + 'px';
      const caret = el('span', 'nbm-caret' + (expanded.has(node.id) ? ' open' : '') + (subFolders.length ? '' : ' empty'));
      caret.innerHTML = ICON.caret;
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id);
        renderTree();
      });
      b.append(caret);
      b.insertAdjacentHTML('beforeend', ICON.folder);
      b.append(el('span', 'nbm-nt', folderName(node)));
      b.addEventListener('click', () => openFolder(node.id));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e, itemMenu(node)); });
      tree.appendChild(b);
      if (expanded.has(node.id)) for (const c of subFolders) add(c, depth + 1);
    };
    for (const top of root.children || []) add(top, 0);
  }

  function renderCrumbs() {
    const c = $('nbm-crumbs');
    c.textContent = '';
    if (query) { c.append(el('span', 'nbm-crumb last', 'Suche: „' + $('nbm-q').value.trim() + '“')); return; }
    const path = pathTo(folderId);
    path.forEach((n, i) => {
      if (i) c.append(el('span', 'nbm-sep', '›'));
      const b = el('button', 'nbm-crumb' + (i === path.length - 1 ? ' last' : ''), folderName(n));
      if (i < path.length - 1) b.addEventListener('click', () => openFolder(n.id));
      c.append(b);
    });
  }

  function itemEl(node, showPath) {
    const isFolder = !!node.children;
    const a = el(isFolder ? 'div' : 'a', 'nbm-item');
    const ico = el('div', 'nbm-ico');
    if (isFolder) ico.innerHTML = ICON.folder;
    else { const img = el('img'); img.src = favicon(node.url); img.alt = ''; ico.appendChild(img); }
    const txt = el('div', 'nbm-txt');
    txt.append(el('span', 'nbm-name', isFolder ? folderName(node) : (node.title || domainOf(node.url))));
    let sub = isFolder ? (node.children.length + (node.children.length === 1 ? ' Eintrag' : ' Einträge')) : domainOf(node.url);
    if (showPath) sub = pathTo(parentOf.get(node.id)).map(folderName).join(' › ') + (isFolder ? '' : ' · ' + domainOf(node.url));
    txt.append(el('span', 'nbm-sub', sub));
    const more = el('button', 'nbm-more');
    more.innerHTML = ICON.more;
    more.title = 'Aktionen';
    more.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(more, itemMenu(node)); });
    a.append(ico, txt, more);
    if (isFolder) {
      a.addEventListener('click', () => openFolder(node.id));
    } else {
      a.href = node.url;
      a.title = (node.title || '') + '\n' + node.url;
    }
    a.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e, itemMenu(node)); });
    return a;
  }

  function renderContent() {
    const box = $('nbm-content');
    box.textContent = '';
    renderCrumbs();
    renderTree();
    const wrap = (items, title, showPath) => {
      if (!items.length) return;
      if (title) box.append(el('div', 'nbm-section', title));
      const g = el('div', mode === 'grid' ? 'nbm-grid' : 'nbm-list');
      for (const n of items) g.appendChild(itemEl(n, showPath));
      box.appendChild(g);
    };

    if (query) {
      const hits = [];
      for (const n of byId.values()) {
        if (n.id === '0') continue;
        const t = (n.title || '').toLowerCase();
        if (t.includes(query) || (n.url && n.url.toLowerCase().includes(query))) hits.push(n);
        if (hits.length > 300) break;
      }
      const folders = hits.filter((n) => n.children), links = hits.filter((n) => n.url);
      wrap(folders, folders.length ? 'Ordner' : '', true);
      wrap(links, folders.length && links.length ? 'Lesezeichen' : '', true);
      if (!hits.length) box.append(el('div', 'nbm-empty', 'Nichts gefunden.'));
      return;
    }

    const folder = byId.get(folderId);
    const kids = (folder && folder.children) || [];
    const folders = kids.filter((n) => n.children), links = kids.filter((n) => n.url);
    wrap(folders, folders.length && links.length ? 'Ordner' : '');
    wrap(links, folders.length && links.length ? 'Lesezeichen' : '');
    if (!kids.length) box.append(el('div', 'nbm-empty', 'Dieser Ordner ist leer. Über „+ Neu“ kannst du ein Lesezeichen oder einen Ordner anlegen.'));
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function openFolder(id) {
    folderId = id;
    ls.set(LS_FOLDER, id);
    if (query) { query = ''; $('nbm-q').value = ''; }
    expanded.add(id);
    renderContent();
    $('nbm-content').scrollTop = 0;
  }
  function setMode(m) { mode = m; ls.set(LS_MODE, m); renderMode(); renderContent(); }

  function openMenu(anchorOrEvent, entries) {
    const menu = $('nbm-menu');
    menu.textContent = '';
    for (const it of entries) {
      if (it === '-') { menu.append(el('hr')); continue; }
      const b = el('button', it.danger ? 'danger' : '', it.label);
      b.addEventListener('click', () => { menu.classList.remove('open'); it.run(); });
      menu.append(b);
    }
    menu.classList.add('open');
    let x, y;
    if (anchorOrEvent instanceof Event) { x = anchorOrEvent.clientX; y = anchorOrEvent.clientY; }
    else { const r = anchorOrEvent.getBoundingClientRect(); x = r.right - 210; y = r.bottom + 6; }
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  }

  function itemMenu(node) {
    const isFolder = !!node.children;
    const fixed = node.id === '0' || parentOf.get(node.id) === '0'; // Chrome's own top folders
    const list = [];
    if (isFolder) {
      list.push({ label: 'Öffnen', run: () => openFolder(node.id) });
      const urls = node.children.filter((c) => c.url).map((c) => c.url);
      if (urls.length) list.push({ label: 'Alle ' + urls.length + ' in neuen Tabs öffnen', run: () => urls.forEach((u) => chrome.tabs.create({ url: u, active: false })) });
    } else {
      list.push({ label: 'Öffnen', run: () => { location.href = node.url; } });
      list.push({ label: 'In neuem Tab öffnen', run: () => chrome.tabs.create({ url: node.url, active: false }) });
      list.push({ label: 'Link kopieren', run: () => navigator.clipboard.writeText(node.url).catch(() => {}) });
    }
    if (!fixed) {
      list.push('-');
      list.push({ label: isFolder ? 'Umbenennen' : 'Bearbeiten', run: () => editDialog(node) });
      list.push({ label: 'Verschieben', run: () => moveDialog(node) });
      list.push({ label: 'Löschen', danger: true, run: () => deleteDialog(node) });
    }
    return list;
  }

  function newMenu() {
    return [
      { label: 'Neues Lesezeichen', run: () => editDialog(null, false) },
      { label: 'Neuer Ordner', run: () => editDialog(null, true) }
    ];
  }

  // ── Dialogs ───────────────────────────────────────────────────────────
  function openDialog(title, bodyEls, buttons) {
    const d = $('nbm-dialog');
    d.textContent = '';
    const box = el('div', 'nbm-dlg');
    box.append(el('h4', '', title), ...bodyEls);
    const btns = el('div', 'nbm-dlg-btns');
    for (const b of buttons) {
      const x = el('button', b.cls || '', b.label);
      x.addEventListener('click', b.run);
      btns.append(x);
    }
    box.append(btns);
    d.append(box);
    d.classList.add('open');
    d.onmousedown = (e) => { if (e.target === d) closeDialog(); };
    const first = box.querySelector('input, select');
    if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = btns.querySelector('.primary, .danger'); if (p) p.click(); } });
  }
  function closeDialog() { $('nbm-dialog').classList.remove('open'); }
  const field = (label, value, ph) => { const l = el('label', '', label); const i = el('input'); i.type = 'text'; i.value = value || ''; i.placeholder = ph || ''; return [l, i]; };

  function editDialog(node, newFolder) {
    const isNew = !node;
    const isFolder = isNew ? newFolder : !!node.children;
    const [l1, name] = field('Name', node ? node.title : '', isFolder ? 'Neuer Ordner' : 'Name der Seite');
    const parts = [l1, name];
    let url = null;
    if (!isFolder) {
      const [l2, u] = field('Adresse', node ? node.url : '', 'https://…');
      url = u;
      parts.push(l2, u);
    }
    const title = isNew ? (isFolder ? 'Neuer Ordner' : 'Neues Lesezeichen') : (isFolder ? 'Ordner umbenennen' : 'Lesezeichen bearbeiten');
    openDialog(title, parts, [
      { label: 'Abbrechen', run: closeDialog },
      { label: 'Speichern', cls: 'primary', run: () => {
        const t = name.value.trim();
        let u = url ? url.value.trim() : null;
        if (url) {
          if (!u) { url.focus(); return; }
          if (!/^[a-z][\w+.-]*:/i.test(u)) u = 'https://' + u;
        }
        if (isNew) chrome.bookmarks.create({ parentId: folderId, title: t || (isFolder ? 'Neuer Ordner' : u), url: u || undefined });
        else chrome.bookmarks.update(node.id, isFolder ? { title: t } : { title: t, url: u });
        closeDialog();
      } }
    ]);
  }

  function moveDialog(node) {
    const sel = el('select');
    const add = (n, depth) => {
      if (n.id === node.id) return; // not into itself
      if (n.id !== '0') {
        const o = el('option', '', '  '.repeat(depth) + folderName(n));
        o.value = n.id;
        if (n.id === parentOf.get(node.id)) o.selected = true;
        sel.append(o);
      }
      for (const c of n.children || []) if (c.children) add(c, n.id === '0' ? 0 : depth + 1);
    };
    add(root, 0);
    openDialog('„' + (node.title || domainOf(node.url || '')) + '“ verschieben', [el('label', '', 'Zielordner'), sel], [
      { label: 'Abbrechen', run: closeDialog },
      { label: 'Verschieben', cls: 'primary', run: () => { chrome.bookmarks.move(node.id, { parentId: sel.value }); closeDialog(); } }
    ]);
  }

  function deleteDialog(node) {
    const isFolder = !!node.children;
    const count = isFolder ? countLinks(node) : 0;
    const text = isFolder
      ? 'Der Ordner „' + folderName(node) + '“' + (count ? ' und ' + count + (count === 1 ? ' Lesezeichen darin werden' : ' Lesezeichen darin werden') : ' wird') + ' aus Chrome gelöscht. Das lässt sich nicht rückgängig machen.'
      : '„' + (node.title || node.url) + '“ wird aus deinen Chrome-Lesezeichen gelöscht.';
    openDialog('Löschen?', [el('p', '', text)], [
      { label: 'Abbrechen', run: closeDialog },
      { label: 'Löschen', cls: 'danger', run: () => {
        if (isFolder) chrome.bookmarks.removeTree(node.id); else chrome.bookmarks.remove(node.id);
        closeDialog();
      } }
    ]);
  }
  function countLinks(n) { return (n.children || []).reduce((s, c) => s + (c.url ? 1 : countLinks(c)), 0); }

  // ── Open / close ──────────────────────────────────────────────────────
  async function open() {
    if (!$('nbm-view')) build();
    await load();
    render();
    isOpen = true;
    window.__ninaBookmarksOpen = true;
    document.body.classList.add('nbm-open');
    requestAnimationFrame(() => $('nbm-view').classList.add('open'));
    setTimeout(() => $('nbm-q').focus(), 120);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    window.__ninaBookmarksOpen = false;
    $('nbm-view').classList.remove('open');
    $('nbm-menu').classList.remove('open');
    closeDialog();
    document.body.classList.remove('nbm-open');
    const search = $('search-field');
    if (search) setTimeout(() => search.focus(), 50);
  }

  // Live updates from anywhere in Chrome.
  const refresh = () => { if (isOpen) load().then(render); };
  for (const ev of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    if (chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(refresh);
  }

  function init() {
    const btn = $('toggle-bookmarks-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (isOpen) close(); else open(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
