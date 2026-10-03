// hotkeys.js — NINA's own keyboard shortcuts on web pages and the new tab:
// open the search overlay, open the toolbar popup, open a page or a note.
// Combos and actions come from the "Tastenkürzel" settings (nina_hotkeys,
// see lib/hotkeys-shared.js). Runs in every frame; the search overlay only
// lives in the top frame, so iframes ask the background to toggle it there.

(function () {
  'use strict';
  if (window.__ninaHotkeysLoaded || !self.NinaHotkeys) return;
  window.__ninaHotkeysLoaded = true;

  const H = self.NinaHotkeys;
  const isTop = window === window.top;
  let actions = new Map(); // combo -> action

  function build(cfg) {
    const m = new Map();
    const add = (combo, action) => { if (combo && !m.has(combo)) m.set(combo, action); };
    if (cfg.search.enabled) cfg.search.combos.forEach((c) => add(c, { type: 'search' }));
    if (cfg.popup.enabled) cfg.popup.combos.forEach((c) => add(c, { type: 'popup' }));
    for (const c of cfg.custom) {
      if (c.enabled === false) continue;
      let action = null;
      if (c.type === 'note') action = { type: 'note', noteId: c.noteId || null };
      else if (c.url) action = { type: 'url', url: c.url, newTab: c.newTab !== false };
      if (action) c.combos.forEach((k) => add(k, action));
    }
    actions = m;
  }

  H.load(build);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[H.KEY]) build(H.normalize(changes[H.KEY].newValue));
    });
  } catch (_) {}

  function editable(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return !/^(button|checkbox|radio|range|submit|reset|color|file|image)$/i.test(t.type || '');
    return false;
  }

  function send(msg) {
    try { chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError); } catch (_) {}
  }

  function run(a) {
    if (a.type === 'search') {
      const ntInput = location.protocol === 'chrome-extension:' && document.querySelector('#search-form input');
      if (ntInput) ntInput.focus(); // new tab: its own search box
      else if (isTop && typeof toggleSearchOverlay === 'function') toggleSearchOverlay();
      else send({ type: 'NINA_HOTKEY_SEARCH' });
    } else if (a.type === 'popup') {
      if (isTop) togglePanel();
      else send({ type: 'NINA_HOTKEY_PANEL' });
    } else if (a.type === 'note') {
      send({ type: 'NINA_OPEN_NOTES_TAB', noteId: a.noteId });
    } else if (a.type === 'url') {
      send({ type: 'NINA_HOTKEY_OPEN_URL', url: a.url, newTab: a.newTab });
    }
  }

  // ---- NINA panel: the toolbar popup (ui/popup.html) shown in the page ----
  // A small rounded window top right instead of Chrome's popup bubble. It's
  // an iframe of the extension page, so popup.js works unchanged; it talks
  // back via postMessage (close, content height).
  let panel = null;

  function closePanel() {
    if (!panel) return;
    const { host, onMsg, onDown, onKey } = panel;
    panel = null;
    window.removeEventListener('message', onMsg);
    document.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    host.style.opacity = '0';
    host.style.transform = 'translateY(-6px) scale(.98)';
    setTimeout(() => host.remove(), 160);
  }

  function togglePanel() {
    if (panel) return closePanel();
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;' +
      'opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;' +
      'transition:opacity .16s ease,transform .16s ease;';
    const root = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('ui/popup.html');
    frame.style.cssText = 'display:block;width:340px;height:380px;border:0;border-radius:24px;' +
      'background:#111214;color-scheme:dark;box-shadow:0 12px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06);';
    root.append(frame);

    // a fullscreen player hides everything outside it
    const fs = document.fullscreenElement;
    (fs && fs.tagName !== 'VIDEO' ? fs : (document.body || document.documentElement)).appendChild(host);
    requestAnimationFrame(() => { host.style.opacity = '1'; host.style.transform = 'none'; });

    const onMsg = (e) => {
      if (!panel || e.source !== frame.contentWindow || !e.data) return;
      if (e.data.__ninaPanel === 'close') closePanel();
      else if (e.data.__ninaPanel === 'height' && e.data.h > 0) frame.style.height = Math.min(e.data.h, innerHeight - 24) + 'px';
    };
    // clicks inside the iframe don't reach this document: any click here is outside
    const onDown = () => closePanel();
    const onKey = (e) => { if (e.key === 'Escape') closePanel(); };
    window.addEventListener('message', onMsg);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    frame.addEventListener('load', () => { try { frame.focus(); } catch (_) {} });
    panel = { host, onMsg, onDown, onKey };
  }

  if (isTop) {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'NINA_TOGGLE_PANEL') togglePanel();
      });
    } catch (_) {}
  }

  // capture phase on window: runs before the page's own handlers
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.isComposing || !actions.size) return;
    const combo = H.fromEvent(e);
    const action = combo && actions.get(combo);
    if (!action) return;
    if (!H.hasStrongModifier(combo) && editable(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    run(action);
  }, true);
})();
