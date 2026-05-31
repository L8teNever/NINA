// ============ DOM ELEMENTS (mit korrekten IDs aus dem neuen HTML) ============

const digits = {
    h1: document.getElementById('h1'), h2: document.getElementById('h2'),
    m1: document.getElementById('m1'), m2: document.getElementById('m2'),
    s1: document.getElementById('s1'), s2: document.getElementById('s2')
};

const searchField = document.getElementById('search-field');
const searchForm = document.getElementById('search-form');
const suggestionsBox = document.getElementById('suggestions-box');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const settingsModal = document.getElementById('settings-modal');
const searchIconContainer = document.getElementById('search-icon-container');
const clearBtn = document.getElementById('clear-search');

// Buttons mit RICHTIGEN IDs
const btnOpenSettings = document.getElementById('open-settings-btn');
const btnCloseSettingsX = document.getElementById('close-settings-x');
const btnSettingsBack = document.getElementById('settings-back-btn');
const btnMenuShortcuts = document.getElementById('menu-shortcuts-btn');
const btnMenuAppearance = document.getElementById('menu-appearance-btn');
const btnAddShortcut = document.getElementById('add-shortcut-btn');
const btnResetBgColor = document.getElementById('reset-bg-color-btn');
const btnClearBg = document.getElementById('btn-clear-bg');
const btnFinishSettings = document.getElementById('finish-settings-btn');

// Form elements
const bookmarkNameInput = document.getElementById('bookmark-name');
const bookmarkUrlInput = document.getElementById('bookmark-url');
const errorMessage = document.getElementById('error-message');
const secondsToggle = document.getElementById('seconds-toggle');
const chromeBookmarksToggle = document.getElementById('chrome-bookmarks-toggle');
const bgColorPicker = document.getElementById('bg-color-picker');
const bgUpload = document.getElementById('bg-upload');
const overlaySlider = document.getElementById('overlay-slider');
const overlayVal = document.getElementById('overlay-val');
const overlayControl = document.getElementById('overlay-control');

// Views
const settingsMainMenu = document.getElementById('settings-main-menu');
const subpageShortcuts = document.getElementById('subpage-shortcuts');
const subpageAppearance = document.getElementById('subpage-appearance');
const settingsTitle = document.getElementById('settings-title');
const settingsBookmarksList = document.getElementById('settings-bookmarks-list');

// Data
let bookmarks = [
    // Google Services
    { name: "Google Mail, ma, mai, mail, mails, gmail", url: "https://mail.google.com" },
    { name: "YouTube, yt, youtube, vids, video", url: "https://youtube.com" },
    { name: "GitHub, gh, github, git, code", url: "https://github.com" },
    { name: "Wikipedia Deutschland, deutschland, de, germany, deu", url: "https://de.wikipedia.org/wiki/Deutschland" },
    { name: "kontakte", url: "https://contacts.google.com" },
    { name: "kalender", url: "https://calendar.google.com" },
    { name: "photos", url: "https://photos.google.com" },
    { name: "drive", url: "https://drive.google.com" },
    { name: "tasks", url: "https://tasks.google.com" },
    { name: "keep", url: "https://keep.google.com" },
    { name: "docs", url: "https://docs.google.com" },
    { name: "sheets", url: "https://sheets.google.com" },
    { name: "slides", url: "https://slides.google.com" },
    { name: "translate", url: "https://translate.google.com" },
    { name: "maps", url: "https://maps.google.com" },
    { name: "gemini", url: "https://gemini.google.com" },
    { name: "chatgpt, gpt", url: "https://chatgpt.com" },
    { name: "claude", url: "https://claude.ai" },
    { name: "notebooklm", url: "https://notebooklm.google.com" },
    { name: "wiki", url: "https://wikipedia.org" }
];

let chromeBookmarks = [];
let showSeconds = true;
let useChromeFavorites = false;
let chromeBookmarkFilterMode = 'exclude';
let chromeBookmarkFilterList = [];
let activeSuggestionIndex = -1;
let debounceTimeout;

const chromeBookmarksFilterContainer = document.getElementById('chrome-bookmarks-filter-container');
const chromeFilterMode = document.getElementById('chrome-filter-mode');
const chromeFilterSearch = document.getElementById('chrome-filter-search');
const chromeFilterSearchResults = document.getElementById('chrome-filter-search-results');
const chromeFilterList = document.getElementById('chrome-filter-list');

// ============ UTILITY FUNCTIONS ============

function isDirectUrl(str) {
    return /^(https?:\/\/[^\s]+)$/i.test(str) || /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i.test(str);
}

function isUrlInFilter(url) {
    return chromeBookmarkFilterList.some(filterItem => {
        if (filterItem.startsWith('domain:')) {
            const domain = filterItem.replace('domain:', '').toLowerCase();
            return url.toLowerCase().includes(domain);
        }
        return url === filterItem;
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

function syncSettingsToStorage() {
    if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
            bookmarks: bookmarks,
            chromeBookmarks: chromeBookmarks,
            useChromeFavorites: useChromeFavorites,
            chromeBookmarkFilterMode: chromeBookmarkFilterMode,
            chromeBookmarkFilterList: chromeBookmarkFilterList
        });
    }
}

function animateDigit(element, newValue) {
    if (element.textContent === newValue) return;

    element.classList.add('changing');
    setTimeout(() => {
        element.textContent = newValue;
        element.classList.remove('changing');
    }, 120);
}

function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');

    animateDigit(digits.h1, h[0]);
    animateDigit(digits.h2, h[1]);
    animateDigit(digits.m1, m[0]);
    animateDigit(digits.m2, m[1]);

    if (showSeconds) {
        animateDigit(digits.s1, s[0]);
        animateDigit(digits.s2, s[1]);
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

function openSubpage(subpageId, title) {
    settingsMainMenu.classList.add('hidden');

    if (subpageId === 'shortcuts') {
        subpageShortcuts.classList.remove('hidden');
        renderSettingsList();
    } else if (subpageId === 'appearance') {
        subpageAppearance.classList.remove('hidden');
    }

    btnSettingsBack.classList.remove('hidden');
    settingsTitle.textContent = title;
}

function goToMainPage() {
    subpageShortcuts.classList.add('hidden');
    subpageAppearance.classList.add('hidden');
    settingsMainMenu.classList.remove('hidden');
    btnSettingsBack.classList.add('hidden');
    settingsTitle.textContent = "Einstellungen";
}

function openSettingsModal() {
    errorMessage.classList.add('hidden');
    bookmarkNameInput.value = '';
    bookmarkUrlInput.value = '';
    goToMainPage();
    drawerBackdrop.classList.add('active');
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    drawerBackdrop.classList.remove('active');
    settingsModal.classList.remove('active');
    focusSearch();
}

function renderSettingsList() {
    settingsBookmarksList.innerHTML = '';

    if (bookmarks.length === 0) {
        settingsBookmarksList.innerHTML = `<div class="text-zinc-600 text-xs text-center py-4">Keine Kürzel angelegt.</div>`;
        return;
    }

    bookmarks.forEach((bm, index) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-[#0f1113] border border-zinc-800/60 rounded-xl px-4 py-2.5';
        row.innerHTML = `
            <div class="flex flex-col min-w-0 pr-2">
                <span class="text-white text-xs font-bold tracking-wide">${escapeHtml(bm.name)}</span>
                <span class="text-[10px] text-zinc-500 truncate max-w-[280px]">${escapeHtml(bm.url)}</span>
            </div>
            <button data-delete-index="${index}" type="button" class="delete-bookmark-btn text-red-500 hover:text-red-400 font-medium text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer bg-transparent border-0">
                Löschen
            </button>
        `;
        settingsBookmarksList.appendChild(row);
    });

    // Delete button listeners
    document.querySelectorAll('.delete-bookmark-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.deleteIndex, 10);
            if (!isNaN(idx)) {
                deleteBookmark(idx);
            }
        });
    });
}

function saveBookmark() {
    const nameInput = bookmarkNameInput.value.trim().toLowerCase();
    let urlInput = bookmarkUrlInput.value.trim();

    if (!nameInput || !urlInput) {
        errorMessage.classList.remove('hidden');
        return;
    }

    if (!/^https?:\/\//i.test(urlInput)) {
        urlInput = 'https://' + urlInput;
    }

    const existingIndex = bookmarks.findIndex(bm => bm.name === nameInput);
    if (existingIndex !== -1) {
        bookmarks[existingIndex].url = urlInput;
    } else {
        bookmarks.push({ name: nameInput, url: urlInput });
    }

    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    syncSettingsToStorage();

    bookmarkNameInput.value = '';
    bookmarkUrlInput.value = '';
    errorMessage.classList.add('hidden');

    renderSettingsList();
    bookmarkNameInput.focus();
}

function deleteBookmark(index) {
    bookmarks.splice(index, 1);
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
    syncSettingsToStorage();
    renderSettingsList();
}

function toggleSecondsOption() {
    showSeconds = secondsToggle.checked;
    const secSep = document.getElementById('sec-sep');
    const secGroup = document.getElementById('sec-group');

    if (showSeconds) {
        secSep.style.display = 'inline-block';
        secGroup.style.display = 'flex';
    } else {
        secSep.style.display = 'none';
        secGroup.style.display = 'none';
    }
    localStorage.setItem('showSeconds', showSeconds);
    update();
}

function handleBgColorChange(colorVal) {
    document.documentElement.style.setProperty('--bg-color', colorVal);
    localStorage.setItem('bgColor', colorVal);
}

function resetBgColor() {
    const defaultColor = '#0f1113';
    bgColorPicker.value = defaultColor;
    handleBgColorChange(defaultColor);
}

function handleBgUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const imgData = e.target.result;
        setBgImageStyle(imgData);
        try {
            localStorage.setItem('bgImage', imgData);
        } catch(error) {
            console.warn("Das Bild ist zu groß für localStorage.");
        }
    };
    reader.readAsDataURL(file);
}

function setBgImageStyle(imgData) {
    const container = document.getElementById('bg-image-container');
    const overlay = document.getElementById('bg-overlay');

    container.style.backgroundImage = `url(${imgData})`;
    container.classList.remove('opacity-0');
    container.classList.add('opacity-100');

    overlay.classList.remove('hidden');
    btnClearBg.classList.remove('hidden');
    overlayControl.classList.remove('hidden');
}

function clearBgImage() {
    const container = document.getElementById('bg-image-container');
    const overlay = document.getElementById('bg-overlay');

    container.style.backgroundImage = 'none';
    container.classList.remove('opacity-100');
    container.classList.add('opacity-0');

    overlay.classList.add('hidden');
    btnClearBg.classList.add('hidden');
    overlayControl.classList.add('hidden');
    bgUpload.value = '';

    localStorage.removeItem('bgImage');
}

function updateOverlayOpacity(val) {
    const overlay = document.getElementById('bg-overlay');
    overlayVal.textContent = val + '%';
    overlay.style.backgroundColor = `rgba(0, 0, 0, ${val / 100})`;
    localStorage.setItem('bgOverlayOpacity', val);
}

function focusSearch() {
    if (searchField) {
        searchField.focus();
    }
}

function matchBookmark(bm, query) {
    const val = query.toLowerCase().trim();
    if (!val) return false;

    // Check comma-separated triggers (e.g. "Google Mail, ma, mail...")
    const triggers = bm.name.toLowerCase().split(',').map(t => t.trim());
    
    // 1. Check if any trigger starts with the search query
    const triggerMatch = triggers.some(t => t.startsWith(val));
    if (triggerMatch) return true;

    // 2. Check if any word within the triggers starts with the search query
    const wordMatch = triggers.some(t => {
        const words = t.split(/\s+/);
        return words.some(w => w.startsWith(val));
    });
    if (wordMatch) return true;

    return false;
}

function findBookmarkByName(query) {
    const lowerQuery = query.toLowerCase().trim();
    let match = bookmarks.find(bm => {
        const triggers = bm.name.toLowerCase().split(',').map(t => t.trim());
        return triggers.includes(lowerQuery);
    });
    if (match) return match;

    if (useChromeFavorites) {
        match = chromeBookmarks.find(bm => {
            if (bm.name.toLowerCase() !== lowerQuery) return false;
            const isInFilter = isUrlInFilter(bm.url);
            return chromeBookmarkFilterMode === 'include' ? isInFilter : !isInFilter;
        });
        if (match) return match;
    }
    return null;
}

function fetchSuggestions(query) {
    if (!query) {
        hideSuggestions();
        return;
    }

    const lowerQuery = query.toLowerCase().trim();
    let suggestions = bookmarks.filter(bm => matchBookmark(bm, lowerQuery));

    if (useChromeFavorites) {
        const chromeSuggestions = chromeBookmarks.filter(bm => {
            if (!bm.name.toLowerCase().startsWith(lowerQuery)) return false;
            if (suggestions.some(s => s.url === bm.url)) return false;
            const isInFilter = isUrlInFilter(bm.url);
            return chromeBookmarkFilterMode === 'include' ? isInFilter : !isInFilter;
        });
        suggestions = suggestions.concat(chromeSuggestions);
    }

    showSuggestions(lowerQuery, suggestions, []);
}

function loadChromeBookmarks() {
    if (!chrome.bookmarks) return;

    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        chromeBookmarks = [];

        function extractBookmarks(nodes) {
            if (!nodes) return;
            for (const node of nodes) {
                if (node.url) {
                    const title = node.title || node.url;
                    chromeBookmarks.push({
                        name: title.toLowerCase().replace(/\s+/g, ' ').substring(0, 50),
                        url: node.url,
                        original: title
                    });
                }
                if (node.children) {
                    extractBookmarks(node.children);
                }
            }
        }

        extractBookmarks(bookmarkTreeNodes);
        renderChromeFilterList();
        syncSettingsToStorage();
    });
}

function renderChromeFilterList() {
    if (!chromeFilterList) return;
    chromeFilterList.innerHTML = '';

    if (chromeBookmarkFilterList.length === 0) {
        chromeFilterList.innerHTML = `<div class="text-zinc-600 text-[11px] py-1.5">Keine Lesezeichen im Filter.</div>`;
        return;
    }

    chromeBookmarkFilterList.forEach((url, index) => {
        let name = '';
        let desc = '';
        
        if (url.startsWith('domain:')) {
            name = 'Domain: ' + url.replace('domain:', '');
            desc = 'Alle Links mit dieser Domain';
        } else {
            const bm = chromeBookmarks.find(b => b.url === url);
            name = bm ? bm.original : url;
            desc = url;
        }

        const row = document.createElement('div');
        row.className = 'flex justify-between items-center bg-[#1a1e21] border border-zinc-800/60 rounded-xl px-3 py-2';
        row.innerHTML = `
            <div class="flex flex-col min-w-0 pr-2">
                <span class="text-white text-xs font-bold tracking-wide truncate">${escapeHtml(name)}</span>
                <span class="text-[10px] text-zinc-500 truncate max-w-[200px]">${escapeHtml(desc)}</span>
            </div>
            <button data-remove-filter="${index}" type="button" class="text-red-500 hover:text-red-400 font-medium text-[10px] px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer bg-transparent border-0 shrink-0">
                Entfernen
            </button>
        `;
        chromeFilterList.appendChild(row);
    });

    chromeFilterList.querySelectorAll('[data-remove-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-remove-filter'), 10);
            if (!isNaN(idx)) {
                chromeBookmarkFilterList.splice(idx, 1);
                localStorage.setItem('chromeBookmarkFilterList', JSON.stringify(chromeBookmarkFilterList));
                renderChromeFilterList();
                syncSettingsToStorage();
            }
        });
    });
}

const systemDomains = [
    'google.com', 'youtube.com', 'github.com', 'wikipedia.org', 'chatgpt.com', 'claude.ai'
];

function getBookmarkType(bm) {
    if (bm.type) return bm.type;
    const url = bm.url.toLowerCase();
    const isSystemDomain = systemDomains.some(domain => url.includes(domain));
    return isSystemDomain ? 'system' : 'user';
}

function setSuggestionItemStyle(li, isActive) {
    const itemType = li.dataset.itemType;
    const bookmarkType = li.dataset.bookmarkType;

    if (itemType === 'shortcut') {
        if (bookmarkType === 'user') {
            li.className = "suggestion-item bg-emerald-user" + (isActive ? " active" : "");
        } else {
            li.className = "suggestion-item bg-cyan-system" + (isActive ? " active" : "");
        }
    } else {
        li.className = "suggestion-item bg-zinc-search" + (isActive ? " active" : "");
    }
}

function showSuggestions(query, matchedBookmarks, suggestions) {
    const listEl = suggestionsBox.querySelector('ul') || suggestionsBox;
    listEl.innerHTML = '';

    const totalItems = [];

    matchedBookmarks.forEach(bm => {
        const type = getBookmarkType(bm);
        const displayName = bm.name.split(',')[0].trim();
        totalItems.push({
            type: 'shortcut',
            bookmarkType: type,
            text: displayName,
            url: bm.url,
            displayText: displayName
        });
    });

    suggestions.slice(0, 5).forEach(s => {
        const term = (Array.isArray(s) ? s[0] : s)?.toString() || '';
        if (!term) return;

        if (!matchedBookmarks.some(bm => bm.name.split(',')[0].trim().toLowerCase() === term.toLowerCase())) {
            totalItems.push({
                type: 'search',
                text: term,
                displayText: term
            });
        }
    });

    if (totalItems.length === 0) {
        hideSuggestions();
        return;
    }

    activeSuggestionIndex = 0; // Standardmäßig das erste Element auswählen

    totalItems.forEach((item, index) => {
        const li = document.createElement('li');
        li.dataset.index = index;
        li.dataset.itemType = item.type;
        if (item.type === 'shortcut') {
            li.dataset.bookmarkType = item.bookmarkType;
        }

        setSuggestionItemStyle(li, index === activeSuggestionIndex);

        if (item.type === 'shortcut') {
            if (item.bookmarkType === 'user') {
                li.innerHTML = `
                    <div class="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4 text-emerald-400">
                            <path d="M5 3a2 2 0 00-2 2v16a1 1 0 001.555.832L12 17.8l7.445 5.032A1 1 0 0021 22V5a2 2 0 00-2-2H5z" />
                        </svg>
                        <span><strong>${escapeHtml(item.displayText)}</strong> öffnen</span>
                    </div>
                    <span class="kbd-badge">Tab ⇥</span>
                `;
            } else {
                li.innerHTML = `
                    <div class="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-cyan-400">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                        </svg>
                        <span>Zu <strong>${escapeHtml(item.displayText)}</strong> wechseln</span>
                    </div>
                    <span class="kbd-badge kbd-badge-cyan">Tab ⇥</span>
                `;
            }
        } else {
            li.innerHTML = `
                <div class="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-zinc-400">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" />
                    </svg>
                    <span>Suche nach <strong>${escapeHtml(item.displayText)}</strong></span>
                </div>
                <span class="kbd-badge">Enter ↵</span>
            `;
        }

        li.addEventListener('click', () => {
            if (item.type === 'shortcut') {
                window.location.href = item.url;
            } else {
                searchField.value = item.text;
                searchForm.submit();
            }
        });

        listEl.appendChild(li);
    });

    suggestionsBox.classList.remove('hidden');
}

function hideSuggestions() {
    suggestionsBox.classList.add('hidden');
    const listEl = suggestionsBox.querySelector('ul');
    if (listEl) {
        listEl.innerHTML = '';
    } else {
        suggestionsBox.innerHTML = '';
    }
    activeSuggestionIndex = -1;
}

function updateActiveSuggestion() {
    const listEl = suggestionsBox.querySelector('ul') || suggestionsBox;
    const items = listEl.querySelectorAll('.suggestion-item');
    items.forEach((item, index) => {
        const isActive = (index === activeSuggestionIndex);
        setSuggestionItemStyle(item, isActive);
        
        if (isActive) {
            item.scrollIntoView({ block: 'nearest' });
            if (item.dataset.itemType === 'search') {
                const strong = item.querySelector('span strong');
                if (strong) {
                    searchField.value = strong.textContent;
                }
            }
        }
    });
}

function handleResize() {
    if (window.innerHeight < 520 || window.innerWidth < 640) {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }
}

function toggleChromeFavorites() {
    useChromeFavorites = chromeBookmarksToggle.checked;
    localStorage.setItem('useChromeFavorites', useChromeFavorites);
    if (chromeBookmarksFilterContainer) {
        if (useChromeFavorites) {
            chromeBookmarksFilterContainer.classList.remove('hidden');
        } else {
            chromeBookmarksFilterContainer.classList.add('hidden');
        }
    }
    syncSettingsToStorage();
}

function loadSavedSettings() {
    const savedBookmarks = localStorage.getItem('bookmarks');
    if (savedBookmarks) {
        bookmarks = JSON.parse(savedBookmarks);
        
        // Migration: Ensure AI tools are included once
        if (!localStorage.getItem('ai_migrated_v1')) {
            const aiBookmarks = [
                { name: "gemini", url: "https://gemini.google.com" },
                { name: "chatgpt, gpt", url: "https://chatgpt.com" },
                { name: "claude", url: "https://claude.ai" }
            ];
            
            aiBookmarks.forEach(ai => {
                if (!bookmarks.some(bm => bm.url === ai.url)) {
                    bookmarks.push(ai);
                }
            });
            localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
            localStorage.setItem('ai_migrated_v1', 'true');
        }
    }

    // Migration V2: Ensure user's trigger-rich bookmarks are set
    if (!localStorage.getItem('bookmarks_migrated_v2')) {
        const defaultTriggers = [
            { name: "Google Mail, ma, mai, mail, mails, gmail", url: "https://mail.google.com" },
            { name: "YouTube, yt, youtube, vids, video", url: "https://youtube.com" },
            { name: "GitHub, gh, github, git, code", url: "https://github.com" },
            { name: "Wikipedia Deutschland, deutschland, de, germany, deu", url: "https://de.wikipedia.org/wiki/Deutschland" }
        ];

        defaultTriggers.forEach(defaultBm => {
            const idx = bookmarks.findIndex(bm => bm.url.includes(new URL(defaultBm.url).hostname));
            if (idx !== -1) {
                bookmarks[idx].name = defaultBm.name;
                bookmarks[idx].url = defaultBm.url;
            } else {
                bookmarks.push(defaultBm);
            }
        });
        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
        localStorage.setItem('bookmarks_migrated_v2', 'true');
    }

    // Sync to chrome.storage.local on load
    syncSettingsToStorage();

    const savedSeconds = localStorage.getItem('showSeconds');
    if (savedSeconds !== null) {
        const isEnabled = (savedSeconds === 'true');
        secondsToggle.checked = isEnabled;
        toggleSecondsOption();
    }

    const savedFilterMode = localStorage.getItem('chromeBookmarkFilterMode');
    if (savedFilterMode) {
        chromeBookmarkFilterMode = savedFilterMode;
        if (chromeFilterMode) chromeFilterMode.value = chromeBookmarkFilterMode;
    }

    const savedFilterList = localStorage.getItem('chromeBookmarkFilterList');
    if (savedFilterList) {
        chromeBookmarkFilterList = JSON.parse(savedFilterList);
    }

    const savedChromeFavorites = localStorage.getItem('useChromeFavorites');
    if (savedChromeFavorites !== null) {
        const isEnabled = (savedChromeFavorites === 'true');
        useChromeFavorites = isEnabled;
        if (chromeBookmarksToggle) {
            chromeBookmarksToggle.checked = isEnabled;
        }
    }

    if (useChromeFavorites && chromeBookmarksFilterContainer) {
        chromeBookmarksFilterContainer.classList.remove('hidden');
    }

    const savedColor = localStorage.getItem('bgColor');
    if (savedColor) {
        bgColorPicker.value = savedColor;
        handleBgColorChange(savedColor);
    }

    const savedImage = localStorage.getItem('bgImage');
    const savedOpacity = localStorage.getItem('bgOverlayOpacity');
    if (savedImage) {
        setBgImageStyle(savedImage);
        if (savedOpacity) {
            overlaySlider.value = savedOpacity;
            updateOverlayOpacity(savedOpacity);
        } else {
            updateOverlayOpacity(50);
        }
    }

    loadChromeBookmarks();
}

// ============ EVENT LISTENERS ============

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        document.body.classList.add('fullscreen-active');
        if (searchField) searchField.blur();
        hideSuggestions();
    } else {
        document.body.classList.remove('fullscreen-active');
        setTimeout(focusSearch, 150);
    }
});

document.body.addEventListener('dblclick', (e) => {
    if (!searchForm.contains(e.target) && !settingsModal.contains(e.target)) {
        toggleFullscreen();
    }
});

if (searchField) {
    searchField.addEventListener('focus', () => {
        if (searchIconContainer) {
            searchIconContainer.style.color = 'var(--accent-color)';
            searchIconContainer.style.opacity = '1';
        }
    });

    searchField.addEventListener('blur', () => {
        if (searchIconContainer) {
            searchIconContainer.style.color = 'rgba(120, 113, 108, 0.5)';
            searchIconContainer.style.opacity = '0.4';
        }
    });

    searchField.addEventListener('input', () => {
        if (searchField.value.trim().length > 0) {
            clearBtn.style.display = 'block';
        } else {
            clearBtn.style.display = 'none';
        }
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            fetchSuggestions(searchField.value.trim());
        }, 100);
    });

    searchField.addEventListener('keydown', (e) => {
        const items = suggestionsBox.querySelectorAll('.suggestion-item');

        if (e.key === 'ArrowDown') {
            if (items.length > 0) {
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                updateActiveSuggestion();
            }
        } else if (e.key === 'ArrowUp') {
            if (items.length > 0) {
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                updateActiveSuggestion();
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        } else if (e.key === 'Tab') {
            const query = searchField.value.trim();
            if (!query) return;

            let match = findBookmarkByName(query);
            if (!match) {
                const lowerQuery = query.toLowerCase();
                match = bookmarks.find(bm => bm.name.startsWith(lowerQuery));
                if (!match && useChromeFavorites) {
                    match = chromeBookmarks.find(bm => {
                        if (!bm.name.toLowerCase().startsWith(lowerQuery)) return false;
                        const isInFilter = isUrlInFilter(bm.url);
                        return chromeBookmarkFilterMode === 'include' ? isInFilter : !isInFilter;
                    });
                }
            }

            if (match) {
                e.preventDefault();
                window.location.href = match.url;
                return;
            }

            if (isDirectUrl(query)) {
                e.preventDefault();
                window.location.href = /^https?:\/\//i.test(query) ? query : 'https://' + query;
            }
        }
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        searchField.value = '';
        clearBtn.style.display = 'none';
        hideSuggestions();
        focusSearch();
    });
}

if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
        if (activeSuggestionIndex >= 0) {
            const activeItem = suggestionsBox.querySelectorAll('.suggestion-item')[activeSuggestionIndex];
            if (activeItem) {
                e.preventDefault();
                activeItem.click();
                return;
            }
        }

        const query = searchField.value.trim();
        const match = findBookmarkByName(query);
        if (match) {
            e.preventDefault();
            window.location.href = match.url;
            return;
        }

        if (isDirectUrl(query)) {
            e.preventDefault();
            window.location.href = /^https?:\/\//i.test(query) ? query : 'https://' + query;
        }
    });
}

document.addEventListener('click', (e) => {
    if (!searchForm.contains(e.target)) {
        hideSuggestions();
    }

    const isDrawerActive = settingsModal.classList.contains('active');
    if (!isDrawerActive && e.target !== searchField && !e.target.closest('a') && !e.target.closest('button')) {
        focusSearch();
    }
});

// Settings Modal Button Listeners
if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);
if (btnCloseSettingsX) btnCloseSettingsX.addEventListener('click', closeSettingsModal);
if (btnFinishSettings) btnFinishSettings.addEventListener('click', closeSettingsModal);
if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeSettingsModal);
if (btnSettingsBack) btnSettingsBack.addEventListener('click', goToMainPage);

if (btnMenuShortcuts) btnMenuShortcuts.addEventListener('click', () => openSubpage('shortcuts', 'Kürzel & Shortcuts'));
if (btnMenuAppearance) btnMenuAppearance.addEventListener('click', () => openSubpage('appearance', 'Aussehen anpassen'));

if (btnAddShortcut) btnAddShortcut.addEventListener('click', saveBookmark);
if (bookmarkNameInput) bookmarkNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveBookmark();
});
if (bookmarkUrlInput) bookmarkUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveBookmark();
});

if (secondsToggle) secondsToggle.addEventListener('change', toggleSecondsOption);
if (chromeBookmarksToggle) chromeBookmarksToggle.addEventListener('change', toggleChromeFavorites);

if (chromeFilterMode) {
    chromeFilterMode.addEventListener('change', (e) => {
        chromeBookmarkFilterMode = e.target.value;
        localStorage.setItem('chromeBookmarkFilterMode', chromeBookmarkFilterMode);
        renderChromeFilterList();
        syncSettingsToStorage();
    });
}

if (chromeFilterSearch) {
    chromeFilterSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        chromeFilterSearchResults.innerHTML = '';
        
        if (!query) {
            chromeFilterSearchResults.classList.add('hidden');
            return;
        }

        const matches = chromeBookmarks.filter(bm => 
            bm.original.toLowerCase().includes(query) || bm.url.toLowerCase().includes(query)
        ).slice(0, 10);

        if (matches.length === 0) {
            chromeFilterSearchResults.innerHTML = `<div class="p-3 text-[11px] text-zinc-500 text-center">Keine gefunden</div>`;
            chromeFilterSearchResults.classList.remove('hidden');
            return;
        }

        matches.forEach(bm => {
            const isAlreadyAdded = chromeBookmarkFilterList.includes(bm.url);
            const row = document.createElement('div');
            row.className = 'cursor-pointer flex justify-between items-center transition-colors';
            row.style.padding = '0.75rem';
            row.style.borderBottom = '1px solid rgba(39, 39, 42, 0.5)';
            row.style.fontSize = '0.75rem';
            if (isAlreadyAdded) {
                row.style.opacity = '0.5';
                row.style.pointerEvents = 'none';
            }
            row.onmouseenter = () => row.style.backgroundColor = '#1a1e21';
            row.onmouseleave = () => row.style.backgroundColor = 'transparent';
            
            row.innerHTML = `
                <div style="min-width: 0; flex: 1; padding-right: 0.5rem; text-align: left;">
                    <div style="color: white; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(bm.original)}</div>
                    <div style="font-size: 10px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(bm.url)}</div>
                </div>
                ${isAlreadyAdded ? '<span style="color: #71717a; font-size: 10px;">Hinzugefügt</span>' : '<span style="color: #54d8cc; font-weight: bold; font-size: 1.125rem; line-height: 1;">+</span>'}
            `;
            if (!isAlreadyAdded) {
                row.addEventListener('click', () => {
                    chromeBookmarkFilterList.push(bm.url);
                    localStorage.setItem('chromeBookmarkFilterList', JSON.stringify(chromeBookmarkFilterList));
                    chromeFilterSearch.value = '';
                    chromeFilterSearchResults.classList.add('hidden');
                    renderChromeFilterList();
                    syncSettingsToStorage();
                });
            }
            chromeFilterSearchResults.appendChild(row);
        });

        chromeFilterSearchResults.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!chromeFilterSearch.contains(e.target) && !chromeFilterSearchResults.contains(e.target)) {
            chromeFilterSearchResults.classList.add('hidden');
        }
    });
}

const addDomainFilterBtn = document.getElementById('add-domain-filter-btn');
if (addDomainFilterBtn) {
    addDomainFilterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const domain = chromeFilterSearch.value.trim().toLowerCase();
        if (domain) {
            const filterValue = 'domain:' + domain;
            if (!chromeBookmarkFilterList.includes(filterValue)) {
                chromeBookmarkFilterList.push(filterValue);
                localStorage.setItem('chromeBookmarkFilterList', JSON.stringify(chromeBookmarkFilterList));
                chromeFilterSearch.value = '';
                chromeFilterSearchResults.classList.add('hidden');
                renderChromeFilterList();
                syncSettingsToStorage();
            }
        }
    });
}

if (bgColorPicker) bgColorPicker.addEventListener('input', (e) => handleBgColorChange(e.target.value));
if (btnResetBgColor) btnResetBgColor.addEventListener('click', resetBgColor);
if (bgUpload) bgUpload.addEventListener('change', (e) => handleBgUpload(e.target));
if (btnClearBg) btnClearBg.addEventListener('click', clearBgImage);
if (overlaySlider) overlaySlider.addEventListener('input', (e) => updateOverlayOpacity(e.target.value));

window.addEventListener('resize', handleResize);

// Live storage synchronization (from Options page)
window.addEventListener('storage', (e) => {
    if (e.key === 'bookmarks') {
        if (e.newValue) {
            bookmarks = JSON.parse(e.newValue);
            if (settingsModal.classList.contains('active') && !subpageShortcuts.classList.contains('hidden')) {
                renderSettingsList();
            }
        }
    } else if (e.key === 'showSeconds') {
        const active = (e.newValue === 'true');
        secondsToggle.checked = active;
        toggleSecondsOption();
    } else if (e.key === 'bgColor') {
        if (e.newValue) {
            bgColorPicker.value = e.newValue;
            handleBgColorChange(e.newValue);
        }
    } else if (e.key === 'bgImage') {
        if (e.newValue) {
            setBgImageStyle(e.newValue);
        } else {
            clearBgImage();
        }
    } else if (e.key === 'bgOverlayOpacity') {
        if (e.newValue) {
            overlaySlider.value = e.newValue;
            updateOverlayOpacity(e.newValue);
        }
    } else if (e.key === 'useChromeFavorites') {
        const active = (e.newValue === 'true');
        chromeBookmarksToggle.checked = active;
        toggleChromeFavorites();
    } else if (e.key === 'chromeBookmarkFilterMode') {
        if (e.newValue) {
            chromeBookmarkFilterMode = e.newValue;
            if (chromeFilterMode) chromeFilterMode.value = e.newValue;
            renderChromeFilterList();
        }
    } else if (e.key === 'chromeBookmarkFilterList') {
        if (e.newValue) {
            chromeBookmarkFilterList = JSON.parse(e.newValue);
            renderChromeFilterList();
        }
    }
});

// Init
handleResize();
loadSavedSettings();
update();
setInterval(update, 1000);

