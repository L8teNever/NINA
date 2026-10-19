// library-sync.js — ask the background to sync "Meine Serien" with Google
// Drive when the library opens (lib/library-drive-sync.js); library.js
// re-renders by itself when the merged data lands in storage.
try { chrome.runtime.sendMessage({ type: 'NINA_DRIVE_PULL' }, () => void chrome.runtime.lastError); } catch (_) {}
