// sidepanel.js — Script for the Android 15 styled sidepanel
'use strict';

const state = {
  speed: 1.0,
  audio: 100,
  ffSpeed: 2.0,
  autoSkip: true,
  ytDislikes: true,
  speedTimer: true,
  sponsorBlock: true,
  autoLike: true,
  autoLikePercent: 10,
  showThanksDownload: false,
  pauseOnOpen: false,
  hideXRay: false,
  hidePrimeControls: false,
  hidePrimeTopbar: false,
  hidePrimeNextup: false,
  hidePrimeSettings: false
};

const $ = (id) => document.getElementById(id);

let currentLocaleMessages = null;

async function loadLocale(lang) {
  if (!lang || lang === 'system') {
    currentLocaleMessages = null;
    return;
  }
  try {
    const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
    const res = await fetch(url);
    currentLocaleMessages = await res.json();
  } catch (e) {
    console.error("Failed to load locale messages for " + lang, e);
    currentLocaleMessages = null;
  }
}

function getMessage(key) {
  if (currentLocaleMessages && currentLocaleMessages[key]) {
    return currentLocaleMessages[key].message;
  }
  return chrome.i18n.getMessage(key);
}

function localizeHTML() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = getMessage(key);
    if (msg) {
      el.textContent = msg;
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    const msg = getMessage(key);
    if (msg) {
      el.setAttribute('title', msg);
    }
  });
}

function updateDropdownTriggerText(lang) {
  const dropdownSelectedValue = document.getElementById('dropdownSelectedValue');
  if (!dropdownSelectedValue) return;
  let text = '';
  if (lang === 'system') {
    text = getMessage('lang_system') || 'System default';
  } else if (lang === 'de') {
    text = 'Deutsch';
  } else if (lang === 'en') {
    text = 'English';
  } else if (lang === 'es') {
    text = 'Español';
  } else if (lang === 'fr') {
    text = 'Français';
  }
  dropdownSelectedValue.innerText = text;

  // Highlight active
  document.querySelectorAll('.dropdown-item').forEach(btn => {
    if (btn.getAttribute('data-value') === lang) {
      btn.style.backgroundColor = 'var(--color-primary-glow, rgba(91, 219, 220, 0.15))';
      btn.style.fontWeight = 'bold';
    } else {
      btn.style.backgroundColor = 'transparent';
      btn.style.fontWeight = 'normal';
    }
  });
}



// Elements
const speedSlider = $('speedSlider');
const speedVal = $('speedVal');
const audioSlider = $('audioSlider');
const audioVal = $('audioVal');
const btnResetAll = $('btnResetAll');
const toast = $('toast');
const toastText = $('toastText');

const speedHeader = $('speedHeader');
const speedPresetsSection = $('speedPresetsSection');

let presetsExpanded = false;

function updatePresetsView() {
  if (!speedSlider || !speedPresetsSection) return;
  if (presetsExpanded) {
    speedPresetsSection.style.display = 'block';
  } else {
    speedPresetsSection.style.display = 'none';
  }
  if (presetsExpanded || state.speed > 3.0) {
    speedSlider.max = "10.0";
  } else {
    speedSlider.max = "3.0";
  }
  updateSliderProgress(speedSlider, state.speed);
}

const dashboardView = $('dashboardView');
const settingsView = $('settingsView');
const btnGoToSettings = $('btnGoToSettings');
const btnBackToDashboard = $('btnBackToDashboard');

// Settings page elements
const ffSpeedSlider = $('ffSpeedSlider');
const ffSpeedVal = $('ffSpeedVal');

const toggleAutoSkip = $('toggleAutoSkip');
const toggleDislikes = $('toggleDislikes');
const toggleSpeedTimer = $('toggleSpeedTimer');
const toggleSponsorBlock = $('toggleSponsorBlock');
const toggleThanksDownload = $('toggleThanksDownload');
const togglePauseOnOpen = $('togglePauseOnOpen');
const toggleHideXRay = $('toggleHideXRay');
const toggleHidePrimeControls = $('toggleHidePrimeControls');
const toggleHidePrimeTopbar = $('toggleHidePrimeTopbar');
const toggleHidePrimeNextup = $('toggleHidePrimeNextup');
const toggleHidePrimeSettings = $('toggleHidePrimeSettings');

const toggleAutoLike = $('toggleAutoLike');
const autoLikeSlider = $('autoLikeSlider');
const autoLikeVal = $('autoLikeVal');
const autoLikeSliderBlock = $('autoLikeSliderBlock');

// Show notification toast
let toastTimeout;
function showToast(text) {
  clearTimeout(toastTimeout);
  toastText.innerText = text;
  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');
  
  toastTimeout = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2500);
}

// Update range slider color fills (M3 Pill Slider style)
function updateSliderProgress(slider, val) {
  if (!slider) return;
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const percent = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--value-percent', `${percent}%`);
}

// Chrome API Injectable active tab query
function canInject(url) {
  if (!url) return false;
  return /^https?:|^file:/i.test(url) && !/^https?:\/\/chrome\.google\.com\/webstore/i.test(url);
}

async function getActiveInjectableTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !canInject(tab.url)) return null;
    return tab;
  } catch (_) {
    return null;
  }
}

// Update speed and volume methods
async function setSpeed(speed) {
  const maxVal = (presetsExpanded || speed > 3.0) ? 10.0 : 3.0;
  speed = Math.max(0.25, Math.min(maxVal, speed));
  state.speed = speed;
  speedSlider.value = speed;
  speedVal.innerText = `${speed.toFixed(2)}x`;
  updateSliderProgress(speedSlider, speed);
  if (speed > 3.0 && !presetsExpanded) {
    presetsExpanded = true;
    updatePresetsView();
  }
  
  const activeTab = await getActiveInjectableTab();
  if (activeTab) {
    chrome.storage.local.get(['tab_speeds'], (res) => {
      const tabSpeeds = res.tab_speeds || {};
      const activeSettings = tabSpeeds[activeTab.id] || {};
      tabSpeeds[activeTab.id] = {
        ...activeSettings,
        speed: speed,
        url: activeTab.url
      };
      chrome.storage.local.set({ tab_speeds: tabSpeeds });
    });
  }
}

async function setAudio(val) {
  val = parseInt(val);
  val = Math.max(0, Math.min(600, val)); // Vol slider max is 600% by default now
  
  state.audio = val;
  audioSlider.value = val;
  audioVal.innerText = `${val}%`;
  updateSliderProgress(audioSlider, val);
  
  const activeTab = await getActiveInjectableTab();
  if (activeTab) {
    chrome.storage.local.get(['tab_speeds'], (res) => {
      const tabSpeeds = res.tab_speeds || {};
      const activeSettings = tabSpeeds[activeTab.id] || {};
      tabSpeeds[activeTab.id] = {
        ...activeSettings,
        volume: val / 100, // store as ratio (e.g. 1.0 is 100%)
        url: activeTab.url
      };
      chrome.storage.local.set({ tab_speeds: tabSpeeds });
    });
  }
}

function updateAutoLikeSlider(val) {
  state.autoLikePercent = parseInt(val);
  autoLikeSlider.value = val;
  autoLikeVal.innerText = `${val}%`;
  updateSliderProgress(autoLikeSlider, val);
}

function setFFSpeed(ffSpeed) {
  ffSpeed = Math.max(1.0, Math.min(10.0, parseFloat(ffSpeed)));
  state.ffSpeed = ffSpeed;
  ffSpeedSlider.value = ffSpeed;
  ffSpeedVal.innerText = `${ffSpeed.toFixed(2)}x`;
  updateSliderProgress(ffSpeedSlider, ffSpeed);
  chrome.storage.local.set({ joyn_ff_speed: ffSpeed });
}

// Initialise settings from storage
async function init() {
  const logoEl = document.querySelector('img[alt="NINA"]');
  if (logoEl && !logoEl._busted) {
    logoEl.src = `../icons/icon.png?t=${Date.now()}`;
    logoEl._busted = true;
  }

  const activeTab = await getActiveInjectableTab();
  const activeTabId = activeTab ? activeTab.id : null;
  
  chrome.storage.local.get([
    'tab_speeds',
    'joyn_ff_speed',
    'joyn_autoskip',
    'joyn_show_dislikes',
    'joyn_show_timer',
    'joyn_sponsorblock_enabled',
    'joyn_autolike_enabled',
    'joyn_autolike_threshold',
    'joyn_show_thanks_download',
    'joyn_pause_on_open',
    'joyn_hide_xray',
    'joyn_hide_prime_controls',
    'joyn_hide_prime_topbar',
    'joyn_hide_prime_nextup',
    'joyn_hide_prime_settings',
    'joyn_language'
  ], (res) => {
    const resSafe = res || {};
    const lang = resSafe.joyn_language || 'system';
    loadLocale(lang).then(() => {
      localizeHTML();
      updateDropdownTriggerText(lang);
    });
    const tabSpeeds = resSafe.tab_speeds || {};
    const activeSettings = activeTabId ? tabSpeeds[activeTabId] : null;
    
    // 1. Dashboard values (tab specific)
    const speed = activeSettings ? parseFloat(activeSettings.speed) : 1.0;
    const volRatio = activeSettings ? parseFloat(activeSettings.volume) : 1.0;
    const audioPct = Math.round(volRatio * 100);
    
    state.speed = isFinite(speed) ? speed : 1.0;
    state.audio = isFinite(audioPct) ? audioPct : 100;
    
    // 2. Settings values
    const ff = parseFloat(resSafe.joyn_ff_speed);
    state.ffSpeed = isFinite(ff) ? ff : 2.0;
    
    state.autoSkip = resSafe.joyn_autoskip !== undefined ? !!resSafe.joyn_autoskip : true;
    state.ytDislikes = resSafe.joyn_show_dislikes !== undefined ? !!resSafe.joyn_show_dislikes : true;
    state.speedTimer = resSafe.joyn_show_timer !== undefined ? !!resSafe.joyn_show_timer : true;
    state.sponsorBlock = resSafe.joyn_sponsorblock_enabled !== undefined ? !!resSafe.joyn_sponsorblock_enabled : true;
    state.autoLike = resSafe.joyn_autolike_enabled !== undefined ? !!resSafe.joyn_autolike_enabled : true;
    state.pauseOnOpen = resSafe.joyn_pause_on_open !== undefined ? !!resSafe.joyn_pause_on_open : false;
    state.hideXRay = resSafe.joyn_hide_xray !== undefined ? !!resSafe.joyn_hide_xray : false;
    state.hidePrimeControls = resSafe.joyn_hide_prime_controls !== undefined ? !!resSafe.joyn_hide_prime_controls : false;
    state.hidePrimeTopbar = resSafe.joyn_hide_prime_topbar !== undefined ? !!resSafe.joyn_hide_prime_topbar : false;
    state.hidePrimeNextup = resSafe.joyn_hide_prime_nextup !== undefined ? !!resSafe.joyn_hide_prime_nextup : false;
    state.hidePrimeSettings = resSafe.joyn_hide_prime_settings !== undefined ? !!resSafe.joyn_hide_prime_settings : false;
    
    const t = parseInt(resSafe.joyn_autolike_threshold);
    state.autoLikePercent = isFinite(t) ? t : 10;
    
    // Apply UI state
    presetsExpanded = state.speed > 3.0;
    updatePresetsView();
    speedSlider.value = state.speed;
    speedVal.innerText = `${state.speed.toFixed(2)}x`;
    
    audioSlider.value = state.audio;
    audioVal.innerText = `${state.audio}%`;
    updateSliderProgress(audioSlider, state.audio);
    
    // Ensure dark mode is active
    document.documentElement.classList.add('dark');
    
    // Apply settings values to toggles
    toggleAutoSkip.checked = state.autoSkip;
    toggleDislikes.checked = state.ytDislikes;
    toggleSpeedTimer.checked = state.speedTimer;
    toggleSponsorBlock.checked = state.sponsorBlock;
    toggleAutoLike.checked = state.autoLike;
    togglePauseOnOpen.checked = state.pauseOnOpen;
    toggleHideXRay.checked = state.hideXRay;
    toggleHidePrimeControls.checked = state.hidePrimeControls;
    toggleHidePrimeTopbar.checked = state.hidePrimeTopbar;
    toggleHidePrimeNextup.checked = state.hidePrimeNextup;
    toggleHidePrimeSettings.checked = state.hidePrimeSettings;
    
    setFFSpeed(state.ffSpeed);
    
    if (state.autoLike) {
      autoLikeSliderBlock.style.opacity = "1";
      autoLikeSliderBlock.style.pointerEvents = "auto";
    } else {
      autoLikeSliderBlock.style.opacity = "0.4";
      autoLikeSliderBlock.style.pointerEvents = "none";
    }
    updateAutoLikeSlider(state.autoLikePercent);
  });
}

// Event Listeners
if (speedHeader) {
  speedHeader.addEventListener('click', () => {
    presetsExpanded = !presetsExpanded;
    updatePresetsView();
  });
}
speedSlider.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  if (Math.abs(val - 1.0) <= 0.07) {
    val = 1.0;
    e.target.value = "1.0";
  }
  setSpeed(val);
});
audioSlider.addEventListener('input', (e) => {
  let val = parseInt(e.target.value);
  if (Math.abs(val - 100) <= 12) {
    val = 100;
    e.target.value = "100";
  }
  setAudio(val);
});
autoLikeSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  updateAutoLikeSlider(val);
  chrome.storage.local.set({ joyn_autolike_threshold: val });
});
ffSpeedSlider.addEventListener('input', (e) => setFFSpeed(parseFloat(e.target.value)));

// Wheel support
speedSlider.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = 0.05;
  const val = Math.max(0.25, Math.min(10.0, parseFloat(speedSlider.value) + (e.deltaY < 0 ? step : -step)));
  setSpeed(val);
}, { passive: false });

audioSlider.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = 5;
  const val = Math.max(0, Math.min(600, parseInt(audioSlider.value) + (e.deltaY < 0 ? step : -step)));
  setAudio(val);
}, { passive: false });

autoLikeSlider.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = 1;
  const val = Math.max(1, Math.min(100, parseInt(autoLikeSlider.value) + (e.deltaY < 0 ? step : -step)));
  updateAutoLikeSlider(val);
  chrome.storage.local.set({ joyn_autolike_threshold: val });
}, { passive: false });

ffSpeedSlider.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = 0.1;
  const val = Math.max(1.0, Math.min(10.0, parseFloat(ffSpeedSlider.value) + (e.deltaY < 0 ? step : -step)));
  setFFSpeed(val);
}, { passive: false });



document.querySelectorAll('.speed-preset-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const targetSpeed = parseFloat(btn.getAttribute('data-speed'));
    setSpeed(targetSpeed);
  });
});

// Reset Button
btnResetAll.addEventListener('click', () => {
  setSpeed(1.0);
  setAudio(100);
  setFFSpeed(2.0);
  showToast('Werte auf Standard zurückgesetzt');
});

// Navigation
btnGoToSettings.addEventListener('click', () => {
  dashboardView.style.opacity = '0';
  dashboardView.style.transform = 'translateX(-20px)';
  setTimeout(() => {
    dashboardView.classList.add('hidden');
    settingsView.classList.remove('hidden');
    settingsView.style.opacity = '0';
    settingsView.style.transform = 'translateX(20px)';
    setTimeout(() => {
      settingsView.style.opacity = '1';
      settingsView.style.transform = 'translateX(0)';
    }, 50);
  }, 200);
});

btnBackToDashboard.addEventListener('click', () => {
  settingsView.style.opacity = '0';
  settingsView.style.transform = 'translateX(20px)';
  setTimeout(() => {
    settingsView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    dashboardView.style.opacity = '0';
    dashboardView.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      dashboardView.style.opacity = '1';
      dashboardView.style.transform = 'translateX(0)';
    }, 50);
  }, 200);
});

// Switches Event Listeners
toggleAutoSkip.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_autoskip: enabled });
  showToast(enabled ? getMessage('toast_autoskip_active') : getMessage('toast_autoskip_inactive'));
});

toggleDislikes.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_show_dislikes: enabled });
  showToast(enabled ? getMessage('toast_dislikes_active') : getMessage('toast_dislikes_inactive'));
});

toggleSpeedTimer.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_show_timer: enabled });
  showToast(enabled ? getMessage('toast_timer_active') : getMessage('toast_timer_inactive'));
});

toggleSponsorBlock.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_sponsorblock_enabled: enabled });
  showToast(enabled ? getMessage('toast_sb_active') : getMessage('toast_sb_inactive'));
});

toggleThanksDownload.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_show_thanks_download: enabled });
  // Send message to active tab to live-inject/toggle YouTube buttons
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleThanksDownload',
        enabled: enabled
      }).catch(() => {});
    }
  });
  showToast(enabled ? getMessage('toast_buttons_shown') : getMessage('toast_buttons_hidden'));
});

togglePauseOnOpen.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_pause_on_open: enabled });
  showToast(enabled ? getMessage('toast_pause_active') : getMessage('toast_pause_inactive'));
});

toggleHideXRay.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_hide_xray: enabled });
  showToast(enabled ? getMessage('toast_xray_hidden') : getMessage('toast_xray_shown'));
});

toggleHidePrimeControls.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_hide_prime_controls: enabled });
  showToast(enabled ? getMessage('toast_prime_controls_hidden') : getMessage('toast_prime_controls_shown'));
});

toggleHidePrimeTopbar.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_hide_prime_topbar: enabled });
  showToast(enabled ? getMessage('toast_prime_topbar_hidden') : getMessage('toast_prime_topbar_shown'));
});

toggleHidePrimeNextup.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_hide_prime_nextup: enabled });
  showToast(enabled ? getMessage('toast_prime_nextup_hidden') : getMessage('toast_prime_nextup_shown'));
});

toggleHidePrimeSettings.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_hide_prime_settings: enabled });
  showToast(enabled ? getMessage('toast_prime_settings_hidden') : getMessage('toast_prime_settings_shown'));
});

toggleAutoLike.addEventListener('change', (e) => {
  const enabled = !!e.target.checked;
  chrome.storage.local.set({ joyn_autolike_enabled: enabled });
  if (enabled) {
    autoLikeSliderBlock.style.opacity = "1";
    autoLikeSliderBlock.style.pointerEvents = "auto";
  } else {
    autoLikeSliderBlock.style.opacity = "0.4";
    autoLikeSliderBlock.style.pointerEvents = "none";
  }
  showToast(enabled ? getMessage('toast_autolike_active') : getMessage('toast_autolike_inactive'));
});

const dropdownTrigger = $('dropdownTrigger');
const dropdownMenu = $('dropdownMenu');
const dropdownArrow = $('dropdownArrow');

function toggleDropdown() {
  if (!dropdownMenu || !dropdownArrow) return;
  const isHidden = dropdownMenu.classList.contains('hidden');
  if (isHidden) {
    dropdownMenu.classList.remove('hidden');
    dropdownArrow.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      dropdownMenu.style.opacity = '1';
      dropdownMenu.style.transform = 'scale(1)';
    }, 10);
  } else {
    dropdownMenu.style.opacity = '0';
    dropdownMenu.style.transform = 'scale(0.95)';
    dropdownArrow.style.transform = 'rotate(0deg)';
    setTimeout(() => {
      dropdownMenu.classList.add('hidden');
    }, 150);
  }
}

dropdownTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDropdown();
});

document.addEventListener('click', (e) => {
  if (dropdownMenu && !dropdownMenu.classList.contains('hidden') && !e.target.closest('#customDropdownContainer')) {
    toggleDropdown();
  }
});

document.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', async (e) => {
    e.stopPropagation();
    const lang = item.getAttribute('data-value');
    await chrome.storage.local.set({ joyn_language: lang });
    await loadLocale(lang);
    localizeHTML();
    showToast(getMessage('toast_saved') || 'Gespeichert');
    updateDropdownTriggerText(lang);
    toggleDropdown();
  });
});

// React on active tab switches or storage changes
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(() => init());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      init();
    }
  });
}

// Live storage synchronization
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.joyn_language) {
      const newLang = changes.joyn_language.newValue || 'system';
      await loadLocale(newLang);
      localizeHTML();
      updateDropdownTriggerText(newLang);
    }
    if (changes.joyn_ff_speed) {
      setFFSpeed(parseFloat(changes.joyn_ff_speed.newValue));
    }
    if (changes.joyn_autoskip) {
      toggleAutoSkip.checked = !!changes.joyn_autoskip.newValue;
    }
    if (changes.joyn_show_dislikes) {
      toggleDislikes.checked = !!changes.joyn_show_dislikes.newValue;
    }
    if (changes.joyn_show_timer) {
      toggleSpeedTimer.checked = !!changes.joyn_show_timer.newValue;
    }
    if (changes.joyn_sponsorblock_enabled) {
      toggleSponsorBlock.checked = !!changes.joyn_sponsorblock_enabled.newValue;
    }
    if (changes.joyn_show_thanks_download) {
      toggleThanksDownload.checked = !!changes.joyn_show_thanks_download.newValue;
    }
    if (changes.joyn_pause_on_open) {
      togglePauseOnOpen.checked = !!changes.joyn_pause_on_open.newValue;
    }
    if (changes.joyn_hide_xray) {
      toggleHideXRay.checked = !!changes.joyn_hide_xray.newValue;
    }
    if (changes.joyn_hide_prime_controls) {
      toggleHidePrimeControls.checked = !!changes.joyn_hide_prime_controls.newValue;
    }
    if (changes.joyn_hide_prime_topbar) {
      toggleHidePrimeTopbar.checked = !!changes.joyn_hide_prime_topbar.newValue;
    }
    if (changes.joyn_hide_prime_nextup) {
      toggleHidePrimeNextup.checked = !!changes.joyn_hide_prime_nextup.newValue;
    }
    if (changes.joyn_hide_prime_settings) {
      toggleHidePrimeSettings.checked = !!changes.joyn_hide_prime_settings.newValue;
    }
    if (changes.joyn_autolike_enabled) {
      const enabled = !!changes.joyn_autolike_enabled.newValue;
      toggleAutoLike.checked = enabled;
      autoLikeSliderBlock.style.opacity = enabled ? "1" : "0.4";
      autoLikeSliderBlock.style.pointerEvents = enabled ? "auto" : "none";
    }
    if (changes.joyn_autolike_threshold) {
      updateAutoLikeSlider(parseInt(changes.joyn_autolike_threshold.newValue));
    }
    if (changes.tab_speeds) {
      const activeTab = await getActiveInjectableTab();
      if (activeTab) {
        const newSpeeds = changes.tab_speeds.newValue || {};
        const activeSettings = newSpeeds[activeTab.id];
        if (activeSettings) {
          if (activeSettings.speed !== undefined) {
            state.speed = parseFloat(activeSettings.speed);
            const maxVal = (presetsExpanded || state.speed > 3.0) ? 10.0 : 3.0;
            state.speed = Math.max(0.25, Math.min(maxVal, state.speed));
            speedSlider.value = state.speed;
            speedVal.innerText = `${state.speed.toFixed(2)}x`;
            updateSliderProgress(speedSlider, state.speed);
            if (state.speed > 3.0 && !presetsExpanded) {
              presetsExpanded = true;
              updatePresetsView();
            }
          }
          if (activeSettings.volume !== undefined) {
            const val = Math.round(parseFloat(activeSettings.volume) * 100);
            state.audio = val;
            audioSlider.value = val;
            audioVal.innerText = `${val}%`;
            updateSliderProgress(audioSlider, val);
          }
        }
      }
    }
  });
}

// Run
document.addEventListener('DOMContentLoaded', init);
