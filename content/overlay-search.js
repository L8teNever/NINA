// Deine persönliche Lesezeichen-Datenbank (wird dynamisch überschrieben, sobald synchronisiert)
let bookmarks = [
    { name: "Google Mail, ma, mai, mail, mails, gmail", url: "https://mail.google.com", type: "system" },
    { name: "YouTube, yt, youtube, vids, video", url: "https://youtube.com", type: "system" },
    { name: "GitHub, gh, github, git, code", url: "https://github.com", type: "system" },
    { name: "Wikipedia Deutschland, deutschland, de, germany, deu", url: "https://de.wikipedia.org/wiki/Deutschland", type: "user" }
];
let chromeBookmarks = [];
let useChromeFavorites = false;
let chromeBookmarkFilterMode = 'exclude';
let chromeBookmarkFilterList = [];

function updateBookmarks() {
    if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([
            'bookmarks',
            'chromeBookmarks',
            'useChromeFavorites',
            'chromeBookmarkFilterMode',
            'chromeBookmarkFilterList'
        ], (result) => {
            if (result.bookmarks && result.bookmarks.length > 0) {
                bookmarks = result.bookmarks;
            }
            if (result.chromeBookmarks) {
                chromeBookmarks = result.chromeBookmarks;
            }
            if (result.useChromeFavorites !== undefined) {
                useChromeFavorites = result.useChromeFavorites;
            }
            if (result.chromeBookmarkFilterMode) {
                chromeBookmarkFilterMode = result.chromeBookmarkFilterMode;
            }
            if (result.chromeBookmarkFilterList) {
                chromeBookmarkFilterList = result.chromeBookmarkFilterList;
            }
        });
    }
}

// Globaler Status
let isOverlayOpen = false;
let activeSuggestionIndex = -1;
let activeShortcutUrl = null;
let currentMatches = [];
let originalHtmlOverflow = '';
let originalBodyOverflow = '';

// DOM-Referenzen (im Shadow Root)
let searchOverlay, searchContainer, searchInput, suggestionsDropdown, suggestionsList, searchForm, belowSearchWrapper, clearSearch;

// Root-Container und Shadow Root
let rootContainer = document.getElementById('nina-global-search-overlay-root');
let shadow = null;function initOverlay() {
    if (rootContainer) return;
    
    if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("NINA: Extension-Kontext ist ungültig. Bitte lade diese Webseite neu (F5)!");
        return;
    }
    
    rootContainer = document.createElement('div');
    rootContainer.id = 'nina-global-search-overlay-root';
    rootContainer.style.setProperty('all', 'initial'); // Verhindert CSS-Vererbung von der Host-Seite
    rootContainer.style.position = 'fixed';
    rootContainer.style.top = '0';
    rootContainer.style.left = '0';
    rootContainer.style.width = '100vw';
    rootContainer.style.height = '100vh';
    rootContainer.style.zIndex = '2147483647'; // Höchstmöglicher z-Index
    rootContainer.style.pointerEvents = 'none'; // Standardmäßig Klicks durchlassen
    
    document.body.appendChild(rootContainer);
    
    shadow = rootContainer.attachShadow({mode: 'open'});
    
    // CSS per Link einbetten (Tailwind)
    const tailwindLink = document.createElement('link');
    tailwindLink.rel = 'stylesheet';
    tailwindLink.href = chrome.runtime.getURL('ui/tailwind.min.css');
    shadow.appendChild(tailwindLink);
    
    // Eigene Zusatzstile zur Absicherung gegen Host-Seiten-Einflüsse und für vergrößerte Darstellung
    const style = document.createElement('style');
    style.textContent = `
        .material-glow {
            background: radial-gradient(circle at 50% 45%, rgba(6, 182, 212, 0.12) 0%, rgba(8, 145, 178, 0.03) 45%, rgba(11, 12, 14, 0) 75%) !important;
        }
        
        #searchOverlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(11, 12, 14, 0.96) !important; /* Obsidian-Transparenz matching New Tab */
            backdrop-filter: blur(20px) !important; /* Premium-Verschwommenheit */
            -webkit-backdrop-filter: blur(20px) !important;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            visibility: hidden;
        }
        
        #searchOverlay.active {
            opacity: 1 !important;
            pointer-events: auto !important;
            visibility: visible !important;
        }

        #searchContainer {
            width: 100%;
            max-width: 704px !important; /* content width 672px + px-4 (32px) matching New Tab page */
            margin-left: auto;
            margin-right: auto;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
            box-sizing: border-box !important;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transform: scale(0.96) translateY(-8vh); /* Matches New Tab vertical align */
            opacity: 0;
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
        }
        
        #searchOverlay.active #searchContainer {
            transform: scale(1) translateY(-8vh) !important;
            opacity: 1 !important;
        }

        #searchWrapper {
            width: 100% !important;
            position: relative;
        }

        #searchForm {
            position: relative;
            display: flex;
            align-items: center;
            background-color: rgba(30, 31, 34, 0.75) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 9999px !important;
            padding: 1rem 1.5rem !important; /* Originales, kompaktes Padding */
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
            z-index: 30 !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }
        
        #searchForm:hover {
            background-color: rgba(37, 39, 42, 0.8) !important;
            border-color: rgba(255, 255, 255, 0.12) !important;
        }

        #searchForm:focus-within {
            background-color: rgba(37, 39, 42, 0.85) !important;
            border-color: rgba(6, 182, 212, 0.4) !important;
            box-shadow: 0 0 35px rgba(6, 182, 212, 0.25), 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
        }

        #searchInput {
            flex-grow: 1 !important;
            background-color: transparent !important;
            border: none !important;
            outline: none !important;
            color: #ffffff !important;
            font-size: 1rem !important; /* Originale Größe wiederhergestellt */
            font-family: 'Inter', sans-serif !important;
            font-weight: 400 !important;
            padding: 0 1rem 0 0 !important; /* pr-4 equivalent */
            margin: 0 !important;
            box-shadow: none !important;
        }
        
        #searchInput::placeholder {
            color: rgba(156, 163, 175, 0.6) !important;
            font-weight: 400 !important;
        }

        #clearSearch {
            display: none;
            align-items: center;
            justify-content: center;
            color: #71717a !important; /* text-zinc-500 */
            transition: all 0.2s ease !important;
            background: transparent !important;
            border: none !important;
            cursor: pointer !important;
            padding: 0.25rem !important;
            margin-right: 0.5rem !important; /* mr-2 */
        }
        #clearSearch:hover {
            color: #22d3ee !important; /* text-cyan-400 */
            background-color: rgba(255, 255, 255, 0.05) !important;
        }
        #clearSearch svg {
            width: 1.25rem;
            height: 1.25rem;
        }

        #belowSearchWrapper {
            position: relative;
            margin-top: 2rem; /* Atmenraum */
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
        }
        
        #belowSearchWrapper.has-input {
            margin-top: 0 !important;
        }

        #belowSearchWrapper.has-input #quickLinksDock {
            display: none !important; /* Versteckt Quick-Links, wenn gesucht wird */
        }

        #quickLinksDock {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            gap: 1.25rem; /* Genügend Spacigkeit */
            width: auto;
            max-width: 100%;
            transition: all 0.3s ease;
        }

        .quick-link {
            display: flex;
            align-items: center;
            gap: 0.5rem !important;
            padding: 0.625rem 1.5rem !important; /* Slightly smaller padding */
            border-radius: 9999px !important;
            font-size: 0.95rem !important; /* Slightly smaller text size */
            font-weight: 500 !important;
            text-decoration: none !important;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            cursor: pointer !important;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
            white-space: nowrap !important;
            outline: none !important;
        }
        
        .quick-link svg {
            width: 1.15rem !important;
            height: 1.15rem !important;
        }

        /* YouTube Link */
        .quick-link-youtube {
            background-color: rgba(239, 68, 68, 0.08) !important;
            border: 1px solid rgba(239, 68, 68, 0.15) !important;
            color: #fca5a5 !important;
        }
        .quick-link-youtube:hover {
            background-color: rgba(239, 68, 68, 0.15) !important;
            border-color: rgba(239, 68, 68, 0.45) !important;
            color: #ff8787 !important;
            box-shadow: 0 0 30px rgba(239, 68, 68, 0.25), 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            transform: translateY(-3px) scale(1.03) !important;
        }

        /* Gmail Link */
        .quick-link-gmail {
            background-color: rgba(6, 182, 212, 0.08) !important;
            border: 1px solid rgba(6, 182, 212, 0.15) !important;
            color: #a5f3fc !important;
        }
        .quick-link-gmail:hover {
            background-color: rgba(6, 182, 212, 0.15) !important;
            border-color: rgba(6, 182, 212, 0.45) !important;
            color: #67e8f9 !important;
            box-shadow: 0 0 30px rgba(6, 182, 212, 0.25), 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            transform: translateY(-3px) scale(1.03) !important;
        }

        /* GitHub Link */
        .quick-link-github {
            background-color: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(255, 255, 255, 0.10) !important;
            color: #e5e7eb !important;
        }
        .quick-link-github:hover {
            background-color: rgba(255, 255, 255, 0.08) !important;
            border-color: rgba(255, 255, 255, 0.3) !important;
            color: #ffffff !important;
            box-shadow: 0 0 30px rgba(255, 255, 255, 0.15), 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            transform: translateY(-3px) scale(1.03) !important;
        }

        /* Wikipedia Link */
        .quick-link-wikipedia {
            background-color: rgba(16, 185, 129, 0.08) !important;
            border: 1px solid rgba(16, 185, 129, 0.15) !important;
            color: #a7f3d0 !important;
        }
        .quick-link-wikipedia:hover {
            background-color: rgba(16, 185, 129, 0.15) !important;
            border-color: rgba(16, 185, 129, 0.45) !important;
            color: #34d399 !important;
            box-shadow: 0 0 30px rgba(16, 185, 129, 0.25), 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            transform: translateY(-3px) scale(1.03) !important;
        }

        /* Notizen Button */
        .quick-link-notes {
            background-color: rgba(139, 92, 246, 0.08) !important;
            border: 1px solid rgba(139, 92, 246, 0.15) !important;
            color: #c4b5fd !important;
        }
        .quick-link-notes:hover {
            background-color: rgba(139, 92, 246, 0.15) !important;
            border-color: rgba(139, 92, 246, 0.45) !important;
            color: #a78bfa !important;
            box-shadow: 0 0 30px rgba(139, 92, 246, 0.25), 0 10px 25px rgba(0, 0, 0, 0.25) !important;
            transform: translateY(-3px) scale(1.03) !important;
        }

        #suggestionsDropdown {
            position: absolute !important;
            top: 105% !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 50 !important;
            width: 100% !important;
            background-color: rgba(30, 31, 34, 0.85) !important;
            backdrop-filter: blur(15px) !important;
            -webkit-backdrop-filter: blur(15px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 24px !important;
            margin-top: 0.25rem !important; /* mt-1 */
            padding: 0 !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
            overflow: hidden !important;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        
        #suggestionsList {
            list-style: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-height: 380px !important;
            overflow-y: auto !important;
        }
        
        #suggestionsList::-webkit-scrollbar {
            width: 10px !important;
        }
        #suggestionsList::-webkit-scrollbar-track {
            background: transparent !important;
        }
        #suggestionsList::-webkit-scrollbar-thumb {
            background: rgba(6, 182, 212, 0.15) !important;
            border-top: 8px solid transparent !important;
            border-bottom: 8px solid transparent !important;
            border-left: 2.5px solid transparent !important;
            border-right: 2.5px solid transparent !important;
            background-clip: padding-box !important;
            border-radius: 8px !important;
        }
        #suggestionsList::-webkit-scrollbar-thumb:hover {
            background: #06b6d4 !important;
            border-top: 8px solid transparent !important;
            border-bottom: 8px solid transparent !important;
            border-left: 2.5px solid transparent !important;
            border-right: 2.5px solid transparent !important;
            background-clip: padding-box !important;
        }
        
        .suggestion-item {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 0.75rem 1.5rem !important; /* Kompakte Zeilen */
            cursor: pointer !important;
            font-size: 0.875rem !important; /* Originale, kompakte Schriftgröße (14px) */
            color: #e5e7eb !important; /* Explicit text color matching New Tab */
            border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
            transition: all 0.2s ease !important;
            box-sizing: border-box !important;
        }
        
        .suggestion-item:last-child {
            border-bottom: none !important;
        }

        /* Keyboard Keycap Badges */
        .kbd-badge {
            font-size: 0.65rem !important;
            background-color: rgba(255, 255, 255, 0.08) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-bottom: 2px solid rgba(255, 255, 255, 0.2) !important;
            color: #d1d5db !important;
            font-weight: 600 !important;
            padding: 0.15rem 0.35rem !important;
            border-radius: 6px !important;
            letter-spacing: 0.05em !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }
        .kbd-badge-cyan {
            background-color: rgba(6, 182, 212, 0.15) !important;
            border: 1px solid rgba(6, 182, 212, 0.25) !important;
            border-bottom: 2px solid rgba(6, 182, 212, 0.4) !important;
            color: #67e8f9 !important;
        }

        /* Eigene Lesezeichen (Smaragd/Grün) */
        .suggestion-item.bg-emerald-user {
            background-color: rgba(16, 185, 129, 0.05) !important;
            color: #a7f3d0 !important;
        }
        .suggestion-item.bg-emerald-user.active, 
        .suggestion-item.bg-emerald-user:hover {
            background-color: rgba(16, 185, 129, 0.18) !important;
            color: #d1fae5 !important;
        }

        /* System-Lesezeichen (Cyan) */
        .suggestion-item.bg-cyan-system {
            background-color: rgba(6, 182, 212, 0.05) !important;
            color: #a5f3fc !important;
        }
        .suggestion-item.bg-cyan-system.active, 
        .suggestion-item.bg-cyan-system:hover {
            background-color: rgba(6, 182, 212, 0.18) !important;
            color: #cffafe !important;
        }

        /* Allgemeine Suche (Zink/Grau) */
        .suggestion-item.bg-zinc-search {
            background-color: rgba(255, 255, 255, 0.02) !important;
            color: #d1d5db !important;
        }
        .suggestion-item.bg-zinc-search.active, 
        .suggestion-item.bg-zinc-search:hover {
            background-color: rgba(255, 255, 255, 0.08) !important;
            color: #ffffff !important;
        }
    `;
    shadow.appendChild(style);
    
    // HTML in Wrapper einfügen
    const mainWrapper = document.createElement('div');
    mainWrapper.innerHTML = `
        <div id="searchOverlay" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;">
            <div class="material-glow absolute inset-0 pointer-events-none z-0"></div>
            <main id="searchContainer">
                <div id="searchWrapper" class="w-full relative">
                    
                    <form id="searchForm">
                        <input 
                            type="text" 
                            id="searchInput" 
                            placeholder="Suchen oder Kürzel..." 
                            autocomplete="off"
                        />
                        <!-- Clear Button -->
                        <button
                            type="button"
                            id="clearSearch"
                            class="text-zinc-500 hover:text-cyan-400 transition-all duration-200 flex items-center justify-center p-1 rounded-lg hover:bg-white/5 mr-2 bg-transparent border-0 cursor-pointer"
                            title="Suche leeren"
                            style="display: none;"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <button type="submit" class="text-cyan-400 hover:text-cyan-300 transition-colors p-1" title="Suchen" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.2" stroke="currentColor" class="w-6 h-6">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.602 10.602z" />
                            </svg>
                        </button>
                    </form>

                    <!-- Suggestions Dropdown (Material 3 Card) absolute positioned -->
                    <div id="suggestionsDropdown" class="hidden">
                        <ul id="suggestionsList" class="py-0">
                            <!-- Wird dynamisch befüllt -->
                        </ul>
                    </div>

                    <div id="belowSearchWrapper">
                        <div id="quickLinksDock">
                            <a href="https://youtube.com" class="quick-link quick-link-youtube">
                                <svg class="w-6 h-6 text-red-500 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
                                    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                                <span>YouTube</span>
                            </a>

                            <a href="https://mail.google.com" class="quick-link quick-link-gmail">
                                <svg class="w-6 h-6 text-cyan-400 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
                                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                </svg>
                                <span>Gmail</span>
                            </a>

                            <a href="https://github.com" class="quick-link quick-link-github">
                                <svg class="w-6 h-6 text-gray-300 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                                </svg>
                                <span>GitHub</span>
                            </a>

                            <a href="https://de.wikipedia.org/wiki/Deutschland" class="quick-link quick-link-wikipedia">
                                <svg class="w-6 h-6 text-emerald-400 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display: inline-block;">
                                    <path d="M12.09 3c-.158 0-.312.076-.412.21L8.358 7.915 5.617 3.21a.485.485 0 0 0-.417-.21H2.07c-.156 0-.295.074-.383.197a.498.498 0 0 0-.05.417l4.316 14.773a.49.49 0 0 0 .47.353h2.383c.21 0 .393-.134.457-.333l3.053-9.52 3.052 9.52c.064.2.247.333.457.333h2.383a.49.49 0 0 0 .47-.353l4.316-14.773a.498.498 0 0 0-.05-.417.476.476 0 0 0-.383-.197h-3.13c-.16 0-.314.076-.415.21l-2.741 4.705-3.32-4.495a.487.487 0 0 0-.412-.21z"/>
                                </svg>
                                <span>Wikipedia</span>
                            </a>

                            <button class="quick-link quick-link-notes" id="quick-link-notes-btn" type="button" title="Notizen öffnen">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="display: inline-block;">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                <span>Notizen</span>
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
    
    shadow.appendChild(mainWrapper);
    
    // DOM-Referenzen binden
    searchOverlay = shadow.getElementById('searchOverlay');
    searchContainer = shadow.getElementById('searchContainer');
    searchInput = shadow.getElementById('searchInput');
    suggestionsDropdown = shadow.getElementById('suggestionsDropdown');
    suggestionsList = shadow.getElementById('suggestionsList');
    searchForm = shadow.getElementById('searchForm');
    belowSearchWrapper = shadow.getElementById('belowSearchWrapper');
    clearSearch = shadow.getElementById('clearSearch');
    
    // Event Listeners binden
    searchInput.addEventListener('input', (e) => handleInput(e.target.value));
    searchInput.addEventListener('keydown', (e) => handleKeyDown(e));
    
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            triggerGoogleSearch(query);
        }
    });
    
    searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) {
            toggleSearchOverlay(false);
        }
    });
    
    // Quick-Links Klicks behandeln
    shadow.querySelectorAll('.quick-link').forEach(btn => {
        if (btn.id === 'quick-link-notes-btn') return; // Notizen-Button separat behandeln
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = btn.getAttribute('href');
            triggerShortcut(url);
        });
    });

    // Notizen-Button: öffnet das Notizen-Overlay
    const notesBtn = shadow.getElementById('quick-link-notes-btn');
    if (notesBtn) {
        notesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSearchOverlay(false);
            if (typeof window.__NINA_openNotes === 'function') {
                window.__NINA_openNotes();
            }
        });
    }

    // Clear Search Klick behandeln
    clearSearch.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = '';
        clearSearch.style.display = 'none';
        hideDropdown();
        updateCardVisuals("");
        searchInput.focus();
    });
}

function updateCardVisuals(value) {
    const val = value.trim();
    if (val.length > 0) {
        searchForm.classList.add('has-input');
        belowSearchWrapper.classList.add('has-input');
    } else {
        searchForm.classList.remove('has-input');
        belowSearchWrapper.classList.remove('has-input');
    }
}

function matchBookmark(bm, query) {
    const val = query.toLowerCase().trim();
    if (!val) return false;
    
    const triggers = bm.name.toLowerCase().split(',').map(t => t.trim());
    
    // 1. Check if any trigger starts with the search query
    const triggerMatch = triggers.some(t => t.startsWith(val));
    if (triggerMatch) return true;

    // 2. Check if any word within the triggers starts with the search query
    const wordMatch = triggers.some(t => {
        const words = t.split(/\s+/);
        return words.some(w => w.startsWith(val));
    });
    return wordMatch;
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

function handleInput(value) {
    const val = value.trim().toLowerCase();
    activeSuggestionIndex = 0; // Standardmäßig das erste Element auswählen
    activeShortcutUrl = null;

    updateCardVisuals(value);

    if (value.length > 0) {
        clearSearch.style.display = 'flex';
    } else {
        clearSearch.style.display = 'none';
    }

    if (!val) {
        hideDropdown();
        return;
    }

    // Passende Lesezeichen ermitteln
    let matches = bookmarks.filter(bm => matchBookmark(bm, val));

    if (useChromeFavorites) {
        const chromeSuggestions = chromeBookmarks.filter(bm => {
            if (!bm.name.toLowerCase().startsWith(val)) return false;
            if (matches.some(s => s.url === bm.url)) return false;
            const isInFilter = isUrlInFilter(bm.url);
            return chromeBookmarkFilterMode === 'include' ? isInFilter : !isInFilter;
        });
        matches = matches.concat(chromeSuggestions);
    }

    currentMatches = matches;

    renderDropdown(currentMatches, val);
}

function getBookmarkType(bm) {
    if (bm.type) return bm.type;
    const systemDomains = ['google.com', 'youtube.com', 'github.com', 'wikipedia.org', 'chatgpt.com', 'claude.ai'];
    const url = bm.url.toLowerCase();
    const isSystemDomain = systemDomains.some(domain => url.includes(domain));
    return isSystemDomain ? 'system' : 'user';
}

function renderDropdown(matches, query) {
    suggestionsList.innerHTML = "";
    
    if (matches.length > 0) {
        // Falls der Index ungültig ist, auf 0 zurücksetzen
        if (activeSuggestionIndex < 0 || activeSuggestionIndex >= matches.length) {
            activeSuggestionIndex = 0;
        }
        
        activeShortcutUrl = matches[activeSuggestionIndex] ? matches[activeSuggestionIndex].url : null;
        
        matches.forEach((bookmark, index) => {
            const li = document.createElement('li');
            const type = getBookmarkType(bookmark);
            const displayName = bookmark.name.split(',')[0].trim();
            
            li.dataset.index = index;
            li.dataset.itemType = 'shortcut';
            li.dataset.bookmarkType = type;
            li.dataset.url = bookmark.url;
            
            setSuggestionItemStyle(li, index === activeSuggestionIndex);
            
            if (type === "user") {
                li.innerHTML = `
                    <div class="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4 text-emerald-400" style="display: inline-block;">
                            <path d="M5 3a2 2 0 00-2 2v16a1 1 0 001.555.832L12 17.8l7.445 5.032A1 1 0 0021 22V5a2 2 0 00-2-2H5z" />
                        </svg>
                        <span><strong>${escapeHtml(displayName)}</strong> öffnen</span>
                    </div>
                    <span class="kbd-badge">Tab ⇥</span>
                `;
            } else {
                li.innerHTML = `
                    <div class="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4 h-4 text-cyan-400" style="display: inline-block;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                        </svg>
                        <span>Zu <strong>${escapeHtml(displayName)}</strong> wechseln</span>
                    </div>
                    <span class="kbd-badge kbd-badge-cyan">Tab ⇥</span>
                `;
            }
            
            li.onclick = () => {
                triggerShortcut(bookmark.url);
            };
            
            suggestionsList.appendChild(li);
        });
        
        suggestionsDropdown.classList.remove('hidden');
    } else {
        hideDropdown();
    }
}

function setSuggestionItemStyle(li, isActive) {
    const bookmarkType = li.dataset.bookmarkType;
    
    if (bookmarkType === 'user') {
        if (isActive) {
            li.className = "suggestion-item bg-emerald-user active";
        } else {
            li.className = "suggestion-item bg-emerald-user";
        }
    } else if (bookmarkType === 'system') {
        if (isActive) {
            li.className = "suggestion-item bg-cyan-system active";
        } else {
            li.className = "suggestion-item bg-cyan-system";
        }
    } else {
        if (isActive) {
            li.className = "suggestion-item bg-zinc-search active";
        } else {
            li.className = "suggestion-item bg-zinc-search";
        }
    }
}

function hideDropdown() {
    suggestionsDropdown.classList.add('hidden');
    suggestionsList.innerHTML = '';
    activeShortcutUrl = null;
    activeSuggestionIndex = -1;
}

function handleKeyDown(event) {
    if (event.key === "Tab" && !event.shiftKey && activeShortcutUrl) {
        event.preventDefault(); 
        triggerShortcut(activeShortcutUrl);
        return;
    }

    const listItems = suggestionsList.querySelectorAll('li');
    if (suggestionsDropdown.classList.contains('hidden') || listItems.length === 0) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex + 1) % listItems.length;
        updateActiveSuggestion(listItems);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeSuggestionIndex = (activeSuggestionIndex - 1 + listItems.length) % listItems.length;
        updateActiveSuggestion(listItems);
    } else if (event.key === "Enter") {
        event.preventDefault();
        const activeItem = listItems[activeSuggestionIndex > -1 ? activeSuggestionIndex : 0];
        if (activeItem) {
            if (activeItem.dataset.itemType === 'search') {
                const query = searchInput.value.trim();
                triggerGoogleSearch(query);
            } else {
                const url = activeItem.dataset.url;
                triggerShortcut(url);
            }
        } else {
            const query = searchInput.value.trim();
            if (query) {
                triggerGoogleSearch(query);
            }
        }
    } else if (event.key === "Escape") {
        event.preventDefault();
        toggleSearchOverlay(false);
    }
}

function updateActiveSuggestion(items) {
    items.forEach((item, index) => {
        const isActive = (index === activeSuggestionIndex);
        setSuggestionItemStyle(item, isActive);
        if (isActive) {
            item.scrollIntoView({ block: 'nearest' });
            if (item.dataset.itemType === 'search') {
                activeShortcutUrl = null;
            } else {
                activeShortcutUrl = item.dataset.url;
            }
        }
    });
}

function toggleSearchOverlay(forceState) {
    initOverlay();
    
    const show = (forceState !== undefined) ? forceState : !isOverlayOpen;
    isOverlayOpen = show;

    if (show) {
        updateBookmarks();
        
        // Disable webpage scrolling
        originalHtmlOverflow = document.documentElement.style.overflow || '';
        originalBodyOverflow = document.body.style.overflow || '';
        document.documentElement.style.setProperty('overflow', 'hidden', 'important');
        document.body.style.setProperty('overflow', 'hidden', 'important');

        rootContainer.style.pointerEvents = 'auto';
        searchOverlay.classList.add('active');
        
        searchContainer.style.opacity = '1';
        searchContainer.style.transform = 'scale(1) translateY(-8vh)';
        
        setTimeout(() => {
            searchInput.focus();
        }, 150);
    } else {
        // Restore webpage scrolling
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.overflow = originalBodyOverflow;
        if (!originalHtmlOverflow) document.documentElement.style.removeProperty('overflow');
        if (!originalBodyOverflow) document.body.style.removeProperty('overflow');

        rootContainer.style.pointerEvents = 'none';
        searchOverlay.classList.remove('active');
        
        searchContainer.style.opacity = '0';
        searchContainer.style.transform = 'scale(0.96) translateY(-8vh)';
        
        searchInput.blur();
        searchInput.value = "";
        if (clearSearch) clearSearch.style.display = 'none';
        hideDropdown();
        updateCardVisuals("");
    }
}

function triggerShortcut(url) {
    hideDropdown();
    toggleSearchOverlay(false); 
    window.open(url, '_blank'); 
}

// Google Suche im neuen Tab ausführen
function triggerGoogleSearch(query) {
    hideDropdown();
    toggleSearchOverlay(false); 
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

// Globaler Keydown-Listener für Ctrl+Space und Shift+Space in der Capturing-Phase (true)
// um sicherzustellen, dass Webseiten die Tasteneingabe nicht blockieren können.
document.addEventListener('keydown', (e) => {
    // Falls der Fokus in einem Eingabefeld liegt, ignorieren wir den Trigger (um normales Tippen nicht zu stören)
    const target = e.target;
    const isInput = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
    );
    if (isInput) return;

    // Leertaste abfangen (e.key === " " oder e.code === "Space" oder e.keyCode === 32)
    const isSpace = e.key === " " || e.code === "Space" || e.keyCode === 32;

    if (isSpace && (e.ctrlKey || e.shiftKey) && !e.altKey && !e.metaKey) {
        e.preventDefault(); 
        e.stopPropagation(); // Verhindert, dass die Webseite den Event abfängt und blockiert
        toggleSearchOverlay();
    }
}, true);

// Eager initialization on script run so styles and DOM structure are ready before keypress
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOverlay());
} else {
    initOverlay();
}
