// background.js — NINA Lite service worker.
// Trimmed copy of the speed / library parts of the main extension's
// background.js (no new tab, notes, Drive, AI text, hotkeys). When the main
// file's speed handling changes, mirror it here.

importScripts('lib/anilist-bg.js', 'lib/library-core.js', 'lib/library-providers.js', 'lib/partner-bg.js', 'lib/view-log-bg.js', 'lib/library-drive-sync.js');

const STREAMING_HOSTS = [
  'joyn.de', 'youtube.com', 'youtu.be', 'netflix.com',
  'primevideo.com', 'amazon.de', 'amazon.com', 'amazon.co.uk',
  'disneyplus.com', 'crunchyroll.com', 'dazn.com', 'twitch.tv',
  'ardmediathek.de', 'zdf.de', 'zdfmediathek.de', 'rtl.de',
  'rtlplus.com', 'tvnow.de', 'mubi.com', 'tv.apple.com',
  'paramount.com', 'paramountplus.com', 'peacocktv.com',
  'hbo.com', 'max.com', 'hulu.com', 'vimeo.com', 'dailymotion.com',
  'ard.de', '3sat.de', 'arte.tv', 'funimation.com', 'hidive.com',
  'wakanim.tv',
];

function isStreamingUrl(url) {
  if (!url || !/^https?:/i.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    return STREAMING_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch (_) {
    return false;
  }
}

// Toolbar icon: opens ui/popup.html (manifest action.default_popup).

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab || !tab.url || !isStreamingUrl(tab.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      files: ['content/speed-patch.js', 'content/audio-patch.js'],
    });
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content/frame-speed.js'],
    });
  } catch (_) {}

  // Process speed reset / persistence logic
  const url = tab.url;
  const platform = getPlatformFromUrl(url);
  if (!platform) return;

  const videoId = extractIdFromUrl(url, platform);
  const rawTitle = tab.title || '';
  const cleanedTitle = cleanTitle(rawTitle, platform);
  const showName = getShowName(cleanedTitle);

  chrome.storage.local.get(['tab_speeds'], (res) => {
    const tabSpeeds = res.tab_speeds || {};
    const current = tabSpeeds[tabId];

    if (current) {
      let speed = current.speed;
      let shouldUpdate = false;

      if (platform === 'youtube') {
        if (videoId && current.videoId !== videoId) {
          speed = 1.0;
          shouldUpdate = true;
        }
      } else if (platform === 'crunchyroll') {
        // Crunchyroll's tab title only holds the episode name, not the show,
        // so a title compare would reset on every episode. universal.js
        // detects series changes from the page's /series/ link instead.
      } else {
        const currentSeries = getSeriesName(current.showName);
        const newSeries = getSeriesName(showName);
        if (newSeries && currentSeries && currentSeries !== newSeries) {
          speed = 1.0;
          shouldUpdate = true;
        }
      }

      tabSpeeds[tabId] = {
        speed: speed,
        volume: current.volume !== undefined ? current.volume : 1.0,
        showName: showName || current.showName || '',
        videoId: videoId || current.videoId || '',
        platform: platform,
        url: url,
        crSeries: current.crSeries
      };

      chrome.storage.local.set({ tab_speeds: tabSpeeds });
    } else {
      tabSpeeds[tabId] = {
        speed: 1.0,
        volume: 1.0,
        showName: showName || '',
        videoId: videoId || '',
        platform: platform,
        url: url
      };
      chrome.storage.local.set({ tab_speeds: tabSpeeds });
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['tab_speeds'], (res) => {
    const tabSpeeds = res.tab_speeds || {};
    if (tabSpeeds[tabId]) {
      delete tabSpeeds[tabId];
      chrome.storage.local.set({ tab_speeds: tabSpeeds });
    }
  });
});

// ── Speed & volume on ANY website ────────────────────────────────────────────
// Streaming sites get the patch scripts via the manifest. Every other http(s)
// page gets them injected as soon as the side panel sets a speed or volume
// for that tab (and again after it navigates, while a value is set). The same
// scripts then apply it: speed-patch (playbackRate), audio-patch (gain up to
// 600 %), frame-speed (bridge from tab_speeds).
const patchedTabs = new Set();

async function injectPlaybackPatches(tabId) {
  if (patchedTabs.has(tabId)) return;
  patchedTabs.add(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      files: ['content/speed-patch.js', 'content/audio-patch.js'],
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content/frame-speed.js'],
    });
  } catch (_) {
    patchedTabs.delete(tabId); // e.g. chrome:// pages, Web Store
  }
}

const hasPlaybackSettings = (s) => !!s && ((s.volume !== undefined && Math.abs(s.volume - 1) > 0.001) || (s.speed !== undefined && Math.abs(s.speed - 1) > 0.001));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.tab_speeds) return;
  const now = changes.tab_speeds.newValue || {};
  const before = changes.tab_speeds.oldValue || {};
  for (const id of Object.keys(now)) {
    const tabId = Number(id);
    if (patchedTabs.has(tabId) || !hasPlaybackSettings(now[id])) continue;
    const a = now[id], b = before[id] || {};
    if (a.volume === b.volume && a.speed === b.speed) continue;
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !/^https?:/i.test(tab.url || '') || isStreamingUrl(tab.url)) return;
      injectPlaybackPatches(tabId);
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') { patchedTabs.delete(tabId); return; }
  if (changeInfo.status !== 'complete' || !tab || !/^https?:/i.test(tab.url || '') || isStreamingUrl(tab.url)) return;
  chrome.storage.local.get(['tab_speeds'], (res) => {
    if (hasPlaybackSettings((res.tab_speeds || {})[tabId])) injectPlaybackPatches(tabId);
  });
});
chrome.tabs.onRemoved.addListener((tabId) => patchedTabs.delete(tabId));

// Broadcast speed, volume, and fast-forward updates to all frames in all active streaming tabs
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  const speedChange = changes.joyn_speed;
  const volumeChange = changes.joyn_volume;
  const ffSpeedChange = changes.joyn_ff_speed;

  if (speedChange || volumeChange || ffSpeedChange) {
    chrome.tabs.query({}, (tabs) => {
      const msg = {
        type: 'USC_SPEED_UPDATE',
        speed: speedChange ? speedChange.newValue : undefined,
        volume: volumeChange ? volumeChange.newValue : undefined,
        ffSpeed: ffSpeedChange ? ffSpeedChange.newValue : undefined,
      };

      for (const tab of tabs) {
        if (isStreamingUrl(tab.url)) {
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {
            // Ignore error for tabs where the content script isn't loaded
          });
        }
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // NINA card on a streaming site → "Meine Serien" (a show's page)
  if (message.type === 'NINA_OPEN_LIBRARY') {
    const hash = message.hash ? '#' + String(message.hash).replace(/[^\w%:\-./]/g, '') : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/library.html') + hash });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'NINA_OPEN_OPTIONS') {
    const hash = message.hash ? '#' + String(message.hash).replace(/[^\w-]/g, '') : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('ui/options.html') + hash });
    sendResponse({ ok: true });
    return false;
  }

  // Google sign-in (Drive sync of the watch status): see googleToken() below
  if (message.type === 'NINA_GET_TOKEN') {
    googleToken(!!message.interactive)
      .then((token) => sendResponse({ token }))
      .catch((e) => sendResponse({ error: e.message || String(e) }));
    return true; // async
  }

  if (message.type === 'NINA_REVOKE_TOKEN') {
    googleSignOut(message.token).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'NINA_WINDOW_FULLSCREEN') {
    const windowId = sender.tab && sender.tab.windowId;
    if (windowId === undefined) { sendResponse({ ok: false }); return false; }
    chrome.storage.session.get(['nina_prev_window_state'], (res) => {
      const prev = res.nina_prev_window_state || {};
      chrome.windows.get(windowId, (win) => {
        if (chrome.runtime.lastError || !win) { sendResponse({ ok: false }); return; }
        if (message.on) {
          if (win.state !== 'fullscreen') {
            prev[windowId] = win.state;
            chrome.storage.session.set({ nina_prev_window_state: prev });
          }
          chrome.windows.update(windowId, { state: 'fullscreen' }, () => sendResponse({ ok: !chrome.runtime.lastError }));
        } else {
          const state = prev[windowId];
          delete prev[windowId];
          chrome.storage.session.set({ nina_prev_window_state: prev });
          if (win.state !== 'fullscreen' || !state) { sendResponse({ ok: true }); return; }
          chrome.windows.update(windowId, { state }, () => sendResponse({ ok: !chrome.runtime.lastError }));
        }
      });
    });
    return true;
  }

  if (message.type === 'GET_TAB_SETTINGS') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get(['tab_speeds', 'joyn_ff_speed'], (res) => {
        const tabSpeeds = res.tab_speeds || {};
        const settings = tabSpeeds[tabId] || { speed: 1.0, volume: 1.0 };
        const ffSpeed = parseFloat(res.joyn_ff_speed) || 2.0;
        sendResponse({
          tabId: tabId,
          speed: settings.speed,
          volume: settings.volume,
          ffSpeed: ffSpeed
        });
      });
      return true; // Keep channel open for async response
    } else {
      sendResponse(null);
    }
    return;
  }

});

function normalizeTitleForMatching(title) {
  if (!title) return '';
  let t = title.toLowerCase();
  // Insert space between letters and numbers (e.g. S01E01 -> S 01 E 01)
  t = t.replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2');
  // Remove quotes
  t = t.replace(/['"’“”„]/g, '');
  // Normalize season/episode keywords with numbers
  t = t.replace(/\b(staffel|season|st|s)\.?\s*0*(\d+)\b/g, 'season $2');
  t = t.replace(/\b(folge|episode|ep|flg|e)\.?\s*0*(\d+)\b/g, 'episode $2');
  // Replace non-alphanumeric chars with space
  t = t.replace(/[\s\-_|:()[\].,;!?]+/g, ' ');
  return t.trim();
}

function cleanShowName(name) {
  if (!name) return '';
  return name
    .replace(/\b(dub|sub|sync|synchro|synchronisation|synchronisiert|german|deutsch|eng|english|omav|original)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlatformFromUrl(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube';
    } else if (hostname.includes('netflix.com')) {
      return 'netflix';
    } else if (hostname.includes('crunchyroll.com')) {
      return 'crunchyroll';
    } else if (hostname.includes('disneyplus.com')) {
      return 'disneyplus';
    } else if (hostname.includes('primevideo.com') || hostname.includes('amazon.')) {
      if (hostname.includes('primevideo.com') || 
          new URL(url).pathname.includes('/video/') || 
          new URL(url).pathname.includes('/dp/') || 
          new URL(url).pathname.includes('/gp/product/')) {
        return 'primevideo';
      }
    }
  } catch (_) {}
  return null;
}

function extractIdFromUrl(url, platform) {
  if (!url || !platform) return null;
  try {
    const urlObj = new URL(url);
    if (platform === 'youtube') {
      if (urlObj.pathname.startsWith('/shorts/')) {
        return urlObj.pathname.split('/shorts/')[1].split(/[?#]/)[0];
      }
      return urlObj.searchParams.get('v');
    } else if (platform === 'netflix') {
      const match = urlObj.pathname.match(/\/watch\/(\d+)/);
      return match ? match[1] : null;
    } else if (platform === 'crunchyroll') {
      const match = urlObj.pathname.match(/\/watch\/([a-z0-9]+)/i);
      return match ? match[1] : null;
    } else if (platform === 'disneyplus') {
      const match = urlObj.pathname.match(/\/(video|play)\/([a-z0-9-]+)/i);
      return match ? match[2] : null;
    } else if (platform === 'primevideo') {
      const asin = urlObj.searchParams.get('asin') || urlObj.searchParams.get('itemId') || urlObj.searchParams.get('gti');
      if (asin) return asin;
      const match = urlObj.pathname.match(/\/(?:detail|play|watch|dp|gp\/video\/detail|gp\/video\/play|video\/detail|video\/play|gp\/product)\/(?:[a-zA-Z0-9_=-]+\/)*(amzn1\.dv\.gti\.[a-fA-F0-9-]+|[a-zA-Z0-9]{10,30})/);
      return match ? match[1] : null;
    }
  } catch (_) {}
  return null;
}

function cleanTitle(title, platform) {
  if (!title) return '';
  let t = title;
  if (platform === 'youtube') {
    t = t.replace(/\s*-\s*YouTube$/i, '');
  } else if (platform === 'netflix') {
    t = t.replace(/^Netflix\s*-\s*/i, '').replace(/\s*\|\s*Netflix$/i, '');
  } else if (platform === 'crunchyroll') {
    t = t.replace(/\s*-\s*Watch on Crunchyroll$/i, '');
  } else if (platform === 'disneyplus') {
    t = t.replace(/^Watch\s+/i, '').replace(/\s*\|\s*Disney\+$/i, '');
  } else if (platform === 'primevideo') {
    t = t.replace(/^(?:Amazon\.[a-z.]{2,6}:\s*|Prime Video:\s*)/i, '');
    t = t.replace(/\s*[-|]\s*Prime Video$/i, '');
    t = t.replace(/\s+(?:ansehen|watch|online\s+leihen|kaufen)\s*$/i, '');
  }
  return t.trim();
}

function getShowName(cleanTitle) {
  if (!cleanTitle) return '';
  const parts = cleanTitle.split(/[:\-|–]/);
  if (parts.length > 0) {
    return cleanShowName(normalizeTitleForMatching(parts[0]));
  }
  return '';
}

function getSeriesName(showName) {
  if (!showName) return '';
  let s = showName.toLowerCase();
  // Strip common season/episode/volume/book/volume indicators followed by numbers
  s = s.replace(/\b(?:season|staffel|st|s|book|buch|vol|volume)\s*\d+\b/g, '');
  s = s.replace(/\b(?:episode|folge|ep|e|flg)\s*\d+\b/g, '');
  // Strip standalone numbers (often episode/season/year numbers)
  s = s.replace(/\b\d+\b/g, '');
  // Clean up extra spaces
  return s.replace(/\s+/g, ' ').trim();
}

// ── Google sign-in ───────────────────────────────────────────────────────────
// Desktop Chrome: chrome.identity.getAuthToken with the extension's own OAuth
// client (manifest "oauth2"). Android Chromium browsers (Lemur, Kiwi …) have
// no Google account in the browser, so getAuthToken fails or never answers.
// There the sign-in falls back to launchWebAuthFlow (a Google login window)
// with a "Web application" OAuth client whose redirect URI is
// chrome.identity.getRedirectURL() — its client id is entered once in the
// settings (synced as nina_google_web_client_id). Token + expiry are cached.
const G_WEB_CLIENT = 'nina_google_web_client_id';   // sync
const G_WEB_TOKEN = 'nina_google_web_token';        // local: { token, expiresAt }
// the project's Web-application client (redirect https://<extension id>.chromiumapp.org/); a client id is not a secret
const G_DEFAULT_WEB_CLIENT = '787110895260-usi580p6dk028tmqi6fn6cddiphnau2o.apps.googleusercontent.com';
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const G_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'];

function chromeToken(interactive) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || !chrome.identity.getAuthToken) { reject(new Error('getAuthToken nicht verfügbar')); return; }
    // some browsers never call back: give up after a while
    const timer = setTimeout(() => reject(new Error('Keine Antwort vom Browser')), interactive ? 20000 : 5000);
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !token) reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Kein Token erhalten'));
        else resolve(token);
      });
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

// The login window of launchWebAuthFlow never opens in some Android browsers
// (Lemur), the call just hangs. There the Google login runs in a normal tab:
// Google redirects to https://<id>.chromiumapp.org/#access_token=… — that page
// doesn't exist, but the tab's URL still shows up in tabs.onUpdated, where the
// token is taken and the tab closed. The listener is top-level so it also
// works when the service worker was restarted while the user was logging in;
// the result goes to storage, which the waiting promise (and the settings
// page) watch. "state" ties the redirect to a login NINA started.
const G_PENDING = 'nina_google_auth_pending';       // local: { state, until }
const G_RESULT = 'nina_google_auth_result';         // local: { state, ok, error }

function saveRedirect(url, state) {
  const params = new URLSearchParams((url || '').split('#')[1] || '');
  const token = params.get('access_token');
  if (state && params.get('state') !== state) return { error: 'Ungültige Antwort von Google' };
  if (!token) return { error: params.get('error') || 'Anmeldung abgebrochen' };
  const expiresAt = Date.now() + (parseInt(params.get('expires_in'), 10) || 3600) * 1000;
  return { token, expiresAt };
}

// Several sources, because browsers differ in what they report for a page
// that fails to load (the redirect host doesn't exist): tab updates, the
// navigation events (also fire for error pages) and a poll during the login.
let redirectBusy = false;
async function handleRedirect(tabId, url) {
  if (redirectBusy || !url || !chrome.identity || !url.startsWith(chrome.identity.getRedirectURL())) return;
  redirectBusy = true;
  try {
    const { [G_PENDING]: pending } = await chrome.storage.local.get([G_PENDING]);
    if (!pending || pending.until < Date.now()) return;
    await chrome.storage.local.remove(G_PENDING);
    if (tabId >= 0) chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
    const res = saveRedirect(url, pending.state);
    const patch = { [G_RESULT]: { state: pending.state, ok: !!res.token, error: res.error || '' } };
    if (res.token) Object.assign(patch, { [G_WEB_TOKEN]: { token: res.token, expiresAt: res.expiresAt }, nina_drive_connected: true });
    await chrome.storage.local.set(patch);
    if (res.token && self.ninaLibrarySync) self.ninaLibrarySync();
  } finally {
    redirectBusy = false;
  }
}
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  handleRedirect(tabId, info.url || (tab && (tab.url || tab.pendingUrl)) || '');
});
if (chrome.webNavigation) {
  const filter = { url: [{ hostSuffix: 'chromiumapp.org' }] };
  for (const evName of ['onBeforeNavigate', 'onCommitted', 'onErrorOccurred']) {
    if (chrome.webNavigation[evName]) chrome.webNavigation[evName].addListener((d) => { if (d.frameId === 0) handleRedirect(d.tabId, d.url); }, filter);
  }
}

async function tabAuthFlow(url, state, interactive) {
  await chrome.storage.local.set({ [G_PENDING]: { state, until: Date.now() + 10 * 60000 } });
  const tab = await chrome.tabs.create({ url, active: interactive });
  const poll = setInterval(() => {
    chrome.tabs.get(tab.id, (t) => { if (!chrome.runtime.lastError && t) handleRedirect(t.id, t.url || t.pendingUrl || ''); });
  }, 700);
  return new Promise((resolve, reject) => {
    const finish = (err) => {
      clearTimeout(timer);
      clearInterval(poll);
      chrome.storage.onChanged.removeListener(onChange);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (err) reject(err); else chrome.storage.local.get([G_WEB_TOKEN], (s) => resolve(s[G_WEB_TOKEN].token));
    };
    const onChange = (changes, area) => {
      const v = area === 'local' && changes[G_RESULT] && changes[G_RESULT].newValue;
      if (!v || v.state !== state) return;
      finish(v.ok ? null : new Error(v.error));
    };
    const onRemoved = (id) => {
      if (id !== tab.id) return;
      // closed by us after the redirect: the result follows via storage
      setTimeout(() => chrome.storage.local.get([G_PENDING], (r) => {
        if (r[G_PENDING] && r[G_PENDING].state === state) { chrome.storage.local.remove(G_PENDING); finish(new Error('Anmeldung abgebrochen')); }
      }), 1500);
    };
    const timer = setTimeout(() => {
      chrome.tabs.remove(tab.id, () => void chrome.runtime.lastError);
      chrome.storage.local.remove(G_PENDING);
      finish(new Error(interactive ? 'Zeitüberschreitung bei der Anmeldung' : 'Stille Anmeldung nicht möglich'));
    }, interactive ? 5 * 60000 : 20000);
    chrome.storage.onChanged.addListener(onChange);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function withTimeout(promise, ms, message) {
  let t;
  return Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(t));
}

async function webToken(interactive) {
  const store = await chrome.storage.local.get([G_WEB_TOKEN]);
  const cached = store[G_WEB_TOKEN];
  if (cached && cached.token && cached.expiresAt > Date.now() + 60000) return cached.token;
  const clientId = ((await chrome.storage.sync.get([G_WEB_CLIENT]))[G_WEB_CLIENT] || '').trim() || G_DEFAULT_WEB_CLIENT;
  const state = crypto.randomUUID();
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: G_SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
    ...(interactive ? { prompt: 'select_account' } : { prompt: 'none' })
  });
  if (IS_ANDROID) return tabAuthFlow(url, state, interactive);
  const redirect = await withTimeout(chrome.identity.launchWebAuthFlow({ url, interactive }),
    interactive ? 5 * 60000 : 15000, 'Keine Antwort vom Login-Fenster');
  const res = saveRedirect(redirect, state);
  if (!res.token) throw new Error(res.error);
  await chrome.storage.local.set({ [G_WEB_TOKEN]: { token: res.token, expiresAt: res.expiresAt } });
  return res.token;
}

async function googleToken(interactive) {
  const { [G_WEB_CLIENT]: webClient } = await chrome.storage.sync.get([G_WEB_CLIENT]);
  // phones (no Google account in the browser) and a hand-entered web client use
  // the login window; desktop Chrome uses its own account, and falls back to
  // the login window if that fails
  if (webClient || IS_ANDROID) return webToken(interactive);
  try { return await chromeToken(interactive); } catch (_) { return webToken(interactive); }
}

async function googleSignOut(token) {
  const { [G_WEB_TOKEN]: cached } = await chrome.storage.local.get([G_WEB_TOKEN]);
  const tokens = [token, cached && cached.token].filter(Boolean);
  for (const t of new Set(tokens)) {
    fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=' + encodeURIComponent(t)
    }).catch(() => {});
    try { chrome.identity.removeCachedAuthToken({ token: t }, () => void chrome.runtime.lastError); } catch (_) {}
  }
  await chrome.storage.local.remove(G_WEB_TOKEN);
}

// token for the Drive sync of "Meine Serien" (lib/library-drive-sync.js)
self.ninaGoogleToken = googleToken;
