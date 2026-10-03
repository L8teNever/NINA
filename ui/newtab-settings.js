// newtab-settings.js — new tab options on the options page that otherwise
// only exist as right-click menus on the new tab itself: number/columns of
// the anime news cards (nina_news_strip), which blocks are shown and the
// layout reset (nina_newtab_layout, written by ui/newtab-layout.js).

(function () {
  'use strict';

  const NEWS_KEY = 'nina_news_strip';
  const LAYOUT_KEY = 'nina_newtab_layout';
  const $ = (id) => document.getElementById(id);
  if (!$('nt-blocks')) return;

  const BUILTIN = { clock: 'Uhr', search: 'Suche', news: 'Anime-Neuigkeiten' };
  const SOURCES = { custom: 'Schnellzugriff', top: 'Meistbesucht', recent: 'Zuletzt besucht' };
  function blockLabel(id, g) {
    if (BUILTIN[id]) return BUILTIN[id];
    if (g && g.type === 'links') return SOURCES[(g.opts && g.opts.source) || 'custom'] || 'Schnellzugriff';
    if (g && g.type === 'html') return 'Eigenes HTML';
    return 'Baustein';
  }

  // ---- news cards: steppers ----
  let news = { count: 3, cols: 3 };
  function paintSteppers() {
    document.querySelectorAll('[data-nt-news]').forEach((box) => {
      const key = box.dataset.ntNews, min = +box.dataset.min, max = +box.dataset.max;
      if (!box.firstChild) {
        const minus = document.createElement('button');
        const val = document.createElement('span');
        const plus = document.createElement('button');
        minus.type = plus.type = 'button';
        minus.textContent = '−';
        plus.textContent = '+';
        const step = (d) => {
          news[key] = Math.max(min, Math.min(max, (news[key] || 3) + d));
          chrome.storage.sync.set({ [NEWS_KEY]: { ...news } });
          paintSteppers();
        };
        minus.addEventListener('click', () => step(-1));
        plus.addEventListener('click', () => step(1));
        box.append(minus, val, plus);
      }
      const v = news[key] || 3;
      box.children[1].textContent = v;
      box.children[0].disabled = v <= min;
      box.children[2].disabled = v >= max;
    });
  }

  // ---- blocks: show / hide ----
  let layout = null;
  function paintBlocks() {
    const box = $('nt-blocks');
    box.textContent = '';
    if (!layout || !layout.widgets) {
      const p = document.createElement('p');
      p.className = 'nt-blocks-note';
      p.textContent = 'Die Startseite ist noch nicht angeordnet – Ein-/Ausblenden gibt es, sobald du sie einmal über Rechtsklick → „Startseite anordnen …“ eingerichtet hast.';
      box.appendChild(p);
      $('nt-layout-reset').disabled = true;
      return;
    }
    $('nt-layout-reset').disabled = false;
    const ids = Object.keys(layout.widgets).sort((a, b) => (BUILTIN[a] ? 0 : 1) - (BUILTIN[b] ? 0 : 1));
    for (const id of ids) {
      const g = layout.widgets[id];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'nt-block' + (g.show === false ? '' : ' on');
      chip.textContent = blockLabel(id, g);
      chip.title = g.show === false ? 'Ausgeblendet – klicken zum Einblenden' : 'Sichtbar – klicken zum Ausblenden';
      chip.addEventListener('click', () => {
        g.show = g.show === false;
        chrome.storage.sync.set({ [LAYOUT_KEY]: layout });
        paintBlocks();
      });
      box.appendChild(chip);
    }
  }

  $('nt-layout-reset').addEventListener('click', () => {
    if (!confirm('Startseiten-Anordnung zurücksetzen? Eigene Bausteine werden entfernt.')) return;
    chrome.storage.sync.remove(LAYOUT_KEY);
    chrome.storage.local.remove('nina_widget_html');
  });

  chrome.storage.sync.get([NEWS_KEY, LAYOUT_KEY], (r) => {
    news = { count: 3, cols: 3, ...(r[NEWS_KEY] || {}) };
    layout = r[LAYOUT_KEY] || null;
    paintSteppers();
    paintBlocks();
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'sync') return;
    if (c[NEWS_KEY]) { news = { count: 3, cols: 3, ...(c[NEWS_KEY].newValue || {}) }; paintSteppers(); }
    if (c[LAYOUT_KEY]) { layout = c[LAYOUT_KEY].newValue || null; paintBlocks(); }
  });
})();
