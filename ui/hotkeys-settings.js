// hotkeys-settings.js — the "Tastenkürzel" section of the options page:
// built-in shortcuts (NINA panel, search overlay), the Chrome-managed
// shortcut for the real toolbar popup (display + link only) and the user's
// own shortcuts that open a web page or a note. Every action can have any
// number of keys/combos. Saved to chrome.storage.sync "nina_hotkeys"
// (format: lib/hotkeys-shared.js), applied by content/hotkeys.js.

(function () {
  'use strict';

  const H = self.NinaHotkeys;
  const $ = (id) => document.getElementById(id);
  if (!H || !$('cat-hotkeys')) return;

  let cfg = H.normalize(null);
  let notes = [];
  let saveTimer = null;
  let stopRecording = null;

  function save(now) {
    clearTimeout(saveTimer);
    const run = () => {
      const clean = (list) => [...new Set(list.filter(Boolean))];
      chrome.storage.sync.set({
        [H.KEY]: {
          search: { ...cfg.search, combos: clean(cfg.search.combos) },
          popup: { ...cfg.popup, combos: clean(cfg.popup.combos) },
          custom: cfg.custom.map((c) => ({ ...c, combos: clean(c.combos) }))
        }
      });
    };
    if (now) run(); else saveTimer = setTimeout(run, 400);
  }

  // owner = 'search' | 'popup' | 'custom:<id>' → its combo list (live array)
  function listOf(owner) {
    if (owner === 'search') return cfg.search.combos;
    if (owner === 'popup') return cfg.popup.combos;
    const c = cfg.custom.find((x) => 'custom:' + x.id === owner);
    return c ? c.combos : null;
  }
  function ownerActive(owner) {
    if (owner === 'search') return cfg.search.enabled;
    if (owner === 'popup') return cfg.popup.enabled;
    return true;
  }

  // ---- combo chips ----
  function counts() {
    const n = {};
    for (const owner of ['search', 'popup', ...cfg.custom.map((c) => 'custom:' + c.id)]) {
      if (!ownerActive(owner)) continue;
      for (const k of new Set(listOf(owner))) if (k) n[k] = (n[k] || 0) + 1;
    }
    return n;
  }

  function renderCombos(box) {
    const owner = box.dataset.hkOwner;
    const list = listOf(owner);
    if (!list) return;
    const n = counts();
    box.textContent = '';
    list.forEach((combo, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'hk-rec';
      chip.dataset.hk = owner + '#' + i;
      if (!combo) {
        chip.classList.add('empty');
        chip.textContent = 'Taste(n) drücken …';
      } else {
        chip.classList.toggle('dup', ownerActive(owner) && n[combo] > 1);
        chip.title = 'Klicken zum Ändern';
        chip.append(H.label(combo));
        const x = document.createElement('span');
        x.className = 'hk-x';
        x.textContent = '×';
        x.title = 'Entfernen';
        chip.append(x);
      }
      box.append(chip);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'hk-addkey';
    add.dataset.hkAdd = owner;
    add.textContent = list.length ? '+' : '+ Taste festlegen';
    add.title = 'Weitere Taste oder Kombination hinzufügen';
    box.append(add);
  }

  function renderAllCombos() {
    document.querySelectorAll('#cat-hotkeys .hk-combos[data-hk-owner]').forEach(renderCombos);
    const n = counts();
    const dups = Object.keys(n).filter((k) => n[k] > 1).map(H.label);
    $('hk-hint').textContent = dups.length
      ? 'Doppelt belegt: ' + dups.join(', ') + ' – es gilt nur die erste Belegung (Suche vor NINA-Fenster vor eigenen Kürzeln).'
      : '';
  }

  function chipFor(owner, i) {
    return document.querySelector('#cat-hotkeys .hk-rec[data-hk="' + CSS.escape(owner + '#' + i) + '"]');
  }

  function record(owner, i) {
    if (stopRecording) stopRecording();
    const list = listOf(owner);
    const chip = chipFor(owner, i);
    if (!list || !chip) return;
    chip.classList.add('recording');
    chip.classList.remove('dup');
    chip.textContent = 'Taste(n) drücken … (Esc = abbrechen)';

    const plain = (e) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && plain(e)) return done(false);
      const combo = H.fromEvent(e);
      if (!combo) return; // only a modifier so far
      list[i] = combo;
      done(true);
    };
    const onDown = (e) => { if (e.target !== chip) done(false); };
    function done(changed) {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      stopRecording = null;
      if (!list[i]) list.splice(i, 1); // cancelled a new, still empty one
      if (changed) {
        // same combo twice on one action: keep one
        const seen = new Set();
        for (let j = list.length - 1; j >= 0; j--) {
          if (seen.has(list[j])) list.splice(j, 1); else seen.add(list[j]);
        }
      }
      save(true);
      renderAllCombos();
    }
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    stopRecording = () => done(false);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('#cat-hotkeys')) return;
    const add = t.closest('.hk-addkey');
    if (add) {
      if (stopRecording) stopRecording();
      const owner = add.dataset.hkAdd;
      const list = listOf(owner);
      if (!list) return;
      list.push('');
      renderAllCombos();
      record(owner, list.length - 1);
      return;
    }
    const chip = t.closest('.hk-rec');
    if (!chip || chip.classList.contains('recording')) return;
    const [owner, idx] = chip.dataset.hk.split('#');
    const i = Number(idx);
    if (t.classList.contains('hk-x')) {
      if (stopRecording) stopRecording();
      const list = listOf(owner);
      if (list) list.splice(i, 1);
      save(true);
      renderAllCombos();
      return;
    }
    record(owner, i);
  });

  // ---- own shortcuts ----
  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const c of children || []) n.append(c);
    return n;
  }

  function renderCustom() {
    const list = $('hk-custom-list');
    list.textContent = '';
    for (const c of cfg.custom) {
      const combos = el('div', { className: 'hk-combos hk-item-combos' });
      combos.dataset.hkOwner = 'custom:' + c.id;

      const type = el('select', { className: 'opt-select' }, [
        el('option', { value: 'url', textContent: 'Webseite öffnen' }),
        el('option', { value: 'note', textContent: 'Notiz öffnen' })
      ]);
      type.value = c.type === 'note' ? 'note' : 'url';
      type.addEventListener('change', () => { c.type = type.value; save(true); renderCustom(); });

      const row = [type];
      if (type.value === 'url') {
        const url = el('input', { type: 'text', className: 'opt-input hk-target', placeholder: 'z. B. youtube.com oder https://…', value: c.url || '' });
        url.addEventListener('input', () => { c.url = url.value.trim(); save(); });
        const where = el('select', { className: 'opt-select' }, [
          el('option', { value: 'new', textContent: 'Neuer Tab' }),
          el('option', { value: 'same', textContent: 'Gleicher Tab' })
        ]);
        where.value = c.newTab === false ? 'same' : 'new';
        where.addEventListener('change', () => { c.newTab = where.value === 'new'; save(true); });
        row.push(url, where);
      } else {
        const note = el('select', { className: 'opt-select hk-target' }, [
          el('option', { value: '', textContent: 'Notizen-Übersicht' }),
          ...notes.map((n) => el('option', { value: n.id, textContent: n.title || 'Ohne Titel' }))
        ]);
        if (c.noteId && !notes.some((n) => n.id === c.noteId)) {
          note.append(el('option', { value: c.noteId, textContent: '(gelöschte Notiz)' }));
        }
        note.value = c.noteId || '';
        note.addEventListener('change', () => { c.noteId = note.value || null; save(true); });
        row.push(note);
      }

      const del = el('button', { type: 'button', className: 'hk-del', title: 'Kürzel löschen', textContent: '×' });
      del.addEventListener('click', () => {
        if (stopRecording) stopRecording();
        cfg.custom = cfg.custom.filter((x) => x !== c);
        save(true);
        renderCustom();
      });
      row.push(del);
      list.append(el('div', { className: 'hk-item' }, [combos, el('div', { className: 'hk-item-row' }, row)]));
    }
    renderAllCombos();
  }

  $('hk-add').addEventListener('click', () => {
    if (stopRecording) stopRecording();
    const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), enabled: true, combos: [''], type: 'url', url: '', newTab: true, noteId: null };
    cfg.custom.push(c);
    renderCustom();
    record('custom:' + c.id, 0);
  });

  // ---- built-in switches ----
  $('hk-search-on').addEventListener('change', (e) => { cfg.search.enabled = e.target.checked; save(true); renderAllCombos(); });
  $('hk-popup-on').addEventListener('change', (e) => { cfg.popup.enabled = e.target.checked; save(true); renderAllCombos(); });

  // ---- Chrome's own shortcut for the toolbar popup (read-only here) ----
  $('hk-chrome-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  function showChromeShortcut() {
    if (!chrome.commands || !chrome.commands.getAll) return;
    chrome.commands.getAll((cmds) => {
      const cmd = (cmds || []).find((c) => c.name === '_execute_action');
      const box = $('hk-chrome-current');
      const sc = cmd && cmd.shortcut;
      box.textContent = sc ? sc.split('+').join(' + ') : 'Nicht festgelegt';
      box.classList.toggle('empty', !sc);
    });
  }
  showChromeShortcut();
  window.addEventListener('focus', showChromeShortcut);

  function render() {
    $('hk-search-on').checked = cfg.search.enabled;
    $('hk-popup-on').checked = cfg.popup.enabled;
    renderCustom();
  }

  H.load((c) => {
    cfg = c;
    chrome.storage.local.get(['nina_notes'], (r) => {
      notes = Array.isArray(r && r.nina_notes) ? r.nina_notes.filter((n) => n && n.id) : [];
      render();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    // changed elsewhere (another options tab, settings sync from another PC)
    if (area !== 'sync' || !changes[H.KEY] || stopRecording) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#cat-hotkeys')) return;
    cfg = H.normalize(changes[H.KEY].newValue);
    render();
  });
})();
