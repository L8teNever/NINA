// newtab-anime.js — anime news on the new tab page, from AniList's own
// notifications (new episodes of shows you watch, new seasons / sequels of
// shows on your list), fetched by the background (lib/anilist-bg.js):
//  • bell next to the bookmarks/settings buttons, with an unread count,
//    opening a side panel (same drawer as the settings) with the latest 30;
//  • the 3 newest as cards under the search field, faded in like the clock
//    and the search bar;
//  • shows can be muted ("Stummschalten"): no cards, no badge, no desktop
//    notification for them — also for their later seasons.
// Both can be switched off in NINA's settings (AniList section). Nothing
// shows while AniList isn't connected.

(function () {
  'use strict';

  const K_SHOW = 'nina_notif_newtab';   // sync, default true
  const K_MUTED = 'nina_notif_muted';   // sync: { mediaId: { title, key } } — used when default is "on"
  const K_ENABLED = 'nina_notif_enabled'; // sync: same shape — used when default is "off"
  const K_DEFAULT = 'nina_notif_default'; // sync: 'on' (default) | 'off'
  const K_STRIP = 'nina_news_strip';      // sync: { count, cols } — right-click on the cards
  let stripOpts = { count: 3, cols: 3 };
  const $ = (id) => document.getElementById(id);

  const call = (op, data) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'NINA_ANILIST', op, data }, (res) => resolve(chrome.runtime.lastError ? null : res));
    } catch (_) { resolve(null); }
  });

  const style = document.createElement('style');
  style.textContent = `
    #nina-news-btn { position: relative; }
    #nina-news-badge {
      position: absolute; top: 4px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px;
      border-radius: 999px; background: var(--accent-color, #06b6d4); color: #000;
      font: 700 10px/16px system-ui, sans-serif; text-align: center; pointer-events: none;
    }

    /* Drawer content (the drawer itself is the page's .drawer). */
    .nina-news-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(39,39,42,.8); flex-shrink: 0; }
    .nina-news-head h3 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -.01em; color: #fff; }
    .nina-news-head .nina-news-actions { display: flex; align-items: center; gap: 14px; }
    .nina-news-head button { background: none; border: 0; cursor: pointer; color: #71717a; transition: color .2s; }
    .nina-news-head button:hover { color: #fff; }
    #nina-news-refresh { font-size: 13px; font-weight: 600; }
    #nina-news-refresh:hover { color: var(--accent-color, #06b6d4); }
    #nina-news-close { font-size: 24px; font-weight: 600; line-height: 1; }
    .nina-news-sub { margin: -6px 0 14px; font-size: 12px; color: #71717a; }
    #nina-news-list, #nina-news-muted-list { display: flex; flex-direction: column; gap: 4px; }
    .nina-news-section { margin: 22px 0 8px; padding-top: 16px; border-top: 1px solid rgba(39,39,42,.8); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #71717a; }

    .nina-news-row { position: relative; display: flex; align-items: center; border-radius: 16px; transition: background .15s; }
    .nina-news-row:hover { background: rgba(255,255,255,.05); }
    .nina-news-item { flex: 1; min-width: 0; display: flex; gap: 12px; align-items: center; padding: 8px 10px; color: inherit; text-decoration: none; }
    .nina-news-item img { width: 40px; height: 56px; border-radius: 10px; object-fit: cover; flex: 0 0 auto; background: #2a2b2f; }
    .nina-news-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .nina-news-title { font-size: 14px; font-weight: 600; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nina-news-msg { font-size: 12px; color: #a1a1aa; }
    .nina-news-msg b { color: var(--accent-color, #06b6d4); font-weight: 700; }
    .nina-news-time { font-size: 11px; color: #71717a; }
    .nina-news-item.unread .nina-news-title::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: var(--accent-color, #06b6d4); vertical-align: middle; }
    .nina-news-mute {
      flex: 0 0 auto; width: 34px; height: 34px; margin-right: 8px; display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: 999px; background: transparent; color: #71717a; cursor: pointer;
      opacity: 0; transition: opacity .15s, color .15s, background .15s;
    }
    .nina-news-row:hover .nina-news-mute, .nina-news-mute:focus { opacity: 1; }
    .nina-news-mute:hover { color: #fff; background: rgba(255,255,255,.08); }
    .nina-news-mute svg { width: 18px; height: 18px; }
    .nina-news-unmute { flex: 0 0 auto; margin-right: 10px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); background: transparent; color: #a1a1aa; font-size: 12px; font-weight: 600; cursor: pointer; }
    .nina-news-unmute:hover { color: #fff; border-color: rgba(6,182,212,.5); }
    .nina-news-empty { padding: 16px 12px; font-size: 13px; color: #71717a; }

    /* Cards under the search: same glass look as the search bar, faded in
       one after another like the clock and the search. */
    @keyframes ninaNewsIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
    #nina-news-strip { width: 100%; max-width: 42rem; display: grid; gap: 12px; justify-content: center; }
    #nina-news-strip .nina-news-row {
      min-width: 0;
      background: rgba(30, 31, 34, .75); border: 1px solid rgba(255, 255, 255, .08); border-radius: 20px;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, .3), inset 0 1px 0 rgba(255, 255, 255, .05);
      transition: background .3s cubic-bezier(0.16, 1, 0.3, 1), border-color .3s, box-shadow .3s, transform .3s;
      opacity: 0; animation: ninaNewsIn .9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    #nina-news-strip .nina-news-row:hover {
      background: rgba(37, 39, 42, .85); border-color: rgba(6, 182, 212, .4); transform: translateY(-2px);
      box-shadow: 0 0 30px rgba(6, 182, 212, .18), 0 20px 40px rgba(0, 0, 0, .4), inset 0 1px 0 rgba(255, 255, 255, .05);
    }
    #nina-news-strip .nina-news-item { padding: 8px 14px 8px 8px; gap: 10px; }
    #nina-news-strip img { width: 34px; height: 48px; border-radius: 10px; }
    #nina-news-strip .nina-news-title { font-size: 13px; }
    #nina-news-strip .nina-news-mute { display: none; }
  `;
  document.head.appendChild(style);

  const BELL_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0118 8"/><path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 00-9.33-5"/><path d="M1 1l22 22"/></svg>';

  // Muting matches the show and its later seasons: same AniList id, or a
  // title starting with the same first two words ("one piece", "tomb raider").
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const muteKey = (title) => norm(title).split(' ').slice(0, 2).join(' ');
  let muted = {};
  let enabled = {};
  let defaultOn = true;
  function matches(map, n) {
    if (map[n.mediaId]) return true;
    const titles = [norm(n.title), norm(n.titleEn)];
    return Object.values(map).some((m) => m.key && m.key.length >= 6 && titles.some((t) => t && (t === m.key || t.startsWith(m.key + ' '))));
  }
  // Default "on": everything except muted shows. Default "off": only shows
  // you switched on (bell next to WERTUNG in the AniList bar on Crunchyroll,
  // or here in the panel).
  const isMuted = (n) => (defaultOn ? matches(muted, n) : !matches(enabled, n));
  function setShown(n, show) {
    const title = n.titleEn || n.title;
    const entry = { title, key: muteKey(title) };
    if (defaultOn) { if (show) delete muted[n.mediaId]; else muted[n.mediaId] = entry; chrome.storage.sync.set({ [K_MUTED]: muted }); }
    else { if (show) enabled[n.mediaId] = entry; else delete enabled[n.mediaId]; chrome.storage.sync.set({ [K_ENABLED]: enabled }); }
  }

  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 60) return 'vor ' + Math.max(1, m) + ' Min.';
    const h = Math.round(m / 60);
    if (h < 24) return 'vor ' + h + ' Std.';
    const d = Math.round(h / 24);
    return d === 1 ? 'gestern' : 'vor ' + d + ' Tagen';
  }

  function rowEl(n, unread) {
    const row = document.createElement('div');
    row.className = 'nina-news-row';
    const a = document.createElement('a');
    a.className = 'nina-news-item' + (unread ? ' unread' : '');
    // Straight to the show on Crunchyroll (search); AniList link in the tooltip.
    a.href = 'https://www.crunchyroll.com/de/search?q=' + encodeURIComponent(n.titleEn || n.title);
    a.title = n.title + (n.titleEn && n.titleEn !== n.title ? ' / ' + n.titleEn : '') + '\nAniList: ' + n.url;
    const img = document.createElement('img');
    img.alt = '';
    if (n.cover) img.src = n.cover;
    const text = document.createElement('div');
    text.className = 'nina-news-text';
    const t = document.createElement('span');
    t.className = 'nina-news-title';
    t.textContent = n.titleEn || n.title;
    const msg = document.createElement('span');
    msg.className = 'nina-news-msg';
    if (n.type === 'AIRING') {
      msg.append('Folge ');
      const b = document.createElement('b');
      b.textContent = n.episode;
      msg.append(b, ' ist erschienen');
    } else {
      msg.textContent = n.format === 'MOVIE' ? 'Neuer Film' : 'Neue Staffel / Fortsetzung';
    }
    const time = document.createElement('span');
    time.className = 'nina-news-time';
    time.textContent = ago(n.createdAt);
    text.append(t, msg, time);
    a.append(img, text);

    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'nina-news-mute';
    mute.title = 'Stummschalten – keine Neuigkeiten mehr zu dieser Serie';
    mute.innerHTML = BELL_OFF;
    mute.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setShown(n, false);
      render();
    });
    row.append(a, mute);
    return row;
  }

  let state = null;
  let stripShownAt = 0;

  function render() {
    const all = (state && state.items) || [];
    const items = all.filter((n) => !isMuted(n));
    const hiddenItems = all.filter((n) => isMuted(n));
    const readAt = (state && state.readAt) || 0;
    const unread = items.filter((n) => n.createdAt > readAt).length;

    const badge = $('nina-news-badge');
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : String(unread);

    const list = $('nina-news-list');
    list.textContent = '';
    if (!items.length) {
      const p = document.createElement('div');
      p.className = 'nina-news-empty';
      p.textContent = defaultOn
        ? 'Noch keine Neuigkeiten. AniList meldet neue Folgen für Serien, die du schaust, und neue Staffeln zu Serien auf deiner Liste.'
        : 'Keine Neuigkeiten von eingeschalteten Serien. Schalte Serien unten oder auf Crunchyroll (Glocke neben „Wertung“) ein.';
      list.appendChild(p);
    }
    for (const n of items) list.appendChild(rowEl(n, n.createdAt > readAt));

    // Muted shows, to switch them back on.
    const mutedList = $('nina-news-muted-list');
    mutedList.textContent = '';
    if (!defaultOn) {
      // Default off: the hidden news, each with "Einschalten".
      $('nina-news-muted-head').textContent = 'Ausgeschaltete Serien';
      const seen = new Set();
      const rows = hiddenItems.filter((n) => !seen.has(n.mediaId) && seen.add(n.mediaId));
      $('nina-news-muted-head').hidden = !rows.length;
      for (const n of rows) {
        const row = document.createElement('div');
        row.className = 'nina-news-row';
        const label = document.createElement('div');
        label.className = 'nina-news-item';
        const tt = document.createElement('span');
        tt.className = 'nina-news-title';
        tt.textContent = n.titleEn || n.title;
        label.appendChild(tt);
        const on = document.createElement('button');
        on.type = 'button';
        on.className = 'nina-news-unmute';
        on.textContent = 'Einschalten';
        on.addEventListener('click', () => { setShown(n, true); render(); });
        row.append(label, on);
        mutedList.appendChild(row);
      }
    }
    $('nina-news-muted-head').textContent = defaultOn ? 'Stummgeschaltet' : 'Ausgeschaltete Serien';
    const mutedEntries = defaultOn ? Object.entries(muted) : [];
    if (defaultOn) $('nina-news-muted-head').hidden = !mutedEntries.length;
    for (const [id, m] of mutedEntries) {
      const row = document.createElement('div');
      row.className = 'nina-news-row';
      const label = document.createElement('div');
      label.className = 'nina-news-item';
      const t = document.createElement('span');
      t.className = 'nina-news-title';
      t.textContent = m.title;
      label.appendChild(t);
      const un = document.createElement('button');
      un.type = 'button';
      un.className = 'nina-news-unmute';
      un.textContent = 'Wieder an';
      un.addEventListener('click', () => {
        delete muted[id];
        chrome.storage.sync.set({ [K_MUTED]: muted });
        render();
      });
      row.append(label, un);
      mutedList.appendChild(row);
    }

    // Cards: first appearance staggered right after the search bar's
    // fade-in; later re-renders appear without delay.
    const strip = $('nina-news-strip');
    const sig = stripOpts.count + 'x' + stripOpts.cols + '|' + items.slice(0, stripOpts.count).map((n) => n.id + ':' + (n.createdAt > readAt)).join(',');
    if (strip.dataset.sig === sig) return; // unchanged: don't restart the fade-in
    strip.dataset.sig = sig;
    const firstTime = !stripShownAt;
    if (firstTime && items.length) stripShownAt = Date.now();
    strip.textContent = '';
    // count / columns from the right-click menu (default: 3 side by side)
    const shown = items.slice(0, stripOpts.count);
    const cols = Math.max(1, Math.min(stripOpts.cols, shown.length || 1));
    // columns share the full width, so the cards line up with the search bar
    strip.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    shown.forEach((n, i) => {
      const row = rowEl(n, n.createdAt > readAt);
      if (firstTime) row.style.animationDelay = (0.45 + Math.min(i, 8) * 0.08) + 's';
      else row.style.animation = 'none', row.style.opacity = '1';
      strip.appendChild(row);
    });
  }

  function build() {
    // Bell, left of the bookmarks button.
    const bar = $('settings-btn');
    if (!bar) return false;
    const btn = document.createElement('button');
    btn.id = 'nina-news-btn';
    btn.className = 'w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-cyan-400 transition-colors duration-300 cursor-pointer bg-transparent border-0';
    btn.title = 'Anime-Neuigkeiten (AniList)';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 transition-transform duration-300 hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg><span id="nina-news-badge" hidden></span>';
    bar.insertBefore(btn, bar.firstChild);

    // Side panel like the page's settings drawer (same .drawer + backdrop).
    const panel = document.createElement('div');
    panel.id = 'nina-news-panel';
    panel.className = 'drawer p-6 md:p-8 drawer-scroll';
    panel.innerHTML = '<div class="nina-news-head"><h3>Anime-Neuigkeiten</h3><div class="nina-news-actions">' +
      '<button type="button" id="nina-news-refresh">Aktualisieren</button>' +
      '<button type="button" id="nina-news-close" title="Schließen">×</button></div></div>' +
      '<p class="nina-news-sub">Von AniList: neue Folgen von Serien, die du schaust, und neue Staffeln zu Serien auf deiner Liste. Über das durchgestrichene Glöckchen schaltest du eine Serie stumm.</p>' +
      '<div><div id="nina-news-list"></div>' +
      '<div id="nina-news-muted-head" class="nina-news-section" hidden>Stummgeschaltet</div>' +
      '<div id="nina-news-muted-list"></div></div>';
    document.body.appendChild(panel);
    const backdrop = $('drawer-backdrop');
    const openPanel = () => {
      if (backdrop) backdrop.classList.add('active');
      panel.classList.add('active');
      call('markNotificationsRead').then(() => { if (state) state.readAt = Date.now() + 1000; });
      setTimeout(() => { if (state) render(); }, 1500);
    };
    const closePanel = () => {
      if (!panel.classList.contains('active')) return;
      panel.classList.remove('active');
      const settingsOpen = $('settings-modal') && $('settings-modal').classList.contains('active');
      if (backdrop && !settingsOpen) backdrop.classList.remove('active');
    };

    // Newest three under the search field.
    const strip = document.createElement('div');
    strip.id = 'nina-news-strip';
    const header = $('searchHeader');
    if (header) header.insertAdjacentElement('afterend', strip);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel.classList.contains('active')) closePanel(); else openPanel();
    });
    $('nina-news-close').addEventListener('click', closePanel);
    if (backdrop) backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
    $('nina-news-refresh').addEventListener('click', async () => {
      $('nina-news-refresh').textContent = '…';
      const r = await call('notifications', { refresh: true });
      $('nina-news-refresh').textContent = 'Aktualisieren';
      if (r && r.ok) { state = r.result; render(); }
    });
    return true;
  }

  async function init() {
    const settings = await new Promise((r) => chrome.storage.sync.get([K_SHOW, K_MUTED, K_ENABLED, K_DEFAULT, K_STRIP], r));
    if (settings[K_STRIP]) stripOpts = { count: 3, cols: 3, ...settings[K_STRIP] };
    if (settings[K_SHOW] === false) return;
    muted = settings[K_MUTED] || {};
    enabled = settings[K_ENABLED] || {};
    defaultOn = settings[K_DEFAULT] !== 'off';
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'sync' || !(c[K_MUTED] || c[K_ENABLED] || c[K_DEFAULT] || c[K_STRIP])) return;
      if (c[K_STRIP]) stripOpts = { count: 3, cols: 3, ...(c[K_STRIP].newValue || {}) };
      if (c[K_MUTED]) muted = c[K_MUTED].newValue || {};
      if (c[K_ENABLED]) enabled = c[K_ENABLED].newValue || {};
      if (c[K_DEFAULT]) defaultOn = c[K_DEFAULT].newValue !== 'off';
      if ($('nina-news-list')) render();
    });
    const st = await call('status');
    if (!st || !st.ok || !st.result.connected) return;
    if (!build()) return;
    // Show what's stored right away, then refresh if it's old.
    const cached = await new Promise((r) => chrome.storage.local.get(['nina_anilist_notifs'], r));
    state = cached.nina_anilist_notifs || null;
    render();
    const r = await call('notifications', {});
    if (r && r.ok && r.result) { state = r.result; render(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
