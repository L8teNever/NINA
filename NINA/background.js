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
  if (!tab || !isStreamingUrl(tab.url)) return;

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
});
