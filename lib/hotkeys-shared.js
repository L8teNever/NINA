// hotkeys-shared.js — key combos for NINA's keyboard shortcuts, shared by
// content/hotkeys.js, the options page and the popup.
//
// A combo is stored as "Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>" (only the
// pressed modifiers, always in that order), e.g. "Ctrl+Space", "Alt+KeyN".
// KeyboardEvent.code is the physical key, so Shift doesn't change it.
// Settings live in chrome.storage.sync under "nina_hotkeys":
//   { search: { enabled, combos: [...] },
//     popup:  { enabled, combos: [...] },      // NINA panel shown in the page
//     custom: [{ id, enabled, combos: [...], type: 'url'|'note', url, newTab, noteId }] }
// Every action can have any number of combos. (Older versions stored a
// single "combo" for popup/custom entries; normalize() converts that.)

(function () {
  'use strict';
  if (self.NinaHotkeys) return;

  const KEY = 'nina_hotkeys';
  const DEFAULTS = {
    search: { enabled: true, combos: ['Ctrl+Space', 'Shift+Space'] },
    popup: { enabled: true, combos: ['Alt+KeyN'] },
    custom: []
  };
  const MOD_CODE = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$|^AltGraph$/;

  function fromEvent(e) {
    const code = e.code;
    if (!code || code === 'Unidentified' || MOD_CODE.test(code)) return null;
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(code);
    return parts.join('+');
  }

  // labels for a German keyboard (QWERTZ)
  const MOD_LABEL = { Ctrl: 'Strg', Alt: 'Alt', Shift: 'Umschalt', Meta: 'Win' };
  const CODE_LABEL = {
    Space: 'Leertaste', Enter: 'Enter', Escape: 'Esc', Backspace: 'Rücktaste', Tab: 'Tab',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild ↑', PageDown: 'Bild ↓',
    Minus: 'ß', Equal: '´', BracketLeft: 'Ü', BracketRight: '+', Semicolon: 'Ö', Quote: 'Ä',
    Backslash: '#', Comma: ',', Period: '.', Slash: '-', Backquote: '^', IntlBackslash: '<'
  };
  function keyLabel(code) {
    if (CODE_LABEL[code]) return CODE_LABEL[code];
    let m = /^Key([A-Z])$/.exec(code);
    if (m) return m[1];
    m = /^Digit(\d)$/.exec(code);
    if (m) return m[1];
    m = /^Numpad(.+)$/.exec(code);
    if (m) return 'Num ' + m[1];
    return code;
  }
  function label(combo) {
    if (!combo) return '';
    return combo.split('+').map((p) => MOD_LABEL[p] || keyLabel(p)).join(' + ');
  }

  // Combos with Strg/Alt/Win also work while typing in a text field; plain
  // keys and Umschalt+key don't (they'd swallow normal typing).
  function hasStrongModifier(combo) {
    return /(^|\+)(Ctrl|Alt|Meta)\+/.test(combo || '');
  }

  // combos of one action: the "combos" list, else an old single "combo"
  function comboList(o, def) {
    let list = def;
    if (Array.isArray(o.combos)) list = o.combos;
    else if (typeof o.combo === 'string') list = [o.combo];
    return [...new Set(list.filter((c) => typeof c === 'string' && c))];
  }

  function normalize(v) {
    v = v && typeof v === 'object' ? v : {};
    const s = v.search || {}, p = v.popup || {};
    return {
      search: { enabled: s.enabled !== false, combos: comboList(s, DEFAULTS.search.combos) },
      popup: { enabled: p.enabled !== false, combos: comboList(p, DEFAULTS.popup.combos) },
      custom: (Array.isArray(v.custom) ? v.custom : [])
        .filter((c) => c && typeof c === 'object')
        .map((c) => {
          const out = { ...c, combos: comboList(c, []) };
          delete out.combo;
          return out;
        })
    };
  }

  function load(cb) {
    try {
      chrome.storage.sync.get([KEY], (r) => cb(normalize(r && r[KEY])));
    } catch (_) {
      cb(normalize(null));
    }
  }

  self.NinaHotkeys = { KEY, DEFAULTS, fromEvent, label, hasStrongModifier, normalize, load };
})();
