// crunchyroll-settings.js — "Crunchyroll" section of the options page (and
// the "Vollbild" switch under Wiedergabe).
//  • data-cr-opt="x"     -> key x in the object chrome.storage.sync.nina_cr_options
//                           (read by the Crunchyroll content scripts)
//  • data-sync-bool="k"  -> plain boolean chrome.storage.sync[k]
//  • #cr-master-toggle   -> mirrors the existing "Auch auf Crunchyroll" switch
//                           (#toggleWatchStatusCrunchyroll), which options.js
//                           saves and syncs.
// All switches default to on.

(function () {
  'use strict';

  const OPTS_KEY = 'nina_cr_options';
  const $ = (id) => document.getElementById(id);

  function init() {
    const optInputs = [...document.querySelectorAll('[data-cr-opt]')];
    const boolInputs = [...document.querySelectorAll('[data-sync-bool]')];
    const keys = [OPTS_KEY, ...boolInputs.map((i) => i.dataset.syncBool)];

    chrome.storage.sync.get(keys, (res) => {
      const opts = res[OPTS_KEY] || {};
      // data-default-off: switches that start off (only true when saved as true)
      for (const input of optInputs) {
        input.checked = input.hasAttribute('data-default-off') ? opts[input.dataset.crOpt] === true : opts[input.dataset.crOpt] !== false;
      }
      for (const input of boolInputs) {
        input.checked = input.hasAttribute('data-default-off') ? res[input.dataset.syncBool] === true : res[input.dataset.syncBool] !== false;
      }
    });

    for (const input of optInputs) {
      input.addEventListener('change', () => {
        chrome.storage.sync.get([OPTS_KEY], (res) => {
          const opts = { ...(res[OPTS_KEY] || {}), [input.dataset.crOpt]: input.checked };
          chrome.storage.sync.set({ [OPTS_KEY]: opts });
        });
      });
    }
    for (const input of boolInputs) {
      input.addEventListener('change', () => chrome.storage.sync.set({ [input.dataset.syncBool]: input.checked }));
    }

    // Selects in the same options object ('off' is stored as false).
    for (const sel of document.querySelectorAll('[data-cr-opt-select]')) {
      const key = sel.dataset.crOptSelect;
      chrome.storage.sync.get([OPTS_KEY], (res) => {
        const v = (res[OPTS_KEY] || {})[key];
        sel.value = v === false ? 'off' : (v || sel.options[0].value);
      });
      sel.addEventListener('change', () => {
        chrome.storage.sync.get([OPTS_KEY], (res) => {
          const opts = { ...(res[OPTS_KEY] || {}), [key]: sel.value === 'off' ? false : sel.value };
          chrome.storage.sync.set({ [OPTS_KEY]: opts });
        });
      });
    }

    // Master switch = the existing Crunchyroll watch-status setting.
    const master = $('cr-master-toggle');
    const original = $('toggleWatchStatusCrunchyroll');
    if (master && original) {
      const syncFromOriginal = () => { master.checked = original.checked; };
      // options.js fills the original after loading settings.
      setTimeout(syncFromOriginal, 300);
      setTimeout(syncFromOriginal, 1200);
      original.addEventListener('change', syncFromOriginal);
      master.addEventListener('change', () => {
        if (original.checked === master.checked) return;
        original.checked = master.checked;
        original.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // Languages under the shows: Synchro and Untertitel separately.
    //   select[data-cr-lang-mode="langAudio|langSubs"]  -> 'picked' | 'all' | 'off'
    //   [data-cr-lang-pick="langPickAudio|langPickSubs"] -> chips (chosen codes)
    const LANGS = [
      ['de-DE', 'Deutsch'], ['ja-JP', 'Japanisch'], ['en-US', 'Englisch'], ['fr-FR', 'Französisch'],
      ['es-ES', 'Spanisch'], ['es-419', 'Spanisch (LA)'], ['it-IT', 'Italienisch'], ['pt-BR', 'Portugiesisch (BR)'],
      ['ru-RU', 'Russisch'], ['ar-SA', 'Arabisch'], ['pl-PL', 'Polnisch'], ['hi-IN', 'Hindi'],
      ['ko-KR', 'Koreanisch'], ['zh-CN', 'Chinesisch'], ['th-TH', 'Thai'], ['vi-VN', 'Vietnamesisch'],
      ['id-ID', 'Indonesisch'], ['ms-MY', 'Malaiisch'], ['tr-TR', 'Türkisch'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu']
    ];
    const saveOpt = (patch) => chrome.storage.sync.get([OPTS_KEY], (res) => {
      chrome.storage.sync.set({ [OPTS_KEY]: { ...(res[OPTS_KEY] || {}), ...patch } });
    });
    chrome.storage.sync.get([OPTS_KEY], (res) => {
      const opts = res[OPTS_KEY] || {};
      const legacy = opts.languages === false ? 'off' : opts.languages === 'all' ? 'all' : 'picked';

      for (const sel of document.querySelectorAll('[data-cr-lang-mode]')) {
        const key = sel.dataset.crLangMode;
        sel.value = opts[key] || legacy;
        sel.addEventListener('change', () => saveOpt({ [key]: sel.value }));
      }

      for (const box of document.querySelectorAll('[data-cr-lang-pick]')) {
        const key = box.dataset.crLangPick;
        let picked = Array.isArray(opts[key]) && opts[key].length ? opts[key]
          : (Array.isArray(opts.langPick) && opts.langPick.length ? opts.langPick : box.dataset.default.split(','));
        const render = () => {
          box.textContent = '';
          for (const [code, name] of LANGS) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cr-lang-chip' + (picked.includes(code) ? ' on' : '');
            b.textContent = name;
            b.addEventListener('click', () => {
              picked = picked.includes(code) ? picked.filter((c) => c !== code) : [...picked, code];
              picked = LANGS.map((l) => l[0]).filter((c) => picked.includes(c)); // keep list order
              saveOpt({ [key]: picked });
              render();
            });
            box.appendChild(b);
          }
        };
        render();
      }

      const restBox = $('cr-lang-rest');
      if (restBox) {
        restBox.checked = opts.langShowRest !== false;
        restBox.addEventListener('change', () => saveOpt({ langShowRest: restBox.checked }));
      }
    });

    // Plain string settings: select[data-sync-select="key"] -> chrome.storage.sync[key]
    for (const sel of document.querySelectorAll('[data-sync-select]')) {
      const key = sel.dataset.syncSelect;
      chrome.storage.sync.get([key], (res) => { if (res[key]) sel.value = res[key]; });
      sel.addEventListener('change', () => chrome.storage.sync.set({ [key]: sel.value }));
    }

    // Auto-like choice.
    const likeSel = $('cr-autolike');
    if (likeSel) {
      chrome.storage.sync.get(['nina_cr_autolike'], (res) => { likeSel.value = res.nina_cr_autolike || 'off'; });
      likeSel.addEventListener('change', () => chrome.storage.sync.set({ nina_cr_autolike: likeSel.value }));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
