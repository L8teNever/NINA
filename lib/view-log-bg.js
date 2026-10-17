// view-log-bg.js — "when did I watch this?" for every episode and film.
//
// The services only keep ONE state per episode (started / watched + the last
// position). This keeps a list of viewing dates next to it, in
// chrome.storage.local 'nina_view_log':
//   'cr:<episode id>'  /  'st:<entry key>'  →  { v: [ts …], arm?, armPos? }
//   'ed:<show key>|<abs>'                    →  { v: [ts …] }  (set by hand in Meine Serien,
//                                                 replaces what was recorded)
//
// A view is recorded when an episode becomes "watched". Watching it AGAIN is
// only counted when it really is played again: an already watched episode is
// "armed" when it is played in its first half, and the second view is
// recorded when it then reaches the end — with real playing time in between
// (seeking to the end or briefly opening the episode doesn't count, 2× speed
// does).

(function () {
  'use strict';
  const LOG_KEY = 'nina_view_log';
  const SOURCES = { nina_cr_watch_status: 'cr:', nina_stream_watch_status: 'st:' };
  const SAME_VIEW = 2 * 3600e3;    // two "watched" within 2 h are the same viewing
  const ARM_TTL = 2 * 864e5;       // a restart that isn't finished within 2 days is forgotten

  let threshold = 90;
  chrome.storage.local.get(['joyn_yt_watched_threshold'], (r) => {
    const t = parseFloat(r.joyn_yt_watched_threshold);
    if (isFinite(t)) threshold = t;
  });

  const passive = (e) => !!(e && (e.fromPage || e.via || e.fromAnilist));
  const posOf = (e) => (isFinite(e.resumeAt) ? +e.resumeAt : +e.lastPosition || 0); // CR keeps lastPosition at the furthest point
  const addView = (L, at) => {
    if (L.v.some((x) => Math.abs(x - at) < SAME_VIEW)) return false;
    L.v.push(at);
    L.v.sort((a, b) => a - b);
    return true;
  };

  function step(log, key, o, n, now) {
    if (!n) { const had = key in log; delete log[key]; return had; }
    if (passive(n) && !n.byHand) return false;
    const L = log[key] ? { v: (log[key].v || []).slice(), arm: log[key].arm, armPos: log[key].armPos } : { v: [] };
    let changed = false;
    if (n.status === 'watched' && (!o || o.status !== 'watched')) {
      // first time (or ticked again): the moment it became watched
      changed = addView(L, n.updatedAt || now);
      delete L.arm; delete L.armPos;
    } else if (n.status === 'watched' && o && o.status === 'watched' && n.duration > 60) {
      const pos = posOf(n), dur = +n.duration, frac = pos / dur;
      const fin = Math.min(threshold, 85) / 100;
      if (L.arm && now - L.arm > ARM_TTL) { delete L.arm; delete L.armPos; changed = true; }
      if (frac < 0.5 && pos > 3) {
        // played again from (near) the start: armed — or re-armed after jumping back
        if (!L.arm || pos < (L.armPos || 0) - 30) { L.arm = now; L.armPos = pos; changed = true; }
      } else if (frac >= fin && L.arm) {
        const played = pos - (L.armPos || 0), elapsed = (now - L.arm) / 1000;
        if (played >= dur * 0.4 && elapsed >= played * 0.3) addView(L, now);
        delete L.arm; delete L.armPos;
        changed = true;
      }
    }
    if (changed) log[key] = L;
    return changed;
  }

  let queue = Promise.resolve();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.joyn_yt_watched_threshold) { const t = parseFloat(changes.joyn_yt_watched_threshold.newValue); if (isFinite(t)) threshold = t; }
    const hit = Object.keys(SOURCES).filter((k) => changes[k]);
    if (!hit.length) return;
    queue = queue.then(() => new Promise((done) => {
      chrome.storage.local.get([LOG_KEY], (r) => {
        const log = r[LOG_KEY] || {};
        const now = Date.now();
        let changed = false;
        for (const k of hit) {
          const before = changes[k].oldValue || {}, after = changes[k].newValue || {};
          for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
            const o = before[id], n = after[id];
            if (o === n || (o && n && o.status === n.status && o.lastPosition === n.lastPosition && o.resumeAt === n.resumeAt && o.updatedAt === n.updatedAt)) continue;
            if (id.startsWith('season:')) continue;
            if (step(log, SOURCES[k] + id, o, n, now)) changed = true;
          }
        }
        if (changed) chrome.storage.local.set({ [LOG_KEY]: log }, done); else done();
      });
    })).catch(() => {});
  });
})();
