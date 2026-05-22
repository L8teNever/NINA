// joyn.js — Headless content script for joyn.de.
// Auto-skip toast handler only. Speed/volume enforcement lives in
// frame-speed.js + speed-patch.js.

(function () {
  'use strict';

  let autoSkipEnabled = true;

  chrome.storage.local.get('joyn_autoskip', (res) => {
    autoSkipEnabled = res.joyn_autoskip !== undefined ? !!res.joyn_autoskip : true;
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.joyn_autoskip && changes.joyn_autoskip.newValue !== undefined) {
      autoSkipEnabled = !!changes.joyn_autoskip.newValue;
    }
  });

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'usc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.classList.add('usc-toast-show');
      setTimeout(() => {
        t.classList.remove('usc-toast-show');
        setTimeout(() => t.remove(), 400);
      }, 1800);
    });
  }

  const SKIP_SELECTOR =
    '.skip-intro, .skipIntro, [data-uia="skip-intro"], [data-testid*="skip"], ' +
    '[aria-label*="skip" i], [aria-label*="überspringen" i]';

  let lastSkipTime = 0;
  const SKIP_COOLDOWN = 5000;

  function autoSkipTick() {
    if (!autoSkipEnabled) return;
    if (Date.now() - lastSkipTime < SKIP_COOLDOWN) return;

    const skip = document.querySelector(SKIP_SELECTOR);
    if (!skip) return;
    const visible = skip.offsetParent !== null || skip.getBoundingClientRect().width > 0;
    if (!visible) return;

    lastSkipTime = Date.now();
    skip.click();
    showToast('⏭ Intro übersprungen');
  }

  setInterval(autoSkipTick, 800);
})();
