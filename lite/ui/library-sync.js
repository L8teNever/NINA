// library-sync.js — NINA Lite: fetch the watch status from Google Drive when
// "Meine Serien" opens (library.js re-renders on the storage change).
try { chrome.runtime.sendMessage({ type: 'NINA_DRIVE_PULL' }, () => void chrome.runtime.lastError); } catch (_) {}
