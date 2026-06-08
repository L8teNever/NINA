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

// Bookmarks Widget DOM Elements
const bookmarksView = document.getElementById('bookmarks-view');
const mainDashboardContainer = document.getElementById('main-dashboard-container');
const toggleBookmarksBtn = document.getElementById('toggle-bookmarks-btn');
const bookmarksFolderTree = document.getElementById('bookmarks-folder-tree');
const bookmarksSearchInput = document.getElementById('bookmarks-search-input');
const bookmarksContent = document.getElementById('bookmarks-content');
const bookmarksBreadcrumbs = document.getElementById('bookmarks-breadcrumbs');
const viewModeGridBtn = document.getElementById('view-mode-grid-btn');
const viewModeListBtn = document.getElementById('view-mode-list-btn');

// Bookmarks Dialog DOM selectors
const bookmarksDialogOverlay = document.getElementById('bookmarks-dialog-overlay');
const bookmarksDialogCard = document.getElementById('bookmarks-dialog-card');
const bookmarksDialogTitle = document.getElementById('bookmarks-dialog-title');
const closeBookmarksDialogBtn = document.getElementById('close-bookmarks-dialog');
const dialogCancelBtn = document.getElementById('dialog-cancel-btn');
const dialogSaveBtn = document.getElementById('dialog-save-btn');
const dialogItemTitle = document.getElementById('dialog-item-title');
const dialogItemUrl = document.getElementById('dialog-item-url');
const dialogItemUrlContainer = document.getElementById('dialog-item-url-container');
const bookmarksDialogEditFields = document.getElementById('bookmarks-dialog-edit-fields');
const bookmarksDialogMoveFields = document.getElementById('bookmarks-dialog-move-fields');
const dialogItemParent = document.getElementById('dialog-item-parent');
const bookmarksDialogDeleteText = document.getElementById('bookmarks-dialog-delete-text');
const dialogDeleteName = document.getElementById('dialog-delete-name');

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

// Bookmarks Widget State
let bookmarksViewActive = false;
let bookmarkTreeRoot = null;
let activeFolderId = '1';
let expandedFolders = new Set(['1', '2']);
let dialogTargetItemId = null;
let dialogActionType = null;
let dialogIsFolder = false;
let bookmarksViewMode = localStorage.getItem('bookmarksViewMode') || 'grid';

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
        let chromeSuggestions = chromeBookmarks.filter(bm => {
            const title = (bm.original || bm.name || '').toLowerCase();
            const url = (bm.url || '').toLowerCase();
            // Treffer in Titel ODER URL (konsistent mit der Lesezeichen-Widget-Suche)
            if (!title.includes(lowerQuery) && !url.includes(lowerQuery)) return false;
            if (suggestions.some(s => s.url === bm.url)) return false;
            const isInFilter = isUrlInFilter(bm.url);
            return chromeBookmarkFilterMode === 'include' ? isInFilter : !isInFilter;
        });
        // Treffer mit passendem Wortanfang im Titel zuerst anzeigen (relevanter)
        chromeSuggestions.sort((a, b) => {
            const aStarts = (a.original || a.name || '').toLowerCase().startsWith(lowerQuery) ? 0 : 1;
            const bStarts = (b.original || b.name || '').toLowerCase().startsWith(lowerQuery) ? 0 : 1;
            return aStarts - bStarts;
        });
        suggestions = suggestions.concat(chromeSuggestions);
    }

    showSuggestions(lowerQuery, suggestions, []);
}

function loadChromeBookmarks() {
    if (!chrome.bookmarks) return;

    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        chromeBookmarks = [];
        if (bookmarkTreeNodes && bookmarkTreeNodes.length > 0) {
            bookmarkTreeRoot = bookmarkTreeNodes[0];
            
            // Set default active folder if not set
            if (!activeFolderId && bookmarkTreeRoot.children && bookmarkTreeRoot.children.length > 0) {
                const firstFolder = bookmarkTreeRoot.children.find(c => c.children) || bookmarkTreeRoot.children[0];
                activeFolderId = firstFolder.id;
            }
        }

        function extractBookmarks(nodes, path = []) {
            if (!nodes) return;
            for (const node of nodes) {
                if (node.url) {
                    const title = node.title || node.url;
                    chromeBookmarks.push({
                        id: node.id,
                        parentId: node.parentId,
                        name: title.toLowerCase().replace(/\s+/g, ' ').substring(0, 50),
                        url: node.url,
                        original: title,
                        path: path.join(' > ')
                    });
                }
                if (node.children) {
                    const folderTitle = node.title || (node.id === '0' ? '' : 'Ordner');
                    const newPath = folderTitle ? [...path, folderTitle] : path;
                    extractBookmarks(node.children, newPath);
                }
            }
        }

        extractBookmarks(bookmarkTreeNodes);
        renderChromeFilterList();
        syncSettingsToStorage();

        // If the bookmarks view is active, update it
        if (bookmarksViewActive) {
            renderBookmarksSidebar();
            renderBookmarksContent();
        }
    });
}

// ============ BOOKMARKS WIDGET LOGIC ============

function getDomain(url) {
    try {
        return new URL(url).hostname.replace('www.', '');
    } catch(e) {
        return url;
    }
}

function getFaviconUrl(url) {
    try {
        return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    } catch(e) {
        return 'icons/icon32.png';
    }
}

function findFolderInTree(node, folderId) {
    if (!node) return null;
    if (node.id === folderId) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findFolderInTree(child, folderId);
            if (found) return found;
        }
    }
    return null;
}

function renderBookmarksSidebar() {
    if (!bookmarksFolderTree || !bookmarkTreeRoot) return;
    
    const topLevelFolders = bookmarkTreeRoot.children || [];
    
    function buildTreeHtml(nodes, depth = 0) {
        let html = '';
        nodes.forEach(node => {
            if (node.children) {
                const folderId = node.id;
                const title = node.title || (folderId === '0' ? 'Root' : 'Ordner');
                const hasSubfolders = node.children.some(child => child.children);
                const isExpanded = expandedFolders.has(folderId);
                const isActive = (activeFolderId === folderId);
                
                html += `
                    <div class="folder-tree-node">
                        <div class="folder-tree-row flex items-center hover:bg-white/5 rounded-lg group select-none ${isActive ? 'bg-cyan-500/10 text-cyan-400' : 'text-zinc-300'}">
                            <!-- Toggle Button (Expand/Collapse) -->
                            <button class="folder-toggle-btn w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white transition-colors bg-transparent border-0 cursor-pointer ${hasSubfolders ? '' : 'opacity-0 pointer-events-none'}" data-folder-id="${folderId}">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}">
                                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                                </svg>
                            </button>
                            <!-- Label & Icon -->
                            <div class="folder-label flex items-center gap-2 flex-grow py-2 px-1 text-xs font-medium cursor-pointer truncate" data-folder-id="${folderId}">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-cyan-500/60 group-hover:text-cyan-400 transition-colors'}">
                                    <path d="M2 4.5A1.5 1.5 0 013.5 3h6.22a1.5 1.5 0 011.06.44l1.56 1.56a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5v-10z" />
                                </svg>
                                <span class="truncate">${escapeHtml(title)}</span>
                            </div>
                        </div>
                `;
                
                if (isExpanded && hasSubfolders) {
                    html += `
                        <div class="folder-children border-l border-white/5 ml-3 pl-1">
                            ${buildTreeHtml(node.children, depth + 1)}
                        </div>
                    `;
                }
                
                html += `</div>`;
            }
        });
        return html;
    }
    
    bookmarksFolderTree.innerHTML = buildTreeHtml(topLevelFolders, 0);
    
    bookmarksFolderTree.querySelectorAll('.folder-label').forEach(el => {
        el.addEventListener('click', (e) => {
            const folderId = e.currentTarget.dataset.folderId;
            activeFolderId = folderId;
            if (bookmarksSearchInput) bookmarksSearchInput.value = '';
            renderBookmarksSidebar();
            renderBookmarksContent();
        });
    });
    
    bookmarksFolderTree.querySelectorAll('.folder-toggle-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const folderId = e.currentTarget.dataset.folderId;
            if (expandedFolders.has(folderId)) {
                expandedFolders.delete(folderId);
            } else {
                expandedFolders.add(folderId);
            }
            renderBookmarksSidebar();
        });
    });
}

function getFolderPath(node) {
    const path = [];
    let current = node;
    while (current && current.id !== '0') {
        path.unshift(current);
        if (current.parentId) {
            current = findFolderInTree(bookmarkTreeRoot, current.parentId);
        } else {
            break;
        }
    }
    return path;
}

function renderBreadcrumbs(node) {
    if (!bookmarksBreadcrumbs) return;
    
    const path = getFolderPath(node);
    let html = '';
    
    html += `
        <span class="breadcrumb-item text-zinc-500 hover:text-white cursor-pointer transition-colors font-medium select-none" data-folder-id="1">Lesezeichen</span>
    `;
    
    path.forEach((folder, index) => {
        const title = folder.title || 'Ordner';
        const displayName = (folder.id === '1' && index === 0) ? '' : title;
        if (!displayName) return;
        
        html += `
            <span class="text-zinc-600 shrink-0 select-none">/</span>
            <span class="breadcrumb-item truncate max-w-[120px] font-medium transition-colors cursor-pointer ${index === path.length - 1 ? 'text-cyan-400 pointer-events-none' : 'text-zinc-500 hover:text-white'}" data-folder-id="${folder.id}">
                ${escapeHtml(displayName)}
            </span>
        `;
    });
    
    bookmarksBreadcrumbs.innerHTML = html;
    
    bookmarksBreadcrumbs.querySelectorAll('.breadcrumb-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const folderId = e.currentTarget.dataset.folderId;
            activeFolderId = folderId;
            if (bookmarksSearchInput) bookmarksSearchInput.value = '';
            renderBookmarksSidebar();
            renderBookmarksContent();
        });
    });
}

function updateViewModeButtons() {
    if (!viewModeGridBtn || !viewModeListBtn) return;
    if (bookmarksViewMode === 'list') {
        viewModeGridBtn.classList.remove('bg-white/10', 'text-white');
        viewModeGridBtn.classList.add('text-zinc-500', 'hover:text-white');
        viewModeListBtn.classList.remove('text-zinc-500', 'hover:text-white');
        viewModeListBtn.classList.add('bg-white/10', 'text-white');
    } else {
        viewModeListBtn.classList.remove('bg-white/10', 'text-white');
        viewModeListBtn.classList.add('text-zinc-500', 'hover:text-white');
        viewModeGridBtn.classList.remove('text-zinc-500', 'hover:text-white');
        viewModeGridBtn.classList.add('bg-white/10', 'text-white');
    }
}

function renderBookmarksContent() {
    if (!bookmarksContent || !bookmarkTreeRoot) return;
    
    // Update visual state of view mode buttons
    updateViewModeButtons();
    
    const query = bookmarksSearchInput ? bookmarksSearchInput.value.trim() : '';
    if (query) {
        renderBookmarksSearchResults(query);
        return;
    }
    
    const activeNode = findFolderInTree(bookmarkTreeRoot, activeFolderId);
    if (!activeNode) {
        bookmarksContent.innerHTML = `<div class="text-zinc-500 text-sm text-center py-12">Ordner nicht gefunden.</div>`;
        return;
    }
    
    renderBreadcrumbs(activeNode);
    
    const children = activeNode.children || [];
    const folders = children.filter(child => child.children);
    const links = children.filter(child => child.url);
    
    if (folders.length === 0 && links.length === 0) {
        bookmarksContent.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-zinc-600 mb-3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0017.25 3H6.75A2.25 2.25 0 004.5 5.25v6a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <div class="text-zinc-400 font-semibold text-sm">Dieser Ordner ist leer</div>
                <div class="text-zinc-600 text-xs mt-1">Keine Lesezeichen oder Unterordner enthalten.</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    const isList = (bookmarksViewMode === 'list');
    
    if (folders.length > 0) {
        if (isList) {
            html += `
                <div class="mb-6">
                    <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3 select-none">Ordner</h4>
                    <div class="bookmarks-list-wrapper">
            `;
            
            folders.forEach(folder => {
                const itemCount = folder.children ? folder.children.length : 0;
                html += `
                    <div class="bookmarks-list-item bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-3 cursor-pointer transition-all duration-300 group flex items-center justify-between" data-folder-id="${folder.id}">
                        <div class="flex items-center gap-3 min-w-0 pr-24">
                            <div class="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4.5 h-4.5">
                                    <path d="M2 4.5A1.5 1.5 0 013.5 3h6.22a1.5 1.5 0 011.06.44l1.56 1.56a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5v-10z" />
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <div class="text-white text-sm font-semibold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(folder.title)}</div>
                                <div class="text-zinc-500 text-xs mt-0.5">${itemCount} Element${itemCount === 1 ? '' : 'e'}</div>
                            </div>
                        </div>
                        <!-- Action Overlay -->
                        <div class="card-actions-overlay">
                            <button class="card-action-btn btn-edit" data-item-id="${folder.id}" data-is-folder="true" title="Umbenennen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button class="card-action-btn btn-move" data-item-id="${folder.id}" data-is-folder="true" title="Verschieben">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                            </button>
                            <button class="card-action-btn btn-delete" data-item-id="${folder.id}" data-is-folder="true" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="mb-8">
                    <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-4 select-none">Ordner</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            `;
            
            folders.forEach(folder => {
                const itemCount = folder.children ? folder.children.length : 0;
                html += `
                    <div class="bookmarks-folder-card bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-300 group" data-folder-id="${folder.id}">
                        <!-- Action Overlay -->
                        <div class="card-actions-overlay">
                            <button class="card-action-btn btn-edit" data-item-id="${folder.id}" data-is-folder="true" title="Umbenennen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button class="card-action-btn btn-move" data-item-id="${folder.id}" data-is-folder="true" title="Verschieben">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                            </button>
                            <button class="card-action-btn btn-delete" data-item-id="${folder.id}" data-is-folder="true" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        </div>
                        <div class="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                                <path d="M2 4.5A1.5 1.5 0 013.5 3h6.22a1.5 1.5 0 011.06.44l1.56 1.56a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5v-10z" />
                            </svg>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="text-white text-sm font-semibold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(folder.title)}</div>
                            <div class="text-zinc-500 text-xs">${itemCount} Element${itemCount === 1 ? '' : 'e'}</div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    }
    
    if (links.length > 0) {
        if (isList) {
            html += `
                <div>
                    <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3 select-none">Lesezeichen</h4>
                    <div class="bookmarks-list-wrapper">
            `;
            
            links.forEach(bm => {
                html += `
                    <div class="bookmarks-list-item bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-3 cursor-pointer transition-all duration-300 group flex items-center justify-between" data-url="${bm.url}">
                        <div class="flex items-center gap-3 min-w-0 pr-24">
                            <div class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                                <img class="w-4 h-4 object-contain" src="${getFaviconUrl(bm.url)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2371717a%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z%22/></svg>'" />
                            </div>
                            <div class="min-w-0">
                                <div class="text-white text-sm font-semibold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(bm.title || 'Lesezeichen')}</div>
                                <div class="text-zinc-500 text-xs mt-0.5 truncate max-w-xl">${escapeHtml(getDomain(bm.url))} <span class="text-zinc-600/70 select-none">•</span> <span class="text-zinc-600">${escapeHtml(bm.url)}</span></div>
                            </div>
                        </div>
                        <!-- Action Overlay -->
                        <div class="card-actions-overlay">
                            <button class="card-action-btn btn-edit" data-item-id="${bm.id}" data-is-folder="false" title="Bearbeiten">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button class="card-action-btn btn-move" data-item-id="${bm.id}" data-is-folder="false" title="Verschieben">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                            </button>
                            <button class="card-action-btn btn-delete" data-item-id="${bm.id}" data-is-folder="false" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        } else {
            html += `
                <div>
                    <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-4 select-none">Lesezeichen</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            `;
            
            links.forEach(bm => {
                html += `
                    <div data-url="${bm.url}" class="bookmarks-item-card bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 group h-32" title="${escapeHtml(bm.title)}">
                        <!-- Action Overlay -->
                        <div class="card-actions-overlay">
                            <button class="card-action-btn btn-edit" data-item-id="${bm.id}" data-is-folder="false" title="Bearbeiten">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                            </button>
                            <button class="card-action-btn btn-move" data-item-id="${bm.id}" data-is-folder="false" title="Verschieben">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                            </button>
                            <button class="card-action-btn btn-delete" data-item-id="${bm.id}" data-is-folder="false" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                        </div>
                        <div class="flex items-start gap-3">
                            <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                                <img class="w-5 h-5 object-contain" src="${getFaviconUrl(bm.url)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2371717a%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z%22/></svg>'" />
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="text-white text-xs font-bold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(bm.title || 'Lesezeichen')}</div>
                                <div class="text-zinc-500 text-[10px] truncate mt-0.5">${escapeHtml(getDomain(bm.url))}</div>
                            </div>
                        </div>
                        <div class="text-zinc-600 text-[10px] truncate group-hover:text-zinc-400 transition-colors mt-2">
                            ${escapeHtml(bm.url)}
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    }
    
    bookmarksContent.innerHTML = html;
}

function renderBookmarksSearchResults(query) {
    if (!bookmarksContent || !chromeBookmarks) return;
    
    if (bookmarksBreadcrumbs) {
        bookmarksBreadcrumbs.innerHTML = `
            <span class="text-zinc-500 select-none font-medium">Suchergebnisse für:</span>
            <span class="text-cyan-400 font-bold truncate">"${escapeHtml(query)}"</span>
        `;
    }
    
    const lowerQuery = query.toLowerCase();
    const results = chromeBookmarks.filter(bm => 
        bm.original.toLowerCase().includes(lowerQuery) || bm.url.toLowerCase().includes(lowerQuery)
    );
    
    if (results.length === 0) {
        bookmarksContent.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 text-zinc-600 mb-3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.773 4.773z" />
                </svg>
                <div class="text-zinc-400 font-semibold text-sm">Keine Lesezeichen gefunden</div>
                <div class="text-zinc-600 text-xs mt-1">Versuche es mit anderen Suchbegriffen.</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    const isList = (bookmarksViewMode === 'list');
    
    if (isList) {
        html += `
            <div>
                <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3 select-none">${results.length} Treffer</h4>
                <div class="bookmarks-list-wrapper">
        `;
        
        results.forEach(bm => {
            html += `
                <div class="bookmarks-list-item bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-3 cursor-pointer transition-all duration-300 group flex items-center justify-between" data-url="${bm.url}">
                    <div class="flex items-center gap-3 min-w-0 pr-24">
                        <div class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                            <img class="w-4 h-4 object-contain" src="${getFaviconUrl(bm.url)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2371717a%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z%22/></svg>'" />
                        </div>
                        <div class="min-w-0">
                            <div class="text-white text-sm font-semibold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(bm.original || 'Lesezeichen')}</div>
                            <div class="text-zinc-500 text-xs mt-0.5 truncate max-w-xl">
                                ${escapeHtml(getDomain(bm.url))}
                                ${bm.path ? ` <span class="text-cyan-500/70 select-none">•</span> <span class="text-cyan-500/70">in: ${escapeHtml(bm.path)}</span>` : ''}
                                 <span class="text-zinc-600/70 select-none">•</span> <span class="text-zinc-600">${escapeHtml(bm.url)}</span>
                            </div>
                        </div>
                    </div>
                    <!-- Action Overlay -->
                    <div class="card-actions-overlay">
                        <button class="card-action-btn btn-edit" data-item-id="${bm.id}" data-is-folder="false" title="Bearbeiten">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button class="card-action-btn btn-move" data-item-id="${bm.id}" data-is-folder="false" title="Verschieben">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                        </button>
                        <button class="card-action-btn btn-delete" data-item-id="${bm.id}" data-is-folder="false" title="Löschen">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    } else {
        html += `
            <div>
                <h4 class="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-4 select-none">${results.length} Treffer</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        `;
        
        results.forEach(bm => {
            html += `
                <div data-url="${bm.url}" class="bookmarks-item-card bg-[#1a1e21]/40 hover:bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 group h-32" title="${escapeHtml(bm.original)}">
                    <!-- Action Overlay -->
                    <div class="card-actions-overlay">
                        <button class="card-action-btn btn-edit" data-item-id="${bm.id}" data-is-folder="false" title="Bearbeiten">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button class="card-action-btn btn-move" data-item-id="${bm.id}" data-is-folder="false" title="Verschieben">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" /></svg>
                        </button>
                        <button class="card-action-btn btn-delete" data-item-id="${bm.id}" data-is-folder="false" title="Löschen">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-3 h-3"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                    </div>
                    <div class="flex items-start gap-3">
                        <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 group-hover:scale-105 transition-transform duration-300">
                            <img class="w-5 h-5 object-contain" src="${getFaviconUrl(bm.url)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%2371717a%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z%22/></svg>'" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="text-white text-xs font-bold truncate group-hover:text-cyan-300 transition-colors">${escapeHtml(bm.original || 'Lesezeichen')}</div>
                            <div class="text-zinc-500 text-[10px] truncate mt-0.5">${escapeHtml(getDomain(bm.url))}</div>
                            ${bm.path ? `<div class="text-cyan-500/70 text-[9px] truncate mt-0.5" style="letter-spacing: 0.02em;">in: ${escapeHtml(bm.path)}</div>` : ''}
                        </div>
                    </div>
                    <div class="text-zinc-600 text-[10px] truncate group-hover:text-zinc-400 transition-colors mt-2">
                        ${escapeHtml(bm.url)}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    bookmarksContent.innerHTML = html;
}

function toggleBookmarksView() {
    bookmarksViewActive = !bookmarksViewActive;
    
    if (bookmarksViewActive) {
        loadChromeBookmarks();
        
        if (toggleBookmarksBtn) {
            toggleBookmarksBtn.classList.remove('text-zinc-400');
            toggleBookmarksBtn.classList.add('text-cyan-400');
        }
        
        if (mainDashboardContainer) {
            mainDashboardContainer.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                mainDashboardContainer.classList.add('hidden');
                
                if (bookmarksView) {
                    bookmarksView.classList.remove('hidden');
                    bookmarksView.offsetHeight; // force reflow
                    bookmarksView.classList.remove('opacity-0', 'scale-95');
                    bookmarksView.classList.add('opacity-100', 'scale-100');
                }
            }, 300);
        }
        
        setTimeout(() => {
            if (bookmarksSearchInput) bookmarksSearchInput.focus();
        }, 400);
    } else {
        if (toggleBookmarksBtn) {
            toggleBookmarksBtn.classList.remove('text-cyan-400');
            toggleBookmarksBtn.classList.add('text-zinc-400');
        }
        
        if (bookmarksView) {
            bookmarksView.classList.remove('opacity-100', 'scale-100');
            bookmarksView.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                bookmarksView.classList.add('hidden');
                
                if (mainDashboardContainer) {
                    mainDashboardContainer.classList.remove('hidden');
                    mainDashboardContainer.offsetHeight; // force reflow
                    mainDashboardContainer.classList.remove('opacity-0', 'scale-95');
                    mainDashboardContainer.classList.add('opacity-100', 'scale-100');
                    focusSearch();
                }
            }, 300);
        }
    }
}

// ============ BOOKMARKS ACTION DIALOG LOGIC ============

function findBookmarkInTree(node, itemId) {
    if (!node) return null;
    if (node.id === itemId) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findBookmarkInTree(child, itemId);
            if (found) return found;
        }
    }
    return null;
}

function getAllFolders(node, list = []) {
    if (!node) return list;
    if (node.children) {
        const title = node.title || (node.id === '0' ? 'Hauptordner' : 'Ordner');
        list.push({ id: node.id, title: title });
        node.children.forEach(child => {
            if (child.children) {
                getAllFolders(child, list);
            }
        });
    }
    return list;
}

function populateMoveFolderDropdown(currentItemId) {
    if (!dialogItemParent || !bookmarkTreeRoot) return;
    
    dialogItemParent.innerHTML = '';
    const allFolders = getAllFolders(bookmarkTreeRoot);
    
    allFolders.forEach(folder => {
        if (folder.id === currentItemId) return;
        
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.title;
        dialogItemParent.appendChild(option);
    });
}

function openBookmarksDialog(itemId, actionType, isFolder) {
    dialogTargetItemId = itemId;
    dialogActionType = actionType;
    dialogIsFolder = isFolder;
    
    if (!bookmarksDialogOverlay || !bookmarksDialogCard) return;
    
    bookmarksDialogEditFields.classList.add('hidden');
    bookmarksDialogMoveFields.classList.add('hidden');
    bookmarksDialogDeleteText.classList.add('hidden');
    
    const node = findBookmarkInTree(bookmarkTreeRoot, itemId);
    const itemTitleText = node ? node.title : '';
    const itemUrlText = node ? node.url : '';
    
    if (actionType === 'edit') {
        bookmarksDialogTitle.textContent = isFolder ? 'Ordner umbenennen' : 'Lesezeichen bearbeiten';
        bookmarksDialogEditFields.classList.remove('hidden');
        
        if (dialogItemTitle) dialogItemTitle.value = itemTitleText;
        if (dialogItemUrl) dialogItemUrl.value = itemUrlText || '';
        
        if (isFolder) {
            dialogItemUrlContainer.classList.add('hidden');
        } else {
            dialogItemUrlContainer.classList.remove('hidden');
        }
    } else if (actionType === 'move') {
        bookmarksDialogTitle.textContent = isFolder ? 'Ordner verschieben' : 'Lesezeichen verschieben';
        bookmarksDialogMoveFields.classList.remove('hidden');
        populateMoveFolderDropdown(itemId);
        
        if (node && node.parentId) {
            dialogItemParent.value = node.parentId;
        }
    } else if (actionType === 'delete') {
        bookmarksDialogTitle.textContent = isFolder ? 'Ordner löschen' : 'Lesezeichen löschen';
        bookmarksDialogDeleteText.classList.remove('hidden');
        if (dialogDeleteName) dialogDeleteName.textContent = itemTitleText || (isFolder ? 'diesen Ordner' : 'dieses Lesezeichen');
    }
    
    bookmarksDialogOverlay.classList.remove('hidden');
    bookmarksDialogOverlay.offsetHeight; // reflow
    bookmarksDialogOverlay.classList.remove('opacity-0');
    bookmarksDialogOverlay.classList.add('opacity-100');
    bookmarksDialogCard.classList.remove('scale-95');
    bookmarksDialogCard.classList.add('scale-100');
}

function closeBookmarksDialog() {
    if (!bookmarksDialogOverlay || !bookmarksDialogCard) return;
    
    bookmarksDialogOverlay.classList.remove('opacity-100');
    bookmarksDialogOverlay.classList.add('opacity-0');
    bookmarksDialogCard.classList.remove('scale-100');
    bookmarksDialogCard.classList.add('scale-95');
    
    setTimeout(() => {
        bookmarksDialogOverlay.classList.add('hidden');
    }, 300);
}

function handleSaveDialog() {
    if (!dialogTargetItemId || !dialogActionType) return;
    
    const callback = () => {
        closeBookmarksDialog();
        loadChromeBookmarks();
    };
    
    if (dialogActionType === 'edit') {
        const title = dialogItemTitle ? dialogItemTitle.value.trim() : '';
        const url = dialogItemUrl ? dialogItemUrl.value.trim() : '';
        
        if (dialogIsFolder) {
            chrome.bookmarks.update(dialogTargetItemId, { title }, callback);
        } else {
            chrome.bookmarks.update(dialogTargetItemId, { title, url }, callback);
        }
    } else if (dialogActionType === 'move') {
        const parentId = dialogItemParent ? dialogItemParent.value : null;
        if (parentId) {
            chrome.bookmarks.move(dialogTargetItemId, { parentId }, callback);
        }
    } else if (dialogActionType === 'delete') {
        if (dialogIsFolder) {
            chrome.bookmarks.removeTree(dialogTargetItemId, callback);
        } else {
            chrome.bookmarks.remove(dialogTargetItemId, callback);
        }
    }
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
    if (!isDrawerActive && !bookmarksViewActive && e.target !== searchField && !e.target.closest('a') && !e.target.closest('button')) {
        focusSearch();
    }
});

// Tastatureingaben direkt an das Suchfeld weiterleiten, wenn kein anderes Eingabefeld fokussiert ist
document.addEventListener('keydown', (e) => {
    // Tastatur-Shortcuts ignorieren (z. B. Ctrl+V, Ctrl+Shift+I)
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    // Ignorieren, wenn ein Einstellungs- oder Lesezeichendialog offen ist
    const isDrawerActive = settingsModal && settingsModal.classList.contains('active');
    const isDialogActive = bookmarksDialogOverlay && !bookmarksDialogOverlay.classList.contains('hidden');
    if (isDrawerActive || isDialogActive) return;

    // Ignorieren, wenn der Fokus bereits auf einem Formular- oder Eingabefeld liegt
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
    }

    // Wenn eine druckbare Taste gedrückt wird (Länge 1), Fokus auf das passende Suchfeld setzen
    if (e.key.length === 1) {
        if (bookmarksViewActive) {
            if (bookmarksSearchInput) bookmarksSearchInput.focus();
        } else {
            if (searchField) searchField.focus();
        }
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

// Bookmarks Widget Button & Input Listeners
if (toggleBookmarksBtn) toggleBookmarksBtn.addEventListener('click', toggleBookmarksView);

if (bookmarksSearchInput) {
    bookmarksSearchInput.addEventListener('input', () => {
        renderBookmarksContent();
    });
}

// Delegated click listeners on bookmarks content area for card actions & navigation
if (bookmarksContent) {
    bookmarksContent.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.card-action-btn.btn-edit');
        const moveBtn = e.target.closest('.card-action-btn.btn-move');
        const deleteBtn = e.target.closest('.card-action-btn.btn-delete');
        
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = editBtn.dataset.itemId;
            const isFolder = editBtn.dataset.isFolder === 'true';
            openBookmarksDialog(itemId, 'edit', isFolder);
            return;
        }
        
        if (moveBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = moveBtn.dataset.itemId;
            const isFolder = moveBtn.dataset.isFolder === 'true';
            openBookmarksDialog(itemId, 'move', isFolder);
            return;
        }
        
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = deleteBtn.dataset.itemId;
            const isFolder = deleteBtn.dataset.isFolder === 'true';
            openBookmarksDialog(itemId, 'delete', isFolder);
            return;
        }

        // Folder click
        const folderCard = e.target.closest('.bookmarks-folder-card, .bookmarks-list-item[data-folder-id]');
        if (folderCard) {
            e.preventDefault();
            const folderId = folderCard.dataset.folderId;
            activeFolderId = folderId;
            expandedFolders.add(folderId);
            renderBookmarksSidebar();
            renderBookmarksContent();
            return;
        }

        // Bookmark click
        const bookmarkCard = e.target.closest('.bookmarks-item-card, .bookmarks-list-item[data-url]');
        if (bookmarkCard) {
            e.preventDefault();
            const url = bookmarkCard.dataset.url;
            if (url) {
                window.open(url, '_blank');
            }
            return;
        }
    });
}

// Layout view mode toggles
if (viewModeGridBtn) {
    viewModeGridBtn.addEventListener('click', () => {
        bookmarksViewMode = 'grid';
        localStorage.setItem('bookmarksViewMode', 'grid');
        updateViewModeButtons();
        renderBookmarksContent();
    });
}

if (viewModeListBtn) {
    viewModeListBtn.addEventListener('click', () => {
        bookmarksViewMode = 'list';
        localStorage.setItem('bookmarksViewMode', 'list');
        updateViewModeButtons();
        renderBookmarksContent();
    });
}

// Dialog Actions Bindings
if (closeBookmarksDialogBtn) closeBookmarksDialogBtn.addEventListener('click', closeBookmarksDialog);
if (dialogCancelBtn) dialogCancelBtn.addEventListener('click', closeBookmarksDialog);
if (dialogSaveBtn) dialogSaveBtn.addEventListener('click', handleSaveDialog);
if (bookmarksDialogOverlay) {
    bookmarksDialogOverlay.addEventListener('click', (e) => {
        if (e.target === bookmarksDialogOverlay) {
            closeBookmarksDialog();
        }
    });
}

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

// Suchfeld beim Laden der Seite sofort fokussieren
focusSearch();
// Zusätzliche Verzögerungen, um Browser-Standardfokus-Verhalten zu überschreiben
setTimeout(focusSearch, 50);
setTimeout(focusSearch, 150);

