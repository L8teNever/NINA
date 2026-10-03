// nina-select.js — replaces the look of native <select> dropdowns (whose
// open list Windows draws in its own style) with a NINA-styled menu.
// The real <select> stays in the page, hidden: other scripts keep reading
// .value and listening for "change" as before, and setting .value or adding
// options from code updates the button.
//
// Usage: NinaSelect.auto(root, selector) enhances matching selects now and
// whenever new ones appear; NinaSelect.enhance(select) does a single one.

(function () {
  'use strict';
  if (window.NinaSelect) return;

  const style = document.createElement('style');
  style.textContent = `
    select.ns-native { display: none !important; }
    .ns-btn {
      display: inline-flex !important; align-items: center; justify-content: space-between; gap: 10px;
      cursor: pointer; text-align: left; font: inherit; line-height: 1.3;
    }
    .ns-btn:disabled { opacity: .5; cursor: default; }
    .ns-btn .ns-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ns-btn .ns-chev { flex: 0 0 auto; width: 16px; height: 16px; opacity: .6; transition: transform .2s ease; }
    .ns-btn[aria-expanded="true"] .ns-chev { transform: rotate(180deg); opacity: 1; }

    .ns-menu {
      position: fixed; z-index: 2147483000; box-sizing: border-box;
      padding: 6px; border-radius: 16px; overflow-y: auto; overscroll-behavior: contain;
      font: 500 13px/1.3 system-ui, "Segoe UI", sans-serif;
      background: #ffffff; color: #1f2937;
      border: 1px solid rgba(0,0,0,.08);
      box-shadow: 0 18px 50px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
      opacity: 0; transform: translateY(-4px) scale(.98); transform-origin: top center;
      transition: opacity .14s ease, transform .14s ease;
    }
    .ns-menu.up { transform-origin: bottom center; }
    .ns-menu.open { opacity: 1; transform: none; }
    .ns-menu.dark {
      background: #1e1f22; color: #e4e4e7;
      border-color: rgba(255,255,255,.08);
      box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.2);
    }
    .ns-menu::-webkit-scrollbar { width: 6px; }
    .ns-menu::-webkit-scrollbar-thumb { background: rgba(127,127,127,.35); border-radius: 6px; }
    .ns-menu::-webkit-scrollbar-track { background: transparent; margin: 10px 0; }
    .ns-opt {
      display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 0; border-radius: 10px; background: none; color: inherit;
      font: inherit; text-align: left; cursor: pointer;
    }
    .ns-opt span { flex: 1; min-width: 0; }
    .ns-opt .ns-check { flex: 0 0 auto; width: 16px; height: 16px; color: #0891b2; visibility: hidden; }
    .ns-menu.dark .ns-opt .ns-check { color: #22d3ee; }
    .ns-opt.sel { font-weight: 650; }
    .ns-opt.sel .ns-check { visibility: visible; }
    .ns-opt.act { background: rgba(8,145,178,.10); }
    .ns-menu.dark .ns-opt.act { background: rgba(34,211,238,.12); }
    .ns-opt:disabled { opacity: .45; cursor: default; }
    .ns-group { padding: 8px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; opacity: .55; }
  `;
  (document.head || document.documentElement).appendChild(style);

  const SVG = 'http://www.w3.org/2000/svg';
  function icon(cls, d) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2.4');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('class', cls);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }

  // dark menu when the button shows light text
  function looksDark(el) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(el).color);
    return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) > 140 : true;
  }

  let open = null; // { sel, btn, menu, items, active }

  function close() {
    if (!open) return;
    const { btn, menu } = open;
    open = null;
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    setTimeout(() => menu.remove(), 150);
    removeEventListener('mousedown', onOutside, true);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', close);
    removeEventListener('scroll', onScroll, true);
  }
  function onOutside(e) {
    if (open && !open.menu.contains(e.target) && !open.btn.contains(e.target)) close();
  }
  function onScroll(e) {
    if (open && !open.menu.contains(e.target)) close();
  }
  function setActive(i) {
    if (!open) return;
    const items = open.items;
    if (!items.length) return;
    i = (i + items.length) % items.length;
    items.forEach((b, j) => b.classList.toggle('act', j === i));
    open.active = i;
    items[i].scrollIntoView({ block: 'nearest' });
  }
  function onKey(e) {
    if (!open) return;
    const k = e.key;
    if (k === 'Escape' || k === 'Tab') { if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); } const b = open.btn; close(); if (k === 'Escape') b.focus(); return; }
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setActive(open.active + (k === 'ArrowDown' ? 1 : -1)); return; }
    if (k === 'Home' || k === 'End') { e.preventDefault(); setActive(k === 'Home' ? 0 : open.items.length - 1); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); const b = open.items[open.active]; if (b) b.click(); return; }
    // jump by first letter
    if (k.length === 1 && /\S/.test(k)) {
      const n = open.items.length;
      for (let s = 1; s <= n; s++) {
        const j = (open.active + s) % n;
        if (open.items[j].textContent.trim().toLowerCase().startsWith(k.toLowerCase())) { setActive(j); break; }
      }
    }
  }

  function choose(sel, value) {
    if (sel.value !== value) {
      sel.value = value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function openMenu(sel, btn) {
    if (open && open.sel === sel) return close();
    close();
    const menu = document.createElement('div');
    menu.className = 'ns-menu' + (looksDark(btn) ? ' dark' : '');
    menu.setAttribute('role', 'listbox');
    const items = [];
    let active = 0;
    for (const node of sel.children) {
      const opts = node.tagName === 'OPTGROUP' ? [...node.children] : [node];
      if (node.tagName === 'OPTGROUP') {
        const g = document.createElement('div');
        g.className = 'ns-group';
        g.textContent = node.label;
        menu.appendChild(g);
      }
      for (const o of opts) {
        if (o.tagName !== 'OPTION' || o.hidden) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ns-opt' + (o.selected ? ' sel' : '');
        b.disabled = o.disabled;
        b.setAttribute('role', 'option');
        const t = document.createElement('span');
        t.textContent = o.textContent;
        b.append(t, icon('ns-check', 'M5 12.5l4.5 4.5L19 7.5'));
        b.addEventListener('click', () => { choose(sel, o.value); const bb = btn; close(); bb.focus(); });
        b.addEventListener('mousemove', () => setActive(items.indexOf(b)));
        if (!o.disabled) { if (o.selected) active = items.length; items.push(b); }
        menu.appendChild(b);
      }
    }
    document.body.appendChild(menu);

    // below the button, or above when there's no room
    const r = btn.getBoundingClientRect();
    const gap = 6, pad = 12;
    menu.style.minWidth = r.width + 'px';
    menu.style.maxWidth = Math.max(r.width, Math.min(420, innerWidth - 2 * pad)) + 'px';
    const below = innerHeight - r.bottom - gap - pad, above = r.top - gap - pad;
    const h = menu.scrollHeight;
    const up = h > below && above > below;
    menu.style.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
    if (up) { menu.classList.add('up'); menu.style.bottom = (innerHeight - r.top + gap) + 'px'; }
    else menu.style.top = (r.bottom + gap) + 'px';
    const w = menu.offsetWidth;
    menu.style.left = Math.max(pad, Math.min(r.left, innerWidth - w - pad)) + 'px';

    btn.setAttribute('aria-expanded', 'true');
    open = { sel, btn, menu, items, active };
    setActive(active);
    requestAnimationFrame(() => menu.classList.add('open'));
    addEventListener('mousedown', onOutside, true);
    addEventListener('keydown', onKey, true);
    addEventListener('resize', close);
    addEventListener('scroll', onScroll, true);
  }

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function enhance(sel) {
    if (!sel || sel.dataset.nsDone || sel.multiple || sel.size > 1) return;
    sel.dataset.nsDone = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = (sel.className ? sel.className + ' ' : '') + 'ns-btn';
    btn.style.cssText = sel.style.cssText;
    if (sel.id) btn.dataset.nsFor = sel.id;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (sel.title) btn.title = sel.title;
    const label = document.createElement('span');
    label.className = 'ns-label';
    btn.append(label, icon('ns-chev', 'M6 9l6 6 6-6'));

    const paint = () => {
      const o = sel.options[sel.selectedIndex];
      label.textContent = o ? o.textContent : '';
      btn.disabled = sel.disabled;
    };
    sel.classList.add('ns-native');
    sel.after(btn);
    paint();

    // value / selectedIndex set from code → update the button
    Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); paint(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); paint(); } });
    sel.addEventListener('change', paint);
    new MutationObserver(paint).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });

    btn.addEventListener('click', () => openMenu(sel, btn));
    btn.addEventListener('keydown', (e) => {
      if (open) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(sel, btn);
      }
    });
  }

  function auto(root, selector) {
    root = root || document;
    selector = selector || 'select';
    const scan = (n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(selector)) enhance(n);
      n.querySelectorAll(selector).forEach(enhance);
    };
    scan(root.nodeType === 9 ? root.documentElement : root);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) scan(n);
    }).observe(root, { childList: true, subtree: true });
  }

  window.NinaSelect = { enhance, auto, close };

  // <script src="nina-select.js" data-auto="select.foo"> enhances by itself
  // (extension pages allow no inline script to call auto()).
  const me = document.currentScript;
  if (me && me.dataset.auto) {
    const go = () => auto(document, me.dataset.auto);
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
})();
