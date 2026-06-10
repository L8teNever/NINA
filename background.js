// background.js — Service worker
// Opens the side panel on toolbar click and re-injects speed/frame scripts
// after SPA navigations on streaming sites.

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

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) chrome.sidePanel.open({ tabId: tab.id });
});

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
        url: url
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



// ── Einstellungen geräteübergreifend anwenden ────────────────────────────────
// Das Master-Objekt 'nina-settings' liegt in chrome.storage.sync und wird von
// Chrome automatisch über alle Geräte mit demselben Konto abgeglichen.
// Die Content-Skripte lesen jedoch einzelne joyn_*-Schlüssel aus storage.local.
// Deshalb spiegeln wir die synchronisierten Werte auf JEDEM Gerät nach local,
// sobald sie sich ändern (bzw. beim Start des Service Workers).
const NINA_SETTINGS_KEY = 'nina-settings';

function mirrorSyncedSettingsToLocal(settings) {
  if (!settings) return;
  const local = {};
  if (settings.pauseOnOpen !== undefined)     local.joyn_pause_on_open = !!settings.pauseOnOpen;
  if (settings.autoSkip !== undefined)        local.joyn_autoskip = !!settings.autoSkip;
  if (settings.autoSkipDelay !== undefined)   local.joyn_autoskip_delay = settings.autoSkipDelay;
  if (settings.dislikes !== undefined)        local.joyn_show_dislikes = !!settings.dislikes;
  if (settings.speedTimer !== undefined)      local.joyn_show_timer = !!settings.speedTimer;
  if (settings.sponsorBlock !== undefined)    local.joyn_sponsorblock_enabled = !!settings.sponsorBlock;
  if (settings.thanksDownload !== undefined)  local.joyn_show_thanks_download = !!settings.thanksDownload;
  if (settings.autoLike !== undefined)        local.joyn_autolike_enabled = !!settings.autoLike;
  if (settings.autoLikePercent !== undefined) local.joyn_autolike_threshold = settings.autoLikePercent;
  if (settings.hideXRay !== undefined)        local.joyn_hide_xray = !!settings.hideXRay;
  if (settings.ffSpeed !== undefined)         local.joyn_ff_speed = settings.ffSpeed;
  if (settings.language !== undefined)        local.joyn_language = settings.language;
  
  // Mirror keys for overlay-search.js
  if (settings.shortcuts !== undefined)              local.bookmarks = settings.shortcuts;
  if (settings.chromeBookmarks !== undefined)        local.useChromeFavorites = settings.chromeBookmarks;
  if (settings.chromeFilterMode !== undefined)       local.chromeBookmarkFilterMode = settings.chromeFilterMode;
  if (settings.chromeFilterList !== undefined)       local.chromeBookmarkFilterList = settings.chromeFilterList;

  if (Object.keys(local).length) chrome.storage.local.set(local);
}

function refreshSettingsMirror() {
  chrome.storage.sync.get([NINA_SETTINGS_KEY], (res) => {
    if (chrome.runtime.lastError) return;
    mirrorSyncedSettingsToLocal(res[NINA_SETTINGS_KEY]);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[NINA_SETTINGS_KEY]) {
    mirrorSyncedSettingsToLocal(changes[NINA_SETTINGS_KEY].newValue);
  }
});

chrome.runtime.onStartup.addListener(refreshSettingsMirror);
chrome.runtime.onInstalled.addListener(refreshSettingsMirror);

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NINA_OPEN_NOTES_TAB') {
    let url = 'ui/notes.html';
    if (message.noteId) {
      url += '?noteId=' + encodeURIComponent(message.noteId);
    }
    chrome.tabs.create({ url: chrome.runtime.getURL(url) });
    sendResponse({ ok: true });
    return true;
  }

  // Google Drive Auth – chrome.identity nur im Background verfügbar
  if (message.type === 'NINA_GET_TOKEN') {
    chrome.identity.getAuthToken({ interactive: message.interactive || false }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true; // async
  }

  if (message.type === 'NINA_REVOKE_TOKEN') {
    if (message.token) {
      // POST statt GET damit Token nicht in URLs/Logs landet
      fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(message.token)}`
      }).catch(() => {});
      chrome.identity.removeCachedAuthToken({ token: message.token }, () => sendResponse({ ok: true }));
    } else {
      sendResponse({ ok: true });
    }
    return true;
  }

  if (message.type === 'NINA_IMPROVE_TEXT') {
    const { text, settings } = message;
    chrome.storage.sync.get(['gemini_api_key'], (syncRes) => {
      const apiKey = syncRes.gemini_api_key;
      if (!apiKey) {
        sendResponse({ error: 'Kein API-Key konfiguriert. Bitte trage einen Gemini API-Key in den Nina-Einstellungen ein.' });
        return;
      }
      callGeminiApi(text, apiKey, settings)
        .then((resultText) => {
          sendResponse({ success: true, text: resultText });
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
    });
    return true; // Keep channel open for async response
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

async function callGeminiApi(text, apiKey, settings) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  let systemInstruction = "Du bist ein präziser Text-Korrektor. Deine Aufgabe ist es, den bereitgestellten Text zu korrigieren. Gib ausschließlich den korrigierten Text zurück, ohne Kommentare, ohne Einleitung, ohne Anführungszeichen und ohne Markdown-Formatierung. Wenn keine Korrekturen notwendig sind, gib den Text exakt unverändert zurück.";
  
  if (settings.aiTextSpelling && !settings.aiTextPunctuation) {
    systemInstruction += " Korrigiere NUR Tippfehler und die Rechtschreibung der einzelnen Wörter. Lass den Satzbau und die Zeichensetzung (Kommas, Punkte) unverändert.";
  } else if (!settings.aiTextSpelling && settings.aiTextPunctuation) {
    systemInstruction += " Korrigiere NUR die Zeichensetzung (füge korrekte Kommas und Punkte hinzu). Lass den Satzbau und die Schreibweise der Wörter unverändert.";
  } else if (settings.aiTextSpelling && settings.aiTextPunctuation) {
    systemInstruction += " Korrigiere Rechtschreibung, Tippfehler und Zeichensetzung (Kommas/Punkte). Verändere den grundlegenden Satzbau nicht.";
  }
  
  if (settings.aiTextCustomActive && settings.aiTextCustomPrompt) {
    systemInstruction += ` Berücksichtige zusätzlich diese Anweisung: ${settings.aiTextCustomPrompt}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: text
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: systemInstruction
          }
        ]
      },
      generationConfig: {
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `API-Fehler (${response.status})`;
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resultText) {
    throw new Error("Ungültige Antwort von der Gemini API.");
  }
  
  return resultText.trim();
}


