'use strict';

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'nina-settings';
const DEFAULT_SETTINGS = {
  pauseOnOpen: false,
  ffSpeed: 2.0,
  autoSkip: true,
  dislikes: true,
  speedTimer: true,
  sponsorBlock: true,
  thanksDownload: false,
  autoLike: true,
  autoLikePercent: 10,
  hideXRay: false,
  secondsDisplay: true,
  bgColor: '#0f1113',
  bgImage: null,
  bgImageOverlay: 50,
  chromeBookmarks: false,
  chromeFilterMode: 'exclude',
  chromeFilterList: [],
  language: 'system',
  shortcuts: [
    { name: 'mail', url: 'https://mail.google.com' },
    { name: 'kontakte', url: 'https://contacts.google.com' },
    { name: 'kalender', url: 'https://calendar.google.com' },
    { name: 'photos', url: 'https://photos.google.com' },
    { name: 'drive', url: 'https://drive.google.com' },
    { name: 'tasks', url: 'https://tasks.google.com' },
    { name: 'keep', url: 'https://keep.google.com' },
    { name: 'docs', url: 'https://docs.google.com' },
    { name: 'sheets', url: 'https://sheets.google.com' },
    { name: 'slides', url: 'https://slides.google.com' },
    { name: 'translate', url: 'https://translate.google.com' },
    { name: 'maps', url: 'https://maps.google.com' },
    { name: 'gemini', url: 'https://gemini.google.com' },
    { name: 'notebooklm', url: 'https://notebooklm.google.com' },
    { name: 'claude', url: 'https://claude.ai' }
  ]
};

let currentSettings = { ...DEFAULT_SETTINGS };
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
    currentLocaleMessages = null;
  }
}

function getMessage(key) {
  if (currentLocaleMessages && currentLocaleMessages[key]) return currentLocaleMessages[key].message;
  return chrome.i18n.getMessage(key) || "";
}

function localizeHTML() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const msg = getMessage(key);
    if (msg) el.textContent = msg;
  });
}

// ==========================================
// UI HELPERS (Toast, Sliders)
// ==========================================
const toast = $('toast');
const toastText = $('toastText');
let toastTimeout;

function showToast(text) {
  clearTimeout(toastTimeout);
  toastText.innerText = text;
  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
  toast.classList.add('opacity-100', 'translate-y-0');

  toastTimeout = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2500);
}

function updateSliderProgress(slider, val) {
  if (!slider) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const percent = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--value-percent', `${percent}%`);
}

function loadSettings() {
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (result[STORAGE_KEY]) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
    }
    initializeUI();
    setupEventListeners();
  });
}

function saveSettings() {
  chrome.storage.local.set({ [STORAGE_KEY]: currentSettings });
}

function initializeUI() {
  $('togglePauseOnOpen').checked = currentSettings.pauseOnOpen;
  $('ffSpeedSlider').value = currentSettings.ffSpeed;
  $('ffSpeedVal').textContent = currentSettings.ffSpeed.toFixed(2) + 'x';
  updateSliderProgress($('ffSpeedSlider'), currentSettings.ffSpeed);
  $('toggleAutoSkip').checked = currentSettings.autoSkip;
  $('toggleDislikes').checked = currentSettings.dislikes;
  $('toggleSpeedTimer').checked = currentSettings.speedTimer;
  $('toggleSponsorBlock').checked = currentSettings.sponsorBlock;
  $('toggleThanksDownload').checked = currentSettings.thanksDownload;
  $('toggleAutoLike').checked = currentSettings.autoLike;
  $('autoLikeSlider').value = currentSettings.autoLikePercent;
  $('autoLikeVal').textContent = currentSettings.autoLikePercent + '%';
  updateSliderProgress($('autoLikeSlider'), currentSettings.autoLikePercent);
  $('toggleHideXRay').checked = currentSettings.hideXRay;
  $('seconds-toggle').checked = currentSettings.secondsDisplay;
  $('bg-color-picker').value = currentSettings.bgColor;
  $('overlay-slider').value = currentSettings.bgImageOverlay;
  $('overlay-val').textContent = currentSettings.bgImageOverlay + '%';
  updateSliderProgress($('overlay-slider'), currentSettings.bgImageOverlay);
  $('chrome-bookmarks-toggle').checked = currentSettings.chromeBookmarks;
  $('chrome-filter-mode').value = currentSettings.chromeFilterMode;

  updateAutoLikeSliderVisibility();
  updateChromeFilterVisibility();
  updateClearBgButtonVisibility();
  updateBookmarksList();
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  $('togglePauseOnOpen').addEventListener('change', (e) => {
    currentSettings.pauseOnOpen = e.target.checked;
    saveSettings();
  });

  $('ffSpeedSlider').addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    currentSettings.ffSpeed = value;
    $('ffSpeedVal').textContent = value.toFixed(2) + 'x';
    updateSliderProgress(e.target, value);
    saveSettings();
  });

  $('ffSpeedSlider').addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 0.1;
    const val = Math.max(1.0, Math.min(10.0, parseFloat($('ffSpeedSlider').value) + (e.deltaY < 0 ? step : -step)));
    currentSettings.ffSpeed = val;
    $('ffSpeedSlider').value = val;
    $('ffSpeedVal').textContent = val.toFixed(2) + 'x';
    updateSliderProgress($('ffSpeedSlider'), val);
    saveSettings();
  }, { passive: false });

  $('toggleAutoSkip').addEventListener('change', (e) => {
    currentSettings.autoSkip = e.target.checked;
    saveSettings();
  });

  $('toggleDislikes').addEventListener('change', (e) => {
    currentSettings.dislikes = e.target.checked;
    saveSettings();
  });

  $('toggleSpeedTimer').addEventListener('change', (e) => {
    currentSettings.speedTimer = e.target.checked;
    saveSettings();
  });

  $('toggleSponsorBlock').addEventListener('change', (e) => {
    currentSettings.sponsorBlock = e.target.checked;
    saveSettings();
  });

  $('toggleThanksDownload').addEventListener('change', (e) => {
    currentSettings.thanksDownload = e.target.checked;
    saveSettings();
  });

  $('toggleAutoLike').addEventListener('change', (e) => {
    currentSettings.autoLike = e.target.checked;
    updateAutoLikeSliderVisibility();
    saveSettings();
  });

  $('autoLikeSlider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    currentSettings.autoLikePercent = value;
    $('autoLikeVal').textContent = value + '%';
    updateSliderProgress(e.target, value);
    saveSettings();
  });

  $('autoLikeSlider').addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const val = Math.max(1, Math.min(100, parseInt($('autoLikeSlider').value) + (e.deltaY < 0 ? step : -step)));
    currentSettings.autoLikePercent = val;
    $('autoLikeSlider').value = val;
    $('autoLikeVal').textContent = val + '%';
    updateSliderProgress($('autoLikeSlider'), val);
    saveSettings();
  }, { passive: false });

  $('toggleHideXRay').addEventListener('change', (e) => {
    currentSettings.hideXRay = e.target.checked;
    saveSettings();
  });

  $('seconds-toggle').addEventListener('change', (e) => {
    currentSettings.secondsDisplay = e.target.checked;
    saveSettings();
  });

  $('bg-color-picker').addEventListener('change', (e) => {
    currentSettings.bgColor = e.target.value;
    saveSettings();
  });

  $('reset-bg-color-btn').addEventListener('click', () => {
    currentSettings.bgColor = DEFAULT_SETTINGS.bgColor;
    $('bg-color-picker').value = currentSettings.bgColor;
    saveSettings();
    showToast('Farbe zurückgesetzt');
  });

  $('bg-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        currentSettings.bgImage = event.target.result;
        updateClearBgButtonVisibility();
        $('overlay-control').classList.remove('hidden');
        saveSettings();
        showToast('Hintergrundbild gespeichert');
      };
      reader.readAsDataURL(file);
    }
  });

  $('btn-clear-bg').addEventListener('click', () => {
    currentSettings.bgImage = null;
    $('bg-upload').value = '';
    updateClearBgButtonVisibility();
    $('overlay-control').classList.add('hidden');
    saveSettings();
    showToast('Hintergrundbild gelöscht');
  });

  $('overlay-slider').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    currentSettings.bgImageOverlay = value;
    $('overlay-val').textContent = value + '%';
    updateSliderProgress(e.target, value);
    saveSettings();
  });

  $('overlay-slider').addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = 1;
    const val = Math.max(0, Math.min(95, parseInt($('overlay-slider').value) + (e.deltaY < 0 ? step : -step)));
    currentSettings.bgImageOverlay = val;
    $('overlay-slider').value = val;
    $('overlay-val').textContent = val + '%';
    updateSliderProgress($('overlay-slider'), val);
    saveSettings();
  }, { passive: false });

  $('chrome-bookmarks-toggle').addEventListener('change', (e) => {
    currentSettings.chromeBookmarks = e.target.checked;
    updateChromeFilterVisibility();
    saveSettings();
  });

  $('chrome-filter-mode').addEventListener('change', (e) => {
    currentSettings.chromeFilterMode = e.target.value;
    saveSettings();
  });

  $('add-domain-filter-btn').addEventListener('click', addDomainFilter);
  $('chrome-filter-search').addEventListener('input', searchChromeBookmarks);

  $('add-shortcut-btn').addEventListener('click', addShortcut);
  $('toggle-bulk-import-btn').addEventListener('click', () => {
    $('bulk-import-container').classList.toggle('hidden');
  });
  $('confirm-bulk-import-btn').addEventListener('click', bulkImportShortcuts);

  $('btnResetAll').addEventListener('click', resetAllSettings);

  setupDropdown();
  setupSidebarNavigation();
  setupSearch();
}

// Language Dropdown
function setupDropdown() {
  const dropdownTrigger = $('dropdownTrigger');
  const dropdownMenu = $('dropdownMenu');
  const dropdownArrow = $('dropdownArrow');

  function toggleDropdown() {
    if (!dropdownMenu || !dropdownArrow) return;
    const isHidden = dropdownMenu.classList.contains('hidden');
    dropdownMenu.classList.toggle('hidden');
    dropdownMenu.classList.toggle('scale-95');
    dropdownMenu.classList.toggle('opacity-0');
    dropdownArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0)';
  }

  dropdownTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  document.addEventListener('click', (e) => {
    if (dropdownMenu && !dropdownMenu.classList.contains('hidden') && !e.target.closest('#customDropdownContainer')) {
      dropdownMenu.classList.add('hidden', 'scale-95', 'opacity-0');
      dropdownArrow.style.transform = 'rotate(0)';
    }
  });

  document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lang = item.getAttribute('data-value');
      currentSettings.language = lang;
      $('dropdownSelectedValue').textContent = item.textContent;
      dropdownMenu.classList.add('hidden', 'scale-95', 'opacity-0');
      dropdownArrow.style.transform = 'rotate(0)';
      await loadLocale(lang);
      localizeHTML();
      saveSettings();
      showToast('Sprache aktualisiert');
    });
  });
}

function updateAutoLikeSliderVisibility() {
  const block = $('autoLikeSliderBlock');
  if (currentSettings.autoLike) {
    block.classList.remove('hidden');
  } else {
    block.classList.add('hidden');
  }
}

function updateChromeFilterVisibility() {
  const container = $('chrome-bookmarks-filter-container');
  if (currentSettings.chromeBookmarks) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

function updateClearBgButtonVisibility() {
  const btn = $('btn-clear-bg');
  if (currentSettings.bgImage) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function setupSidebarNavigation() {
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      const targetId = link.getAttribute('data-target');
      scrollToSection(targetId);
    });
  });
}

function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setupSearch() {
  const searchInput = $('searchInput');
  const settingSections = document.querySelectorAll('.setting-section');
  const noResultsMsg = $('noResultsMsg');

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    let visibleCount = 0;

    settingSections.forEach((section) => {
      const text = section.textContent.toLowerCase();
      const isVisible = text.includes(query);
      section.style.display = isVisible ? 'block' : 'none';
      if (isVisible) visibleCount++;
    });

    noResultsMsg.classList.toggle('hidden', visibleCount > 0);
  });
}


// ==========================================
// SHORTCUTS MANAGEMENT
// ==========================================
function addShortcut() {
  const name = $('bookmark-name').value.trim();
  const url = $('bookmark-url').value.trim();

  if (!name || !url) {
    $('error-message').classList.remove('hidden');
    setTimeout(() => $('error-message').classList.add('hidden'), 3000);
    return;
  }

  if (!isValidUrl(url)) {
    $('error-message').textContent = 'Bitte gib eine gültige URL ein!';
    $('error-message').classList.remove('hidden');
    setTimeout(() => {
      $('error-message').textContent = 'Bitte fülle beide Felder korrekt aus!';
      $('error-message').classList.add('hidden');
    }, 3000);
    return;
  }

  currentSettings.shortcuts.push({ name, url });
  $('bookmark-name').value = '';
  $('bookmark-url').value = '';
  $('error-message').classList.add('hidden');
  updateBookmarksList();
  saveSettings();
  showToast('Kürzel gespeichert');
}

function bulkImportShortcuts() {
  const text = $('bulk-import-text').value.trim();
  if (!text) return;

  const lines = text.split('\n').filter((line) => line.trim());
  let added = 0;

  lines.forEach((line) => {
    const [name, url] = line.split('|').map((s) => s.trim());
    if (name && url && isValidUrl(url)) {
      if (!currentSettings.shortcuts.some((s) => s.name === name)) {
        currentSettings.shortcuts.push({ name, url });
        added++;
      }
    }
  });

  $('bulk-import-text').value = '';
  $('bulk-import-container').classList.add('hidden');
  updateBookmarksList();
  saveSettings();
  showToast(`${added} Kürzel importiert`);
}

function updateBookmarksList() {
  const list = $('settings-bookmarks-list');
  list.innerHTML = '';
  currentSettings.shortcuts.forEach((shortcut, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between bg-m3-surfaceVariant-light dark:bg-m3-surfaceVariant-dark p-3 rounded-xl';
    item.innerHTML = `
      <div class="flex-1">
        <span class="font-medium text-sm text-slate-800 dark:text-slate-100">${escapeHtml(shortcut.name)}</span>
        <span class="text-xs text-m3-outline-light dark:text-m3-outline-dark block">${escapeHtml(shortcut.url)}</span>
      </div>
      <button class="delete-shortcut-btn text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    `;
    item.querySelector('.delete-shortcut-btn').addEventListener('click', () => {
      currentSettings.shortcuts.splice(index, 1);
      updateBookmarksList();
      saveSettings();
      showToast('Kürzel gelöscht');
    });
    list.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// CHROME BOOKMARKS FILTERING
// ==========================================
let chromeBookmarks = [];

function addDomainFilter() {
  const search = $('chrome-filter-search').value.trim();
  if (!search) return;

  if (!currentSettings.chromeFilterList.includes(search)) {
    currentSettings.chromeFilterList.push(search);
    $('chrome-filter-search').value = '';
    updateChromeFilterList();
    saveSettings();
    showToast('Filter hinzugefügt');
  }
}

function updateChromeFilterList() {
  const list = $('chrome-filter-list');
  list.innerHTML = '';
  currentSettings.chromeFilterList.forEach((filter, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between bg-m3-surfaceVariant-light dark:bg-m3-surfaceVariant-dark p-3 rounded-xl';
    item.innerHTML = `
      <span class="text-sm text-slate-800 dark:text-slate-100">${escapeHtml(filter)}</span>
      <button class="delete-filter-btn text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    `;
    item.querySelector('.delete-filter-btn').addEventListener('click', () => {
      currentSettings.chromeFilterList.splice(index, 1);
      updateChromeFilterList();
      saveSettings();
      showToast('Filter entfernt');
    });
    list.appendChild(item);
  });
}

function searchChromeBookmarks() {
  const query = $('chrome-filter-search').value.trim().toLowerCase();
  if (!query) {
    document.getElementById('chrome-filter-search-results').classList.add('hidden');
    return;
  }

  chrome.bookmarks.getTree((bookmarks) => {
    const results = searchBookmarksRecursive(bookmarks[0], query);
    const resultsDiv = document.getElementById('chrome-filter-search-results');

    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="p-3 text-xs text-slate-500">Keine Lesezeichen gefunden</div>';
      resultsDiv.classList.remove('hidden');
      return;
    }

    resultsDiv.innerHTML = results
      .slice(0, 10)
      .map(
        (r) =>
          `<button class="w-full text-left p-3 hover:bg-m3-surfaceVariant-light dark:hover:bg-m3-surfaceVariant-dark border-b border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 transition-colors" data-title="${escapeHtml(r.title)}" data-url="${escapeHtml(r.url)}">
          <div class="font-medium">${escapeHtml(r.title)}</div>
          <div class="text-[11px] text-m3-outline-light dark:text-m3-outline-dark truncate">${escapeHtml(r.url || '')}</div>
        </button>`
      )
      .join('');

    resultsDiv.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const title = btn.getAttribute('data-title');
        $('chrome-filter-search').value = title;
        resultsDiv.classList.add('hidden');
      });
    });

    resultsDiv.classList.remove('hidden');
  });
}

function searchBookmarksRecursive(node, query) {
  let results = [];
  if (node.title && node.title.toLowerCase().includes(query) && node.url) {
    results.push({ title: node.title, url: node.url });
  }
  if (node.children) {
    node.children.forEach((child) => {
      results = results.concat(searchBookmarksRecursive(child, query));
    });
  }
  return results;
}


// ==========================================
// RESET SETTINGS
// ==========================================
function resetAllSettings() {
  if (!confirm('Alle Einstellungen auf Standard zurücksetzen?')) return;
  currentSettings = { ...DEFAULT_SETTINGS };
  chrome.storage.local.remove(STORAGE_KEY);
  initializeUI();
  showToast('Alle Einstellungen zurückgesetzt');
}

// ==========================================
// GOOGLE DRIVE SECTION
// ==========================================
const DRIVE_AUTH_KEY = 'nina_drive_connected';

function updateDriveUI(connected, email) {
  const dot = $('drive-status-dot');
  const text = $('drive-status-text');
  const btn = $('drive-connect-btn');
  if (!dot || !text || !btn) return;
  if (connected) {
    dot.style.background = '#22c55e';
    text.textContent = email ? `Verbunden als ${email}` : 'Verbunden';
    btn.textContent = 'Trennen';
  } else {
    dot.style.background = '#94a3b8';
    text.textContent = 'Nicht verbunden';
    btn.textContent = 'Verbinden';
  }
}

function initDriveUI() {
  chrome.storage.local.get([DRIVE_AUTH_KEY], (res) => {
    if (res[DRIVE_AUTH_KEY]) {
      // Token holen um Konto-Info zu lesen
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) { updateDriveUI(false); return; }
        fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).then(info => {
          updateDriveUI(true, info.email);
        }).catch(() => updateDriveUI(true));
      });
    } else {
      updateDriveUI(false);
    }
  });

  $('drive-connect-btn').addEventListener('click', () => {
    chrome.storage.local.get([DRIVE_AUTH_KEY], (res) => {
      if (res[DRIVE_AUTH_KEY]) {
        // Trennen
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) {
            fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(token)}` }).catch(() => {});
            chrome.identity.removeCachedAuthToken({ token }, () => {});
          }
          chrome.storage.local.remove(DRIVE_AUTH_KEY, () => updateDriveUI(false));
        });
      } else {
        // Verbinden
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError || !token) return;
          chrome.storage.local.set({ [DRIVE_AUTH_KEY]: true }, () => {
            fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
              headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json()).then(info => {
              updateDriveUI(true, info.email);
            }).catch(() => updateDriveUI(true));
          });
        });
      }
    });
  });
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadLocale(currentSettings.language).then(() => {
    localizeHTML();
  });
  loadSettings();
  initDriveUI();
});
