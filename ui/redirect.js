// The new tab override can't be switched off in the manifest, so this page
// decides: NINA's start page only if the user turned it on in the settings
// (off by default), otherwise hand the tab back to Chrome's own new tab page.
chrome.storage.sync.get(['nina_newtab_enabled'], (res) => {
  if (res.nina_newtab_enabled === true) {
    window.location.replace(chrome.runtime.getURL('ui/newtab.html'));
    return;
  }
  chrome.tabs.getCurrent((tab) => {
    const url = 'chrome://new-tab-page/';
    if (tab) chrome.tabs.update(tab.id, { url });
    else chrome.tabs.update({ url });
  });
});
