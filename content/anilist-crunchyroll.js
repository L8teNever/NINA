// anilist-crunchyroll.js — AniList on Crunchyroll.
//  • Show page: a bar above the episode list with the linked AniList entry
//    (average score, your status, episode progress, your score), editable.
//  • Watch page: when NINA marks the episode "Gesehen", the AniList progress
//    is moved forward automatically (background: lib/anilist-bg.js).
//
// A season is identified by "<seriesId>|<season title>" — the show page
// carries both on its season header (<h4 seriesid currentseasonid
// seasontitle>), and the watch page's tab title starts with the season title
// once the player has loaded ("Staffel 1 Die Begegnung - Schau auf …").

(function () {
  'use strict';

  if (window.__ninaAnilistCrLoaded) return;
  window.__ninaAnilistCrLoaded = true;

  const WATCH_KEY = 'nina_cr_watch_status';
  const EP_SEASON_KEY = 'nina_cr_ep_season'; // episodeId -> season title

  const STATUS_LABELS = {
    CURRENT: 'Schaue ich',
    PLANNING: 'Geplant',
    COMPLETED: 'Abgeschlossen',
    REPEATING: 'Erneutes Ansehen',
    PAUSED: 'Pausiert',
    DROPPED: 'Abgebrochen'
  };

  const call = (op, data) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op, data }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res || { ok: false, error: 'Keine Antwort' });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });

  // The URL slug is the show's English title (/series/G…/the-aristocrats-…),
  // a second search term when the German title isn't on AniList.
  function slugTitle(path) {
    const m = /\/series\/[^/?#]+\/([^/?#]+)/.exec(path || '');
    return m ? decodeURIComponent(m[1]).replace(/-+/g, ' ').trim() : '';
  }

  const seasonKey = (seriesId, seasonTitle) => seriesId + '|' + String(seasonTitle || '').trim().toLowerCase();

  // ── Styles ────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    /* The bar sits right under the season header and borrows its look
       (Crunchyroll's "ÄLTESTE · OPTIONEN"): gray uppercase controls that
       turn white on hover, no boxes — so it reads as part of the season. */
    .nina-al-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px 0;
      margin: -4px 0 22px; padding: 0 0 14px;
      border-bottom: 1px solid #2c2e33;
      color: #8c8c8c; font-family: inherit;
    }
    .nina-al-item {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 0 18px; height: 28px;
      border-left: 1px solid #3a3d45;
      font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
      white-space: nowrap;
    }
    .nina-al-item:first-child { padding-left: 0; border-left: 0; }
    .nina-al-item.nina-al-push { margin-left: auto; border-left: 0; padding-right: 0; }
    .nina-al-key { color: #8c8c8c; }
    .nina-al-val { color: #fff; }
    .nina-al-title {
      display: inline-flex; align-items: center; gap: 10px;
      color: #fff; text-decoration: none; text-transform: none; letter-spacing: 0;
      font-size: 14px; font-weight: 700; max-width: 360px;
    }
    .nina-al-title span { overflow: hidden; text-overflow: ellipsis; }
    .nina-al-title img { width: 20px; height: 28px; object-fit: cover; border-radius: 2px; flex: 0 0 auto; }
    .nina-al-title:hover { color: #3db4f2; }
    .nina-al-logo { width: 18px; height: 18px; flex: 0 0 auto; }
    /* Values taken from Crunchyroll's own sort dropdown ("ÄLTESTE"). */
    .nina-al-dd { position: relative; display: inline-flex; }
    .nina-al-dd-btn {
      display: inline-flex; align-items: center; gap: 4px;
      height: 44px; margin: 0 -12px 0 -8px; padding: 10px 12px 10px 8px; border: 0; border-radius: 0;
      background: transparent; color: #fff; cursor: pointer;
      font: inherit; font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
    }
    .nina-al-dd-btn svg { width: 20px; height: 20px; color: #8c8c8c; }
    .nina-al-dd-btn:hover, .nina-al-dd.open .nina-al-dd-btn { background: #272727; }
    .nina-al-dd-btn:hover svg, .nina-al-dd.open .nina-al-dd-btn svg { color: #fff; }
    .nina-al-dd-menu {
      display: none; position: absolute; top: 100%; left: -8px; z-index: 50;
      min-width: 200px; padding: 12px 0; background: #272727;
    }
    .nina-al-dd.open .nina-al-dd-menu { display: block; }
    .nina-al-dd-opt {
      display: block; width: 100%; padding: 10px 20px; border: 0; background: none; text-align: left;
      color: #8c8c8c; cursor: pointer; white-space: nowrap;
      font: inherit; font-size: 16px; font-weight: 400; letter-spacing: normal; text-transform: none;
    }
    .nina-al-dd-opt.selected { color: #f2f2f2; }
    .nina-al-dd-opt:hover, .nina-al-dd-opt:focus { background: rgb(21, 21, 21); color: #fff; outline: none; }
    .nina-al-bar select {
      -webkit-appearance: none; appearance: none;
      height: 28px; padding: 0 18px 0 0; border: 0; border-radius: 0;
      background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23a0a0a0'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right center / 18px;
      color: #fff; font: inherit; font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
      cursor: pointer;
    }
    .nina-al-bar select:hover { color: #3db4f2; }
    .nina-al-bar select option { background: #23252b; color: #fff; text-transform: none; }
    .nina-al-bar input.nina-al-ep-input {
      width: 34px; height: 24px; padding: 0; border: 0; border-bottom: 1px solid #4a4e58; border-radius: 0;
      background: transparent; color: #fff; font: inherit; font-size: 14px; font-weight: 700; text-align: center;
      -moz-appearance: textfield;
    }
    .nina-al-bar input.nina-al-ep-input:focus { outline: none; border-bottom-color: #3db4f2; }
    .nina-al-bar input.nina-al-ep-input::-webkit-inner-spin-button { -webkit-appearance: none; }
    .nina-al-bell {
      display: inline-flex; align-items: center; gap: 6px; height: 44px; margin: 0 -12px 0 -8px; padding: 10px 12px 10px 8px;
      border: 0; background: transparent; color: #fff; cursor: pointer;
      font: inherit; font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
    }
    .nina-al-bell svg { width: 18px; height: 18px; color: #f47521; }
    .nina-al-bell.off { color: #8c8c8c; }
    .nina-al-bell.off svg { color: #8c8c8c; }
    .nina-al-bell:hover { background: #272727; color: #fff; }
    .nina-al-parts { display: inline-flex; gap: 14px; }
    .nina-al-part {
      background: none; border: 0; padding: 4px 0; cursor: pointer;
      color: #8c8c8c; font: inherit; font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
      border-bottom: 2px solid transparent;
    }
    .nina-al-part:hover { color: #fff; }
    .nina-al-part.active { color: #fff; border-bottom-color: #f47521; }
    .nina-al-link {
      background: none; border: 0; padding: 0; cursor: pointer;
      color: #8c8c8c; font: inherit; font-size: 14px; font-weight: 700; letter-spacing: normal; text-transform: uppercase;
    }
    .nina-al-link:hover { color: #fff; }
    .nina-al-msg { font-size: 14px; color: #8c8c8c; }
    .nina-al-toast {
      position: fixed; left: 20px; bottom: 20px; z-index: 2147483647;
      padding: 10px 16px; border-radius: 10px; background: #152232; color: #fff;
      font: 600 14px/1.3 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.4);
      border-left: 4px solid #3db4f2; opacity: 0; transform: translateY(8px);
      transition: opacity .2s, transform .2s; pointer-events: none;
    }
    .nina-al-toast.show { opacity: 1; transform: none; }
  `;
  (document.head || document.documentElement).appendChild(style);

  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector('.nina-al-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'nina-al-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ── Show page: bar above the season's episode list ────────────────────
  let barKey = null;
  let barBusy = false;

  function seasonInfoFromShowPage() {
    // Single-season shows: <h4 seriesid currentseasonid seasontitle>.
    // Multi-season shows: a dropdown (.erc-seasons-select) whose first
    // .season-info span holds the selected season's title.
    const h = document.querySelector('[currentseasonid]');
    const dropdownTitle = document.querySelector('.erc-seasons-select .season-info span');
    if (!h && !dropdownTitle) return null;
    const seriesId = (h && h.getAttribute('seriesid')) || (/\/series\/([^/?#]+)/.exec(location.pathname) || [])[1];
    const seasonTitle = h ? (h.getAttribute('seasontitle') || h.textContent.trim()) : dropdownTitle.textContent.trim();
    const h1 = document.querySelector('h1');
    const seriesTitle = (h1 && h1.textContent.trim()) ||
      document.title.replace(/\s*-\s*Crunchyroll\s*$/i, '').replace(/\s+auf Deutsch\s*$/i, '').trim();
    if (!seriesId || !seriesTitle) return null;
    // Episode count and first number help pick the right AniList entry
    // (cour lengths differ; E13-start means Crunchyroll kept counting).
    const nums = [...listEpisodeNumbers().values()];
    return {
      key: seasonKey(seriesId, seasonTitle), seriesId, seriesTitle, seasonTitle,
      altTitle: slugTitle(location.pathname),
      episodeCount: nums.length || undefined,
      firstEpisode: nums.length ? Math.min(...nums) : undefined
    };
  }

  // Remember which season each listed episode belongs to, for the watch
  // page (where the season isn't in the DOM).
  function rememberEpisodeSeasons(info) {
    const list = document.querySelector('.erc-season-episode-list');
    if (!list) return;
    const ids = new Set();
    for (const a of list.querySelectorAll('a[href*="/watch/"]')) {
      const m = /\/watch\/([^/?#]+)/.exec(a.getAttribute('href') || '');
      if (m) ids.add(m[1]);
    }
    if (!ids.size) return;
    chrome.storage.local.get([EP_SEASON_KEY], (res) => {
      const map = res[EP_SEASON_KEY] || {};
      let changed = false;
      for (const id of ids) {
        if (map[id] !== info.seasonTitle) { map[id] = info.seasonTitle; changed = true; }
      }
      if (changed) chrome.storage.local.set({ [EP_SEASON_KEY]: map });
    });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const ANILIST_LOGO = '<svg class="nina-al-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="#3db4f2" d="M6.36 2.25h4.64l6.6 19.5h-4.47l-1.36-4.17H7.24l-1.3 4.17H1.5z"/><path fill="#fff" d="M17.1 2.25h4.4v19.5h-4.4zM8.33 13.8h2.86L9.76 9.3z"/></svg>';

  function item(...children) {
    const i = el('span', 'nina-al-item');
    i.append(...children);
    return i;
  }

  // Dropdown in the style of Crunchyroll's own sort menu ("ÄLTESTE"):
  // uppercase trigger that gets a dark background while open, a dark panel
  // below it, selected entry white, the others gray.
  let openDropdown = null;
  function closeDropdown() {
    if (!openDropdown) return;
    openDropdown.classList.remove('open');
    openDropdown = null;
  }
  document.addEventListener('mousedown', (e) => {
    if (openDropdown && !openDropdown.contains(e.target)) closeDropdown();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDropdown) { e.stopPropagation(); closeDropdown(); }
  }, true);

  function dropdown(options, value, buttonText, onPick) {
    const wrap = el('span', 'nina-al-dd');
    const btn = el('button', 'nina-al-dd-btn');
    btn.type = 'button';
    btn.append(el('span', '', buttonText(value)));
    btn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>');
    const menu = el('div', 'nina-al-dd-menu');
    menu.setAttribute('role', 'listbox');
    for (const o of options) {
      const opt = el('button', 'nina-al-dd-opt' + (o.value === value ? ' selected' : ''), o.label);
      opt.type = 'button';
      opt.setAttribute('role', 'option');
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        if (o.value !== value) onPick(o.value);
      });
      menu.appendChild(opt);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = openDropdown === wrap;
      closeDropdown();
      if (!wasOpen) { wrap.classList.add('open'); openDropdown = wrap; }
    });
    wrap.append(btn, menu);
    return wrap;
  }

  // Bell next to WERTUNG: anime news (new tab page / desktop notifications)
  // for this show on or off. Same lists and matching as newtab-anime.js:
  // default "on" -> nina_notif_muted holds the switched-off shows, default
  // "off" -> nina_notif_enabled holds the switched-on ones.
  const BELL_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>';
  const BELL_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0118 8"/><path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 00-9.33-5"/><path d="M1 1l22 22"/></svg>';
  const nrm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function notifBell(media) {
    const b = el('button', 'nina-al-bell');
    b.type = 'button';
    const title = media.title.english || media.title.userPreferred || media.title.romaji;
    const key = nrm(title).split(' ').slice(0, 2).join(' ');
    const matches = (map) => !!map[media.id] || Object.values(map).some((m) => m.key && m.key.length >= 6 &&
      [nrm(media.title.english), nrm(media.title.userPreferred), nrm(media.title.romaji)].some((t) => t && (t === m.key || t.startsWith(m.key + ' '))));
    let s = {};
    const paint = () => {
      const defaultOn = s.nina_notif_default !== 'off';
      const on = defaultOn ? !matches(s.nina_notif_muted || {}) : matches(s.nina_notif_enabled || {});
      b.classList.toggle('off', !on);
      b.innerHTML = (on ? BELL_ON : BELL_OFF) + '<span>' + (on ? 'Neuigkeiten an' : 'Neuigkeiten aus') + '</span>';
      b.title = on ? 'Neue Folgen/Staffeln dieser Serie werden gemeldet – klicken zum Ausschalten'
        : 'Keine Meldungen zu dieser Serie – klicken zum Einschalten';
      return on;
    };
    chrome.storage.sync.get(['nina_notif_default', 'nina_notif_muted', 'nina_notif_enabled'], (r) => { s = r; paint(); });
    b.addEventListener('click', () => {
      const defaultOn = s.nina_notif_default !== 'off';
      const listKey = defaultOn ? 'nina_notif_muted' : 'nina_notif_enabled';
      const map = { ...(s[listKey] || {}) };
      const on = defaultOn ? !matches(s.nina_notif_muted || {}) : matches(s.nina_notif_enabled || {});
      // turning off in "on" mode / on in "off" mode adds the show; the reverse
      // removes it (also an entry that only matched via the title)
      const add = defaultOn ? on : !on;
      if (add) map[media.id] = { title, key };
      else for (const [id, m] of Object.entries(map)) {
        if (Number(id) === media.id || (m.key && m.key === key)) delete map[id];
      }
      s = { ...s, [listKey]: map };
      chrome.storage.sync.set({ [listKey]: map });
      const nowOn = paint();
      toast('AniList-Neuigkeiten für ' + title + (nowOn ? ' eingeschaltet' : ' ausgeschaltet'));
    });
    paint();
    return b;
  }

  // Which part (AniList entry) a Crunchyroll episode number belongs to, and
  // its episode number inside that part.
  function locate(parts, offset, n) {
    let ep = n;
    if (offset && parts[0].episodes && n > parts[0].episodes) ep = n - offset;
    for (let k = 0; k < parts.length; k++) {
      const len = parts[k].episodes;
      if (!len || ep <= len || k === parts.length - 1) return { k, ep };
      ep -= len;
    }
    return { k: 0, ep };
  }

  async function renderBar(info, bar) {
    bar.textContent = '';
    bar.append(item(el('span', 'nina-al-msg', 'AniList wird geladen …')));

    const st = await call('status');
    if (!st.ok) { bar.textContent = ''; return; }
    if (!st.result.connected) {
      bar.textContent = '';
      const btn = el('button', 'nina-al-link', 'In den NINA-Einstellungen verbinden');
      btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'NINA_OPEN_OPTIONS', hash: 'cat-anilist' }));
      const logo = el('span');
      logo.innerHTML = ANILIST_LOGO;
      bar.append(item(logo.firstChild, el('span', 'nina-al-key', 'AniList')), item(btn));
      return;
    }

    const res = await call('resolve', info);
    bar.textContent = '';
    if (!res.ok) {
      bar.append(item(el('span', 'nina-al-msg', 'AniList: ' + res.error)));
      return;
    }
    const { media, unlinked } = res.result;
    if (!media) {
      bar.append(item(el('span', 'nina-al-msg', unlinked ? 'AniList-Sync für diese Staffel ist aus' : 'Kein passender AniList-Eintrag gefunden')));
      const link = item(linkButton(info, unlinked ? 'Wieder automatisch suchen' : 'Eintrag suchen', unlinked));
      link.classList.add('nina-al-push');
      bar.append(link);
      return;
    }

    const parts = res.result.parts && res.result.parts.length ? res.result.parts : [media];
    const offset = res.result.offset || 0;
    applyAnilistProgress(parts, offset);
    lastRender = { info, parts, offset };
    pushNinaProgress(info, parts, offset);

    // Show the part you're currently in: the first one not finished yet.
    const current = parts.findIndex((p) => !p.mediaListEntry || p.mediaListEntry.status !== 'COMPLETED');
    renderPart(info, bar, parts, offset, current === -1 ? parts.length - 1 : current);
  }

  function renderPart(info, bar, parts, offset, k) {
    bar.textContent = '';
    const media = parts[k];
    const entry = media.mediaListEntry || null;

    const titleLink = el('a', 'nina-al-title');
    titleLink.href = media.siteUrl;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener';
    titleLink.title = 'Auf AniList öffnen';
    const logo = el('span');
    logo.innerHTML = ANILIST_LOGO;
    titleLink.appendChild(logo.firstChild);
    if (media.coverImage && media.coverImage.medium) {
      const img = document.createElement('img');
      img.src = media.coverImage.medium;
      img.alt = '';
      titleLink.appendChild(img);
    }
    titleLink.appendChild(el('span', '', media.title.userPreferred));
    bar.append(item(titleLink));

    if (parts.length > 1) {
      const chips = el('span', 'nina-al-parts');
      parts.forEach((p, i) => {
        const done = p.mediaListEntry && p.mediaListEntry.status === 'COMPLETED';
        const b = el('button', 'nina-al-part' + (i === k ? ' active' : ''), 'Teil ' + (i + 1) + (done ? ' ✓' : ''));
        b.title = p.title.userPreferred + (p.episodes ? ' · ' + p.episodes + ' Folgen' : '');
        b.addEventListener('click', () => renderPart(info, bar, parts, offset, i));
        chips.appendChild(b);
      });
      bar.append(item(chips));
    }

    bar.append(item(el('span', 'nina-al-key', '★'), el('span', 'nina-al-val', media.averageScore ? String(media.averageScore) + '%' : '–')));

    const statusValue = entry ? entry.status : '';
    const statusOpts = [{ value: '', label: 'Nicht auf Liste' }, ...Object.keys(STATUS_LABELS).map((s) => ({ value: s, label: STATUS_LABELS[s] }))];
    bar.append(item(dropdown(statusOpts, statusValue, (v) => (statusOpts.find((o) => o.value === v) || statusOpts[0]).label, (v) => {
      if (!v) return;
      const data = { status: v };
      if (v === 'COMPLETED' && media.episodes) data.progress = media.episodes;
      saveWith(data, STATUS_LABELS[v]);
    })));

    const total = media.episodes || (media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : 0);
    const epInput = document.createElement('input');
    epInput.type = 'number';
    epInput.min = '0';
    if (media.episodes) epInput.max = String(media.episodes);
    epInput.className = 'nina-al-ep-input';
    epInput.value = entry ? String(entry.progress) : '0';
    for (const t of ['keydown', 'keyup', 'keypress']) epInput.addEventListener(t, (e) => e.stopPropagation());
    bar.append(item(el('span', 'nina-al-key', 'Folge'), epInput, el('span', 'nina-al-key', '/ ' + (total || '?'))));

    const scoreValue = entry && entry.score ? String(Math.round(entry.score)) : '0';
    const scoreOpts = [{ value: '0', label: 'Keine Wertung' }];
    for (let i = 10; i >= 1; i--) scoreOpts.push({ value: String(i), label: String(i) });
    bar.append(item(dropdown(scoreOpts, scoreValue, (v) => 'Wertung ' + (v === '0' ? '–' : v), (v) => {
      saveWith({ score: Number(v) }, v === '0' ? 'Wertung entfernt' : 'Wertung ' + v + ' gespeichert');
    })));

    bar.append(item(notifBell(media)));

    const link = item(linkButton(info, 'Verknüpfung ändern', false));
    link.classList.add('nina-al-push');
    bar.append(link);

    const saveWith = async (data, okText) => {
      const r = await call('save', { mediaId: media.id, ...data });
      if (r.ok) {
        toast('AniList: ' + okText);
        media.mediaListEntry = { ...(media.mediaListEntry || {}), ...r.result };
        applyAnilistProgress(parts, offset);
        renderPart(info, bar, parts, offset, k);
      } else {
        toast('AniList-Fehler: ' + r.error);
      }
    };
    epInput.addEventListener('change', () => {
      let p = Math.max(0, parseInt(epInput.value, 10) || 0);
      if (media.episodes) p = Math.min(p, media.episodes);
      const data = { progress: p };
      if (media.episodes && p === media.episodes) data.status = 'COMPLETED';
      else if (!statusValue || statusValue === 'PLANNING') data.status = 'CURRENT';
      saveWith(data, 'Folge ' + p + ' gespeichert');
    });
  }

  // AniList -> NINA: episodes of this season up to the AniList progress of
  // their part get marked "Gesehen" in NINA (frames, overview, Drive).
  // Episode numbers come from the cards ("E5 - …").
  function listEpisodeNumbers() {
    const list = document.querySelector('.erc-season-episode-list');
    const byId = new Map();
    if (!list) return byId;
    for (const a of list.querySelectorAll('a[href*="/watch/"]')) {
      const m = /\/watch\/([^/?#]+)/.exec(a.getAttribute('href') || '');
      if (!m || byId.has(m[1])) continue;
      const text = (a.textContent || '') + ' ' + (a.getAttribute('title') || '') + ' ' + (a.getAttribute('aria-label') || '');
      const n = /\bE(\d+)\s*[-–]/.exec(text);
      if (n) byId.set(m[1], Number(n[1]));
    }
    return byId;
  }

  function doneIn(part) {
    const e = part.mediaListEntry;
    if (!e) return 0;
    return e.status === 'COMPLETED' ? (part.episodes || e.progress) : e.progress;
  }

  function applyAnilistProgress(parts, offset) {
    if (typeof window.__ninaCrMarkWatched !== 'function') return;
    const nums = listEpisodeNumbers();
    if (!nums.size) return;
    const ids = [], beyond = [];
    for (const [id, n] of nums) {
      const { k, ep } = locate(parts, offset, n);
      if (ep >= 1 && ep <= doneIn(parts[k])) ids.push(id);
      else beyond.push(id);
    }
    const marked = ids.length ? window.__ninaCrMarkWatched(ids) : 0;
    // Episodes past the AniList progress that were marked only because of
    // AniList (e.g. through a wrong link before) get un-marked again.
    const unmarked = beyond.length && window.__ninaCrUnmarkFromAnilist ? window.__ninaCrUnmarkFromAnilist(beyond) : 0;
    if (marked) toast('AniList: ' + marked + (marked === 1 ? ' Folge' : ' Folgen') + ' in NINA als gesehen markiert');
    else if (unmarked) toast('AniList: ' + unmarked + (unmarked === 1 ? ' Folge' : ' Folgen') + ' in NINA wieder auf ungesehen gesetzt');
  }

  // NINA -> AniList on the show page: per part, if NINA has more watched
  // than AniList (or AniList's status is stale, e.g. "Geplant" at 12/12),
  // push it. Same rules as the automatic sync (respects the auto-sync
  // switch, never goes backwards).
  let pushedFor = null;
  let lastRender = null; // { info, parts, offset } of the bar currently shown
  async function pushNinaProgress(info, parts, offset) {
    if (pushedFor === info.key) return; // once per season view, no loops
    pushedFor = info.key;
    const nums = listEpisodeNumbers();
    if (!nums.size) return;
    const map = await new Promise((r) => chrome.storage.local.get([WATCH_KEY], (res) => r(res[WATCH_KEY] || {})));
    const best = parts.map(() => 0); // highest watched Crunchyroll number per part
    const bestLocal = parts.map(() => 0);
    for (const [id, n] of nums) {
      if (!map[id] || map[id].status !== 'watched') continue;
      const { k, ep } = locate(parts, offset, n);
      if (ep > bestLocal[k]) { bestLocal[k] = ep; best[k] = n; }
    }
    let updated = false;
    for (let k = 0; k < parts.length; k++) {
      if (!best[k]) continue;
      const p = parts[k], entry = p.mediaListEntry;
      if (entry && entry.status === 'COMPLETED') continue;
      const stale = !entry || entry.status === 'PLANNING' ||
        (p.episodes && entry.progress >= p.episodes && entry.status !== 'REPEATING');
      if (entry && !stale && entry.progress >= bestLocal[k]) continue;
      const r = await call('episodeWatched', { ...info, episode: best[k] });
      if (r.ok && r.result.updated) {
        updated = true;
        toast('AniList: ' + r.result.title + ' – Folge ' + r.result.progress + (r.result.episodes ? '/' + r.result.episodes : '') +
          (r.result.status === 'COMPLETED' ? ' (abgeschlossen)' : '') + ' gespeichert');
      }
    }
    if (updated) {
      barKey = null; // show the new state in the bar
      ensureBar();
    }
  }

  function linkButton(info, label, reset) {
    const b = el('button', 'nina-al-link', label);
    b.addEventListener('click', async () => {
      if (reset) applyLink(info, '');
      else openPicker(info);
    });
    return b;
  }

  async function applyLink(info, value) {
    const offset = info.firstEpisode > 1 ? info.firstEpisode - 1 : 0;
    const r = await call('setLink', { key: info.key, value, offset });
    if (!r.ok) { toast('AniList: ' + r.error); return; }
    barKey = null; // force re-render
    ensureBar();
  }

  // ── "Verknüpfung ändern": search popup ───────────────────────────────
  const FORMAT_LABELS = { TV: 'TV', TV_SHORT: 'TV (kurz)', ONA: 'ONA', OVA: 'OVA', MOVIE: 'Film', SPECIAL: 'Special', MUSIC: 'Musik' };
  const SEASON_LABELS = { WINTER: 'Winter', SPRING: 'Frühling', SUMMER: 'Sommer', FALL: 'Herbst' };

  const pickerStyle = document.createElement('style');
  pickerStyle.textContent = `
    .nina-al-modal-bg { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,.6); display: flex; align-items: flex-start; justify-content: center; padding-top: 8vh; }
    .nina-al-modal { width: min(640px, 94vw); max-height: 80vh; display: flex; flex-direction: column; background: #141519; color: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.6); font-family: inherit; overflow: hidden; }
    .nina-al-modal-head { padding: 16px 18px 10px; display: flex; flex-direction: column; gap: 10px; }
    .nina-al-modal-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .nina-al-modal-head p { margin: 0; font-size: 13px; color: #8c8c8c; }
    .nina-al-modal input[type=search] { height: 40px; padding: 0 12px; border-radius: 6px; border: 1px solid #3a3d45; background: #23252b; color: #fff; font: inherit; font-size: 15px; outline: none; }
    .nina-al-modal input[type=search]:focus { border-color: #3db4f2; }
    .nina-al-results { overflow-y: auto; padding: 4px 8px 8px; }
    .nina-al-result { display: flex; gap: 12px; align-items: center; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .nina-al-result:hover, .nina-al-result:focus { background: #23252b; outline: none; }
    .nina-al-result.current { background: rgba(61,180,242,.15); }
    .nina-al-result img { width: 42px; height: 60px; object-fit: cover; border-radius: 4px; flex: 0 0 auto; background: #23252b; }
    .nina-al-result-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .nina-al-result-title { font-weight: 700; font-size: 14px; }
    .nina-al-result-sub { font-size: 12px; color: #8c8c8c; }
    .nina-al-result-list { font-size: 12px; color: #3db4f2; }
    .nina-al-modal-foot { display: flex; gap: 14px; justify-content: space-between; align-items: center; padding: 10px 18px 14px; border-top: 1px solid #23252b; }
    .nina-al-modal-foot .nina-al-link { font-size: 13px; }
    .nina-al-close { height: 34px; padding: 0 16px; border: 0; border-radius: 6px; background: #23252b; color: #fff; font: inherit; cursor: pointer; }
  `;
  (document.head || document.documentElement).appendChild(pickerStyle);

  function openPicker(info) {
    const LIST_LABELS = { CURRENT: 'Schaue ich', PLANNING: 'Geplant', COMPLETED: 'Abgeschlossen', REPEATING: 'Erneutes Ansehen', PAUSED: 'Pausiert', DROPPED: 'Abgebrochen' };
    const bg = el('div', 'nina-al-modal-bg');
    const modal = el('div', 'nina-al-modal');
    const head = el('div', 'nina-al-modal-head');
    head.append(el('h3', '', 'AniList-Eintrag wählen'),
      el('p', '', info.seriesTitle + ' – ' + info.seasonTitle + (info.episodeCount ? ' (' + info.episodeCount + ' Folgen)' : '')));
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Auf AniList suchen …';
    const seasonNo = /(?:staffel|season)\s*(\d+)/i.exec(info.seasonTitle || '');
    input.value = info.seriesTitle + (seasonNo && seasonNo[1] !== '1' ? ' Season ' + seasonNo[1] : '');
    head.appendChild(input);
    const results = el('div', 'nina-al-results');
    const foot = el('div', 'nina-al-modal-foot');
    const auto = el('button', 'nina-al-link', 'Automatisch zuordnen');
    const off = el('button', 'nina-al-link', 'Für diese Staffel nicht synchronisieren');
    const close = el('button', 'nina-al-close', 'Schließen');
    const left = el('div');
    left.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap';
    left.append(auto, off);
    foot.append(left, close);
    modal.append(head, results, foot);
    bg.appendChild(modal);
    document.body.appendChild(bg);
    input.focus();
    input.select();

    const shut = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    document.addEventListener('keydown', onKey, true);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) shut(); });
    close.addEventListener('click', shut);
    auto.addEventListener('click', () => { shut(); applyLink(info, ''); });
    off.addEventListener('click', () => { shut(); applyLink(info, null); });
    // Keep site shortcuts (space = play, f = fullscreen …) out of the input.
    for (const t of ['keydown', 'keyup', 'keypress']) input.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

    let currentId = null;
    const cur = document.querySelector('.nina-al-title');
    const m = cur && /anime\/(\d+)/.exec(cur.getAttribute('href') || '');
    if (m) currentId = Number(m[1]);

    let seq = 0;
    let triedAlt = false;
    async function run() {
      const q = input.value.trim();
      const mySeq = ++seq;
      results.textContent = '';
      if (q.length < 2) return;
      results.appendChild(el('div', 'nina-al-result-sub', 'Suche …'));
      const r = await call('search', { q });
      if (mySeq !== seq) return;
      results.textContent = '';
      if (!r.ok) { results.appendChild(el('div', 'nina-al-result-sub', 'Fehler: ' + r.error)); return; }
      if (!r.result.length) {
        // German title unknown on AniList: retry once with the English one
        // from the URL.
        const alt = info.altTitle ? info.altTitle + (seasonNo && seasonNo[1] !== '1' ? ' Season ' + seasonNo[1] : '') : '';
        if (alt && !triedAlt && alt.toLowerCase() !== q.toLowerCase()) {
          triedAlt = true;
          input.value = alt;
          run();
          return;
        }
        results.appendChild(el('div', 'nina-al-result-sub', 'Keine Treffer.'));
        return;
      }
      for (const media of r.result) {
        const row = el('button', 'nina-al-result' + (media.id === currentId ? ' current' : ''));
        const img = document.createElement('img');
        img.alt = '';
        if (media.coverImage && media.coverImage.medium) img.src = media.coverImage.medium;
        const body = el('div', 'nina-al-result-body');
        const t = media.title || {};
        body.appendChild(el('div', 'nina-al-result-title', t.english || t.userPreferred || t.romaji));
        if (t.romaji && t.romaji !== (t.english || t.userPreferred)) body.appendChild(el('div', 'nina-al-result-sub', t.romaji));
        const parts = [FORMAT_LABELS[media.format] || media.format, media.episodes ? media.episodes + ' Folgen' : null,
          media.season && media.seasonYear ? SEASON_LABELS[media.season] + ' ' + media.seasonYear : media.seasonYear].filter(Boolean);
        body.appendChild(el('div', 'nina-al-result-sub', parts.join(' · ')));
        if (media.mediaListEntry) {
          body.appendChild(el('div', 'nina-al-result-list', 'Auf deiner Liste: ' + (LIST_LABELS[media.mediaListEntry.status] || media.mediaListEntry.status) + ' · ' + media.mediaListEntry.progress + (media.episodes ? '/' + media.episodes : '')));
        }
        if (media.id === currentId) body.appendChild(el('div', 'nina-al-result-list', 'Aktuell verknüpft'));
        row.append(img, body);
        row.addEventListener('click', () => { shut(); applyLink(info, String(media.id)); });
        results.appendChild(row);
      }
    }
    let timer = null;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
    run();
  }

  // Settings page switch "AniList-Leiste auf der Serienseite" (in the
  // shared Crunchyroll options object).
  let barEnabled = true;
  chrome.storage.sync.get(['nina_cr_options'], (r) => { barEnabled = !(r.nina_cr_options && r.nina_cr_options.anilistBar === false); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.nina_cr_options) return;
    barEnabled = !(changes.nina_cr_options.newValue && changes.nina_cr_options.newValue.anilistBar === false);
    barKey = null;
    ensureBar();
  });

  function ensureBar() {
    if (!barEnabled) {
      const old = document.querySelector('.nina-al-bar');
      if (old) old.remove();
      return;
    }
    if (!location.pathname.includes('/series/')) return;
    const info = seasonInfoFromShowPage();
    const anchor = document.querySelector('.erc-season-with-navigation');
    if (!info || !anchor) return;
    // Directly below the season header row (title/dropdown · ÄLTESTE ·
    // OPTIONEN), so the bar belongs to the selected season.
    const titleEl = document.querySelector('[currentseasonid]') || document.querySelector('.erc-seasons-select');
    let headerRow = titleEl;
    while (headerRow && headerRow.parentElement !== anchor) headerRow = headerRow.parentElement;
    let bar = document.querySelector('.nina-al-bar');
    const misplaced = bar && (bar.parentElement !== anchor || (headerRow && bar.previousElementSibling !== headerRow));
    if (misplaced) {
      // Move it back (keeps its content, no new AniList request).
      if (headerRow) headerRow.insertAdjacentElement('afterend', bar);
      else anchor.prepend(bar);
    }
    if (!bar) {
      bar = el('div', 'nina-al-bar');
      if (headerRow) headerRow.insertAdjacentElement('afterend', bar);
      else anchor.prepend(bar);
      barKey = null;
    }
    // Wait for the episode cards: their count feeds the AniList matching.
    if (!info.episodeCount) return;
    if (barKey === info.key || barBusy) return;
    barKey = info.key;
    barBusy = true;
    rememberEpisodeSeasons(info);
    renderBar(info, bar).finally(() => { barBusy = false; });
  }

  // ── Watch page: push progress when the episode becomes "Gesehen" ─────
  function currentEpisodeId() {
    const m = /\/watch\/([^/?#]+)/.exec(location.pathname);
    return m ? m[1] : null;
  }

  function episodeNumber() {
    const h1 = document.querySelector('h1');
    const m = h1 && /^\s*E(\d+(?:\.\d+)?)\b/i.exec(h1.textContent || '');
    return m ? Number(m[1]) : null;
  }

  function seasonTitleFromTabTitle() {
    const t = document.title.replace(/\s*-\s*Schau auf Crunchyroll\s*$/i, '').replace(/\s*-\s*Watch on Crunchyroll\s*$/i, '');
    if (t === document.title) return null;
    const m = /^((?:Staffel|Season)\s*\d+)\b/i.exec(t);
    return m ? m[1] : null;
  }

  async function pushEpisode(episodeId) {
    const link = document.querySelector('a[href*="/series/"]');
    const sid = link && /\/series\/([^/?#]+)/.exec(link.getAttribute('href'));
    const ep = episodeNumber();
    if (!sid || !ep) return;
    const seriesTitle = link.textContent.trim();
    const stored = await new Promise((r) => chrome.storage.local.get([EP_SEASON_KEY], (res) => r((res[EP_SEASON_KEY] || {})[episodeId])));
    const seasonTitle = stored || seasonTitleFromTabTitle() || 'Staffel 1';
    const r = await call('episodeWatched', { key: seasonKey(sid[1], seasonTitle), seriesTitle, seasonTitle, altTitle: slugTitle(link.getAttribute('href')), episode: ep });
    if (!r.ok) { toast('AniList-Fehler: ' + r.error); return; }
    const res = r.result;
    if (res.updated) {
      toast('AniList: ' + res.title + ' – Folge ' + res.progress + (res.episodes ? '/' + res.episodes : '') +
        (res.status === 'COMPLETED' ? ' (abgeschlossen)' : '') + ' gespeichert');
    } else if (res.skipped === 'no-match') {
      toast('AniList: kein passender Eintrag für ' + seriesTitle + ' gefunden');
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[WATCH_KEY]) return;
    const id = currentEpisodeId();
    if (!id) return;
    const before = (changes[WATCH_KEY].oldValue || {})[id];
    const after = (changes[WATCH_KEY].newValue || {})[id];
    if (after && after.status === 'watched' && (!before || before.status !== 'watched')) pushEpisode(id);
  });

  // Show page, live: episodes of the open season that just became "Gesehen"
  // (e.g. Crunchyroll's "Als gesehen markieren" for the whole season, picked
  // up by NINA) are pushed to AniList right away and the bar refreshes —
  // without reloading the page. Debounced, since marking a season changes
  // many episodes at once.
  let livePushTimer = null;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[WATCH_KEY] || !lastRender) return;
    if (!location.pathname.includes('/series/')) return;
    const before = changes[WATCH_KEY].oldValue || {};
    const after = changes[WATCH_KEY].newValue || {};
    const nums = listEpisodeNumbers();
    const newlyWatched = [...nums.keys()].some((id) =>
      after[id] && after[id].status === 'watched' && !(before[id] && before[id].status === 'watched'));
    if (!newlyWatched) return;
    clearTimeout(livePushTimer);
    livePushTimer = setTimeout(() => {
      const { info, parts, offset } = lastRender;
      pushedFor = null; // allow another push for this season
      pushNinaProgress(info, parts, offset);
    }, 1500);
  });

  // ── Loop ──────────────────────────────────────────────────────────────
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      barKey = null;
    }
    try { ensureBar(); } catch (_) {}
  }, 1000);
})();
