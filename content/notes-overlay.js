// NINA Notes Overlay – Content Script
// Erstellt ein Shadow-DOM-Overlay über allen Seiten

(function () {
    if (window.__NINA_NOTES_LOADED__) return;
    window.__NINA_NOTES_LOADED__ = true;

    const STORAGE_KEY = 'nina_notes';
    const isStandalone = typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:' && window.location.pathname.endsWith('notes.html');
    let notes = [];
    let activeNoteId = null;
    let notesRootContainer = null;
    let notesShadow = null;
    let isNotesOpen = false;

    // ─── STORAGE HELPERS ───────────────────────────────────────────────────────

    function storageAvailable() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id;
    }

    function loadNotes(cb) {
        if (!storageAvailable()) { cb && cb(); return; }
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            notes = result[STORAGE_KEY] || [
                {
                    id: 'welcome-' + Date.now(),
                    title: 'Willkommen 🚀',
                    content: '<h1>Echtzeit-Schreibbereich & Dateiablage</h1><p>Hier kannst du direkt loslegen. Der Editor passt sich vollautomatisch deinen Wünschen an.</p><ul><li><strong>Automatischer Titel:</strong> Der Titel passt sich live deiner ersten geschriebenen Zeile an!</li><li><strong>Dateien & Bilder:</strong> Ziehe Dokumente, PDF-Dateien oder Bilder einfach per Drag-and-Drop in dieses Schreibfeld.</li><li>Tippe <code># </code> für eine große Überschrift, <code>- </code> für eine Liste.</li></ul>',
                    created: Date.now(),
                    updated: Date.now(),
                    driveFileId: null
                }
            ];
            cb && cb();
        });
    }

    function saveNotes(cb) {
        if (!storageAvailable()) { cb && cb(); return; }
        chrome.storage.local.set({ [STORAGE_KEY]: notes }, cb);
    }

    // ─── OVERLAY INIT ──────────────────────────────────────────────────────────

    function initNotesOverlay() {
        if (notesRootContainer) return;
        if (!storageAvailable()) {
            console.warn('NINA Notes: Extension-Kontext ungültig – bitte Seite neu laden (F5)');
            return;
        }

        notesRootContainer = document.createElement('div');
        notesRootContainer.id = 'nina-notes-overlay-root';
        notesRootContainer.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;' + (isStandalone ? 'pointer-events:auto;' : 'pointer-events:none;');
        document.body.appendChild(notesRootContainer);

        notesShadow = notesRootContainer.attachShadow({ mode: 'open' });

        // Tailwind
        const tw = document.createElement('link');
        tw.rel = 'stylesheet';
        tw.href = chrome.runtime.getURL('ui/tailwind.min.css');
        notesShadow.appendChild(tw);

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            :host {
                --m3-background-dark: #111214;
                --m3-surface-dark: #1A1C1E;
                --m3-surfaceVariant-dark: #2D3133;
                --m3-primary-dark: #80D8DF;
                --m3-primaryContainer-dark: #004F54;
                --m3-onPrimaryContainer-dark: #CCE8EA;
                --m3-outline-dark: #8A9296;
            }

            #notes-backdrop {
                position: fixed; inset: 0; z-index: 2147483640;
                display: flex; align-items: center; justify-content: center;
                background-color: rgba(17, 18, 20, 0.85);
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                opacity: 0; pointer-events: none; visibility: hidden;
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.35s;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            #notes-backdrop.active {
                opacity: 1 !important; pointer-events: auto !important; visibility: visible !important;
            }
            .material-glow {
                background: radial-gradient(circle at 50% 50%, rgba(128, 216, 223, 0.1) 0%, rgba(8, 145, 178, 0.02) 45%, rgba(11, 12, 14, 0) 75%) !important;
            }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.01); border-radius: 8px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(128, 216, 223, 0.15); border-radius: 8px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--m3-primary-dark); }

            .dashboard-container {
                position: relative;
                z-index: 1;
                width: 100%;
                max-width: 1100px;
                padding: 0 1rem;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .close-btn-wrapper {
                width: 100%;
                display: flex;
                justify-content: flex-end;
                margin-bottom: 0.75rem;
                gap: 8px;
            }

            #notes-dashboard {
                width: 100%;
                height: 82vh;
                min-height: 500px;
                max-height: 850px;
                background: rgba(26, 28, 30, 0.9);
                border: 1px solid var(--m3-surfaceVariant-dark);
                border-radius: 28px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
                display: flex;
                overflow: hidden;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
            }

            #notes-list-panel {
                width: 30%;
                border-right: 1px solid var(--m3-surfaceVariant-dark);
                display: flex;
                flex-direction: column;
                padding: 24px;
                min-width: 240px;
                max-width: 320px;
                background: rgba(17, 18, 20, 0.4);
            }

            .search-bar-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 20px;
                flex-shrink: 0;
            }
            .search-input-wrapper {
                position: relative;
                flex: 1;
            }
            .search-icon {
                position: absolute;
                left: 14px;
                top: 50%;
                transform: translateY(-50%);
                width: 16px;
                height: 16px;
                color: var(--m3-outline-dark);
            }

            #drive-status-bar {
                display: none;
                margin-bottom: 16px;
                flex-shrink: 0;
            }

            #notes-list-container {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-right: 4px;
            }

            #notes-editor-panel {
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 28px;
                background: transparent;
                min-width: 0;
            }

            .note-card {
                background-color: rgba(45, 49, 51, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.02);
                transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                cursor: pointer;
                border-radius: 16px;
                padding: 16px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            .note-card:hover {
                border-color: var(--m3-surfaceVariant-dark);
                background-color: rgba(45, 49, 51, 0.45);
                transform: translateY(-2px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
            }
            .note-card.active {
                border-color: var(--m3-primary-dark) !important;
                background-color: var(--m3-primaryContainer-dark) !important;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), inset 0 0 8px rgba(128, 216, 223, 0.05);
            }

            .note-card-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 4px;
            }

            .note-card-title {
                font-weight: 700;
                font-size: 0.8rem;
                color: #f1f5f9;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding-right: 8px;
            }
            .note-card.active .note-card-title {
                color: var(--m3-onPrimaryContainer-dark);
            }
            .note-card-date {
                font-size: 0.6rem;
                color: var(--m3-outline-dark);
                flex-shrink: 0;
            }
            .note-card.active .note-card-date {
                color: var(--m3-onPrimaryContainer-dark);
                opacity: 0.7;
            }
            .note-card-desc {
                font-size: 0.7rem;
                color: #94a3b8;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 1;
                -webkit-box-orient: vertical;
                line-height: 1.5;
                margin: 0;
            }
            .note-card.active .note-card-desc {
                color: var(--m3-onPrimaryContainer-dark);
                opacity: 0.85;
            }

            #note-search {
                width: 100%;
                background: var(--m3-background-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                color: #fff;
                border-radius: 9999px;
                padding: 10px 14px 10px 38px;
                font-size: 0.8rem;
                outline: none;
                font-family: inherit;
                transition: all 0.2s ease;
            }
            #note-search:focus {
                border-color: var(--m3-primary-dark);
                box-shadow: 0 0 12px rgba(128, 216, 223, 0.15);
            }

            #create-note-btn {
                width: 40px;
                height: 40px;
                padding: 0;
                flex-shrink: 0;
                background: var(--m3-primaryContainer-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                color: var(--m3-primary-dark);
                border-radius: 9999px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #create-note-btn:hover {
                background: var(--m3-primary-dark);
                color: var(--m3-background-dark);
                transform: scale(1.05);
            }
            #create-note-btn:active {
                transform: scale(0.95);
            }

            #drive-login-btn {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 14px;
                background: rgba(128, 216, 223, 0.05);
                border: 1px solid var(--m3-surfaceVariant-dark);
                border-radius: 12px;
                color: var(--m3-primary-dark);
                font-size: 0.75rem;
                font-weight: 600;
                font-family: inherit;
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #drive-login-btn:hover {
                background: rgba(128, 216, 223, 0.12);
                border-color: var(--m3-primary-dark);
            }
            #drive-login-btn.connected {
                background: var(--m3-primaryContainer-dark);
                border-color: var(--m3-primary-dark);
                color: var(--m3-onPrimaryContainer-dark);
            }

            #editor-placeholder {
                display: flex;
                flex-direction: column;
                flex: 1;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 24px;
            }
            .placeholder-icon-wrap {
                width: 64px;
                height: 64px;
                border-radius: 16px;
                background: rgba(128, 216, 223, 0.05);
                border: 1px solid var(--m3-surfaceVariant-dark);
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px;
                color: var(--m3-primary-dark);
                opacity: 0.7;
            }

            #editor-workspace {
                display: none;
                flex-direction: column;
                flex: 1;
                min-height: 0;
            }

            .editor-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--m3-surfaceVariant-dark);
                flex-shrink: 0;
                flex-wrap: wrap;
                gap: 8px;
            }
            #note-save-status {
                font-size: 0.75rem;
                color: var(--m3-outline-dark);
                display: flex;
                align-items: center;
                gap: 8px;
                user-select: none;
            }
            .status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #10b981;
                display: inline-block;
            }
            .status-dot.saving {
                animation: pulse 1s infinite;
            }
            @keyframes pulse {
                0% { opacity: 0.4; }
                50% { opacity: 1; }
                100% { opacity: 0.4; }
            }
            #note-char-counter {
                font-size: 0.7rem;
                color: var(--m3-outline-dark);
                background: var(--m3-background-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                padding: 4px 12px;
                border-radius: 9999px;
                user-select: none;
            }
            #note-delete-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                border-radius: 12px;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.2);
                color: #ef4444;
                font-size: 0.75rem;
                font-weight: 600;
                font-family: inherit;
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #note-delete-btn:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: #ef4444;
            }

            #note-editor-content {
                width: 100%;
                flex: 1;
                overflow-y: auto;
                border: 1px solid var(--m3-surfaceVariant-dark);
                border-radius: 20px;
                padding: 20px;
                background: var(--m3-background-dark);
                color: #cbd5e1;
                font-size: 0.95rem;
                line-height: 1.7;
                outline: none;
                resize: none;
                font-family: inherit;
                transition: border-color 0.2s ease;
            }
            #note-editor-content:focus {
                border-color: var(--m3-primary-dark);
            }

            #notes-expand-btn {
                background: var(--m3-surface-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--m3-outline-dark);
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #notes-expand-btn:hover {
                background: var(--m3-surfaceVariant-dark);
                color: #fff;
                transform: scale(1.1);
            }

            #notes-close-btn {
                background: var(--m3-surface-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--m3-outline-dark);
                font-size: 1.25rem;
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #notes-close-btn:hover {
                background: var(--m3-surfaceVariant-dark);
                color: #fff;
                transform: rotate(90deg);
            }

            #attachment-bar {
                display: none;
                flex-direction: column;
                gap: 8px;
                padding-bottom: 16px;
                margin-bottom: 14px;
                border-bottom: 1px solid var(--m3-surfaceVariant-dark);
                flex-shrink: 0;
            }
            .attachment-bar-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 4px;
            }
            .attachment-bar-title {
                font-size: 0.625rem;
                font-weight: 600;
                color: var(--m3-outline-dark);
                text-transform: uppercase;
                letter-spacing: 0.08em;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            #attachment-count {
                font-size: 0.5625rem;
                color: var(--m3-primary-dark);
                font-weight: 700;
                background: var(--m3-primaryContainer-dark);
                padding: 2px 8px;
                border-radius: 9999px;
                user-select: none;
            }
            #attachment-list {
                display: flex;
                gap: 8px;
                overflow-x: auto;
                padding: 4px 0;
            }
            .attachment-chip {
                position: relative;
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--m3-background-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                padding: 6px 12px 6px 8px;
                border-radius: 9999px;
                font-size: 0.75rem;
                color: #d1d5db;
                flex-shrink: 0;
                transition: all 0.2s ease;
                max-width: 200px;
            }
            .attachment-chip:hover {
                border-color: var(--m3-primary-dark);
                background: rgba(128, 216, 223, 0.05);
            }

            .att-chip-btn {
                padding: 3px;
                border-radius: 50%;
                background: transparent;
                border: 0;
                color: var(--m3-outline-dark);
                cursor: pointer;
                display: flex;
                transition: all 0.15s ease;
            }
            .att-chip-btn:hover {
                color: #fff;
                background: var(--m3-surfaceVariant-dark);
            }
            .att-chip-btn-del:hover {
                color: #ef4444;
                background: rgba(239, 68, 68, 0.15);
            }

            .att-chip-img {
                width: 24px;
                height: 24px;
                object-fit: cover;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                flex-shrink: 0;
                cursor: pointer;
            }
            .att-chip-doc-icon {
                padding: 4px;
                background: rgba(128, 216, 223, 0.1);
                border-radius: 6px;
                flex-shrink: 0;
                color: var(--m3-primary-dark);
            }
            .att-chip-doc-icon svg {
                width: 14px;
                height: 14px;
                display: block;
            }

            .editor-drag-over {
                border-color: var(--m3-primary-dark) !important;
                background-color: rgba(128, 216, 223, 0.04) !important;
                box-shadow: 0 0 25px rgba(128, 216, 223, 0.15) !important;
            }

            .editor-content-wrapper {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            #notes-backdrop.standalone {
                position: relative;
                width: 100vw;
                height: 100vh;
                background-color: #111214 !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                opacity: 1 !important;
                visibility: visible !important;
                pointer-events: auto !important;
            }
            #notes-backdrop.standalone .dashboard-container {
                width: 100vw;
                height: 100vh;
                max-width: none;
                padding: 0;
            }
            #notes-backdrop.standalone .close-btn-wrapper {
                position: absolute;
                top: 20px;
                right: 24px;
                width: auto;
                z-index: 100;
                margin-bottom: 0;
            }
            #notes-backdrop.standalone #notes-dashboard {
                width: 100vw;
                height: 100vh;
                max-height: none;
                max-width: none;
                border-radius: 0;
                border: none;
            }
            #notes-backdrop.standalone .editor-header {
                padding-right: 56px;
            }

            #note-editor-content h1 { font-size:1.75rem!important;font-weight:800!important;color:#ffffff!important;margin-top:1.5rem!important;margin-bottom:0.75rem!important;border-bottom:1px solid var(--m3-surfaceVariant-dark)!important;padding-bottom:0.25rem!important;display:block; }
            #note-editor-content h2 { font-size:1.4rem!important;font-weight:700!important;color:#f3f4f6!important;margin-top:1.25rem!important;margin-bottom:0.5rem!important;display:block; }
            #note-editor-content h3 { font-size:1.15rem!important;font-weight:600!important;color:#e5e7eb!important;margin-top:1rem!important;margin-bottom:0.4rem!important;display:block; }
            #note-editor-content p { font-size:0.95rem!important;color:#cbd5e1!important;line-height:1.7!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content blockquote { border-left:4px solid var(--m3-primary-dark)!important;padding-left:1rem!important;color:#94a3b8!important;font-style:italic!important;background-color:rgba(255,255,255,0.02)!important;padding-top:0.5rem!important;padding-bottom:0.5rem!important;border-radius:0 8px 8px 0!important;margin:1rem 0!important;display:block; }
            #note-editor-content ul { list-style-type:disc!important;padding-left:1.5rem!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content ol { list-style-type:decimal!important;padding-left:1.5rem!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content li { font-size:0.95rem!important;color:#cbd5e1!important;margin-bottom:0.35rem!important;display:list-item; }
            #note-editor-content code { background-color:var(--m3-primaryContainer-dark)!important;color:var(--m3-primary-dark)!important;padding:0.15rem 0.35rem!important;border-radius:6px!important;font-family:'Fira Code',ui-monospace,monospace!important;font-size:0.85em!important; }
            #note-editor-content strong { color: #fff !important; }
            #note-editor-content em { color: #a5b4fc !important; }
            #note-editor-content del { text-decoration: line-through; color: #6b7280 !important; }
            
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            
            #lightbox-modal {
                position: fixed;
                inset: 0;
                background: rgba(11, 12, 14, 0.95);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                z-index: 2147483645;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px;
            }
            #lightbox-modal.open {
                display: flex;
            }
            #close-lightbox-btn {
                position: absolute;
                top: 24px;
                right: 24px;
                color: var(--m3-outline-dark);
                font-size: 2rem;
                font-weight: 400;
                border: 0;
                background: transparent;
                cursor: pointer;
                transition: color 0.2s;
            }
            #close-lightbox-btn:hover {
                color: #fff;
            }
            #lightbox-img {
                max-width: 100%;
                max-height: 70vh;
                border-radius: 20px;
                object-fit: contain;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                border: 1px solid var(--m3-surfaceVariant-dark);
            }
            .lightbox-controls {
                margin-top: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 12px;
                background: var(--m3-surface-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                padding: 16px 24px;
                border-radius: 20px;
                max-width: 400px;
                width: 100%;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            }
            #lightbox-title {
                font-size: 0.8rem;
                font-weight: 600;
                color: #f1f5f9;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #lightbox-download-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 20px;
                border-radius: 12px;
                background: var(--m3-primaryContainer-dark);
                border: 1px solid var(--m3-surfaceVariant-dark);
                color: var(--m3-primary-dark);
                font-size: 0.75rem;
                font-weight: 600;
                font-family: inherit;
                transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            }
            #lightbox-download-btn:hover {
                background: var(--m3-primary-dark);
                color: var(--m3-background-dark);
            }

            * { box-sizing: border-box; }
            button { cursor: pointer; }
            @keyframes nina-spin { to { transform: rotate(360deg); } }
            .nina-spinner {
                position:absolute;inset:0;background:rgba(11,12,14,0.75);border-radius:inherit;
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
                backdrop-filter:blur(4px);z-index:2;
            }
            .nina-spinner svg { animation: nina-spin 0.9s linear infinite; }
            .nina-spinner span { font-size:0.6rem;color:var(--m3-primary-dark);font-weight:600;letter-spacing:0.05em; }
            .nina-widget-wrap { position:relative; display:inline-flex; vertical-align:top; margin:12px 0; }
        `;
        notesShadow.appendChild(style);

        // HTML
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
        <div id="notes-backdrop">
            <div class="material-glow" style="position:absolute;inset:0;pointer-events:none;z-index:0;"></div>

            <!-- Haupt-Container -->
            <div class="dashboard-container">
                <!-- Close Button -->
                <div class="close-btn-wrapper">
                    <button id="notes-expand-btn" title="In neuem Tab öffnen">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </button>
                    <button id="notes-close-btn" title="Schließen">✕</button>
                </div>

                <!-- Dashboard -->
                <div id="notes-dashboard">

                    <!-- Linkes Panel: Liste -->
                    <div id="notes-list-panel">
                        <div class="search-bar-row">
                            <div class="search-input-wrapper">
                                <input type="text" id="note-search" placeholder="Suchen..." autocomplete="off">
                                <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                </svg>
                            </div>
                            <button id="create-note-btn" title="Neue Notiz">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                                </svg>
                            </button>
                        </div>
                        <!-- Drive Sync Status -->
                        <div id="drive-status-bar">
                            <button id="drive-login-btn">
                                <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="currentColor"><path d="M6.28 3h11.44L24 12l-6.28 9H6.28L0 12z"/></svg>
                                <span id="drive-btn-label">Mit Google Drive verbinden</span>
                            </button>
                        </div>
                        <div id="notes-list-container" class="custom-scrollbar">
                            <!-- Wird befüllt -->
                        </div>
                    </div>

                    <!-- Rechtes Panel: Editor -->
                    <div id="notes-editor-panel">

                        <!-- Placeholder -->
                        <div id="editor-placeholder">
                            <div class="placeholder-icon-wrap">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width:32px;height:32px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </div>
                            <h3 style="color:#fff;font-weight:700;font-size:0.875rem;margin:0 0 4px;">Bereit zum Schreiben</h3>
                            <p style="color:var(--m3-outline-dark);font-size:0.75rem;max-width:240px;line-height:1.6;margin:0;">Wähle links eine Notiz aus oder erstelle eine neue.</p>
                        </div>

                        <!-- Editor Workspace -->
                        <div id="editor-workspace">

                            <!-- Header -->
                            <div class="editor-header">
                                <span id="note-save-status">
                                    <span class="status-dot"></span> Bereit
                                </span>
                                <div style="display:flex;align-items:center;gap:12px;">
                                    <span id="note-char-counter">0 Zeichen</span>
                                    <button id="note-delete-btn">
                                        <svg xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                        Löschen
                                    </button>
                                </div>
                            </div>

                            <!-- Datums-Info -->
                            <div id="note-metadata-row" style="display:flex; gap:16px; margin-bottom: 12px; padding: 0 4px; flex-shrink: 0; user-select: none;">
                                <div style="display:flex; gap:16px; font-size: 0.7rem; color: var(--m3-outline-dark);">
                                    <span id="note-created-time">Erstellt: -</span>
                                    <span id="note-updated-time">Geändert: -</span>
                                </div>
                            </div>

                            <!-- Anhangs-Leiste -->
                            <div id="attachment-bar">
                                <div class="attachment-bar-header">
                                    <span class="attachment-bar-title">
                                        <svg style="width:14px;height:14px;color:var(--m3-primary-dark);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                        Anhänge
                                    </span>
                                    <span id="attachment-count">0</span>
                                </div>
                                <div id="attachment-list" class="no-scrollbar"></div>
                            </div>

                            <!-- Editor -->
                            <div class="editor-content-wrapper">
                                <div
                                    id="note-editor-content"
                                    class="custom-scrollbar"
                                    contenteditable="true"
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Lightbox -->
        <div id="lightbox-modal">
            <button id="close-lightbox-btn" title="Schließen">✕</button>
            <img id="lightbox-img" src="" alt="Vorschau">
            <div class="lightbox-controls">
                <span id="lightbox-title"></span>
                <button id="lightbox-download-btn">
                    <svg style="width:16px;height:16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Herunterladen
                </button>
            </div>
        </div>
        `;
        notesShadow.appendChild(wrapper);

        bindEvents();
        loadNotes(() => {
            renderNotesList();
            showDriveStatusBar();
        });

        if (isStandalone) {
            const backdrop = notesShadow.getElementById('notes-backdrop');
            backdrop.classList.add('active', 'standalone');

            const expandBtn = notesShadow.getElementById('notes-expand-btn');
            if (expandBtn) expandBtn.style.display = 'none';
        }
    }

    // ─── EVENTS ────────────────────────────────────────────────────────────────

    function bindEvents() {
        const backdrop = notesShadow.getElementById('notes-backdrop');
        const closeBtn = notesShadow.getElementById('notes-close-btn');
        const createBtn = notesShadow.getElementById('create-note-btn');
        const searchInput = notesShadow.getElementById('note-search');
        const deleteBtn = notesShadow.getElementById('note-delete-btn');
        const editorContent = notesShadow.getElementById('note-editor-content');
        const closeLightbox = notesShadow.getElementById('close-lightbox-btn');
        const lightboxModal = notesShadow.getElementById('lightbox-modal');
        const driveBtn = notesShadow.getElementById('drive-login-btn');

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeNotesOverlay();
        });

        closeBtn.addEventListener('click', () => {
            if (isStandalone) {
                window.close();
            } else {
                closeNotesOverlay();
            }
        });

        const expandBtn = notesShadow.getElementById('notes-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: 'NINA_OPEN_NOTES_TAB' });
                closeNotesOverlay();
            });
        }

        createBtn.addEventListener('click', createNewNote);

        searchInput.addEventListener('input', () => renderNotesList());

        deleteBtn.addEventListener('click', deleteActiveNote);

        document.execCommand('defaultParagraphSeparator', false, 'p');

        editorContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const block = getActiveBlock();
                if (block && (block.tagName.startsWith('H') || block.tagName === 'BLOCKQUOTE')) {
                    e.preventDefault();
                    const p = document.createElement('p');
                    p.innerHTML = '<br>';
                    if (block.nextSibling) block.parentNode.insertBefore(p, block.nextSibling);
                    else block.parentNode.appendChild(p);
                    setCaretToEnd(p);
                }
            }
        });

        editorContent.addEventListener('input', () => {
            handleBlockShortcuts();
            handleInlineShortcuts();
            saveActiveNote();
            updateCharCount();
            updateAttachmentBar();
        });

        editorContent.addEventListener('keyup', (e) => {
            if (e.key === ' ' || e.key === 'Spacebar') {
                handleBlockShortcuts();
                handleInlineShortcuts();
            }
            saveActiveNote();
        });

        editorContent.addEventListener('paste', handlePaste);
        editorContent.addEventListener('dragover', (e) => { e.preventDefault(); editorContent.classList.add('editor-drag-over'); });
        editorContent.addEventListener('dragleave', () => editorContent.classList.remove('editor-drag-over'));
        editorContent.addEventListener('drop', (e) => {
            e.preventDefault();
            editorContent.classList.remove('editor-drag-over');
            if (e.dataTransfer.files.length) handleUploadedFiles(e.dataTransfer.files);
        });

        editorContent.addEventListener('click', (e) => {
            const preview = e.target.closest('[data-preview-trigger]');
            if (preview) {
                const widget = preview.closest('.image-widget');
                if (widget) openLightbox(widget.getAttribute('data-filename'), widget.getAttribute('data-dataurl'));
                return;
            }
            const dl = e.target.closest('[data-download-trigger]');
            if (dl) {
                const container = dl.closest('.file-attachment, .image-widget');
                if (container) triggerDownload(container.getAttribute('data-filename'), container.getAttribute('data-dataurl'));
            }
        });

        closeLightbox.addEventListener('click', () => lightboxModal.classList.remove('open'));
        lightboxModal.addEventListener('click', (e) => { if (e.target === lightboxModal) lightboxModal.classList.remove('open'); });

        driveBtn.addEventListener('click', handleDriveAuth);

        // Escape schließt Overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isNotesOpen) {
                e.preventDefault();
                e.stopPropagation();
                closeNotesOverlay();
            }
        }, true);
    }

    // ─── OPEN / CLOSE ─────────────────────────────────────────────────────────

    function openNotesOverlay() {
        if (!notesRootContainer) initNotesOverlay();
        isNotesOpen = true;
        notesRootContainer.style.pointerEvents = 'auto';
        const backdrop = notesShadow.getElementById('notes-backdrop');
        backdrop.classList.add('active');
        loadNotes(() => {
            let urlNoteId = null;
            if (isStandalone) {
                const params = new URLSearchParams(window.location.search);
                urlNoteId = params.get('noteId');
            }
            if (urlNoteId && notes.some(n => n.id === urlNoteId)) {
                openNoteInEditor(urlNoteId);
            } else {
                createNewNote();
            }
            showDriveStatusBar();
        });
    }

    function closeNotesOverlay() {
        if (!notesShadow) return;
        isNotesOpen = false;
        notesRootContainer.style.pointerEvents = 'none';
        notesShadow.getElementById('notes-backdrop').classList.remove('active');
    }

    // Exports
    window.__NINA_openNotes = openNotesOverlay;
    window.__NINA_closeNotes = closeNotesOverlay;

    // ─── NOTE LIST RENDERING ──────────────────────────────────────────────────

    function renderNotesList() {
        const container = notesShadow.getElementById('notes-list-container');
        const query = (notesShadow.getElementById('note-search').value || '').trim().toLowerCase();

        const filtered = notes
            .filter(n => !query || n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query))
            .sort((a, b) => b.updated - a.updated);

        container.innerHTML = '';

        if (!filtered.length) {
            container.innerHTML = '<div class="notes-empty-state">Keine Notizen gefunden</div>';
            return;
        }

        filtered.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card' + (activeNoteId === note.id ? ' active' : '');

            const date = new Date(note.updated).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const tmp = document.createElement('div');
            tmp.innerHTML = note.content;
            const plain = (tmp.innerText || tmp.textContent || '').trim();
            const preview = plain.length > 55 ? plain.substring(0, 55) + '…' : plain || 'Leere Notiz…';

            card.innerHTML = `
                <div class="note-card-header">
                    <span class="note-card-title">${escHtml(note.title || 'Neue Notiz')}</span>
                    <span class="note-card-date">${date}</span>
                </div>
                <p class="note-card-desc">${escHtml(preview)}</p>
            `;
            card.addEventListener('click', () => openNoteInEditor(note.id));
            container.appendChild(card);
        });
    }

    // ─── EDITOR LOGIC ─────────────────────────────────────────────────────────

    function openNoteInEditor(id) {
        activeNoteId = id;
        const note = notes.find(n => n.id === id);
        if (!note) return;

        // Fallback für Abwärtskompatibilität
        if (!note.created) {
            note.created = note.updated || Date.now();
        }

        notesShadow.getElementById('editor-placeholder').style.display = 'none';
        const ws = notesShadow.getElementById('editor-workspace');
        ws.style.display = 'flex';

        // Formatieren und Anzeigen der Datumsangaben
        const createdDate = new Date(note.created).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const updatedDate = new Date(note.updated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        notesShadow.getElementById('note-created-time').textContent = `Erstellt: ${createdDate}`;
        notesShadow.getElementById('note-updated-time').textContent = `Geändert: ${updatedDate}`;

        const editorContent = notesShadow.getElementById('note-editor-content');
        if (!note.attachments) note.attachments = [];
        editorContent.innerHTML = note.content || '<p><br></p>';
        updateCharCount();
        renderNotesList();
        updateAttachmentBar();
        setCaretToEnd(editorContent);
        editorContent.focus();
        restoreAttachmentsFromDrive();
    }

    function createNewNote() {
        const id = 'note-' + Date.now();
        const now = Date.now();
        notes.unshift({ id, title: 'Neue Notiz', content: '<p><br></p>', created: now, updated: now, driveFileId: null });
        saveNotes(() => {
            openNoteInEditor(id);
        });
    }

    function saveActiveNote() {
        if (!activeNoteId) return;
        const idx = notes.findIndex(n => n.id === activeNoteId);
        if (idx === -1) return;

        const editorContent = notesShadow.getElementById('note-editor-content');
        const content = editorContent.innerHTML;
        const title = extractTitle(content);

        notes[idx].title = title;
        notes[idx].content = content;
        notes[idx].updated = Date.now();
        if (!notes[idx].created) {
            notes[idx].created = notes[idx].updated;
        }

        saveNotes();
        renderNotesList();

        // Datumsangabe für Änderungen im Editor live aktualisieren
        const updatedDate = new Date(notes[idx].updated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        notesShadow.getElementById('note-updated-time').textContent = `Geändert: ${updatedDate}`;

        const status = notesShadow.getElementById('note-save-status');
        status.innerHTML = '<span class="status-dot saving"></span> Sichernd…';
        setTimeout(() => {
            status.innerHTML = '<span class="status-dot"></span> Gespeichert';
            // Drive-Sync (falls eingeloggt)
            if (window.NinaDrive && window.NinaDrive.isConnected()) {
                window.NinaDrive.writeNote(notes[idx]).catch(() => {});
            }
        }, 800);
    }

    function deleteActiveNote() {
        if (!activeNoteId) return;
        if (!confirm('Diese Notiz wirklich löschen?')) return;

        const driveFileId = (notes.find(n => n.id === activeNoteId) || {}).driveFileId;
        notes = notes.filter(n => n.id !== activeNoteId);
        activeNoteId = null;

        saveNotes();

        notesShadow.getElementById('editor-workspace').style.display = 'none';
        notesShadow.getElementById('editor-placeholder').style.display = 'flex';
        renderNotesList();

        if (driveFileId && window.NinaDrive && window.NinaDrive.isConnected()) {
            window.NinaDrive.deleteNote(driveFileId).catch(() => {});
        }
    }

    function updateCharCount() {
        const editorContent = notesShadow.getElementById('note-editor-content');
        const text = editorContent.innerText || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        notesShadow.getElementById('note-char-counter').textContent = `${text.length} Zeichen | ${words} W.`;
    }

    function extractTitle(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const h = tmp.querySelector('h1, h2, h3');
        if (h && h.textContent.trim()) return h.textContent.trim();
        const blocks = tmp.querySelectorAll('p, li, blockquote');
        for (const b of blocks) {
            const t = b.textContent.replace(/ /g, ' ').trim();
            if (t) return t.length > 32 ? t.substring(0, 32) + '…' : t;
        }
        return 'Neue Notiz';
    }

    // ─── EDITOR MARKDOWN SHORTCUTS ────────────────────────────────────────────

    function getActiveBlock() {
        const editorContent = notesShadow.getElementById('note-editor-content');
        const sel = notesShadow.getSelection ? notesShadow.getSelection() : window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        while (node && node.parentNode !== editorContent && node !== editorContent) node = node.parentNode;
        if (node && node.parentNode === editorContent) {
            if (node.nodeType === Node.TEXT_NODE) {
                const p = document.createElement('p');
                node.parentNode.insertBefore(p, node);
                p.appendChild(node);
                return p;
            }
            return node;
        }
        return null;
    }

    function setCaretToEnd(el) {
        const range = document.createRange();
        const sel = window.getSelection();
        let target = el;
        while (target.lastChild) target = target.lastChild;
        try {
            if (target.nodeType === Node.TEXT_NODE) range.setStart(target, target.length);
            else range.setStart(target, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (_) {}
    }

    function handleBlockShortcuts() {
        const block = getActiveBlock();
        if (!block) return;
        const text = block.textContent.replace(/ /g, ' ');
        let newTag = null, prefixLen = 0;
        if (text.startsWith('# ')) { newTag = 'H1'; prefixLen = 2; }
        else if (text.startsWith('## ')) { newTag = 'H2'; prefixLen = 3; }
        else if (text.startsWith('### ')) { newTag = 'H3'; prefixLen = 4; }
        else if (text.startsWith('> ')) { newTag = 'BLOCKQUOTE'; prefixLen = 2; }
        else if (text.startsWith('- ') || text.startsWith('* ')) { newTag = 'UL'; prefixLen = 2; }
        else if (/^\d+\.\s/.test(text)) { newTag = 'OL'; prefixLen = text.match(/^\d+\.\s/)[0].length; }

        if (!newTag || block.tagName === newTag) return;

        const cleanText = text.substring(prefixLen);
        let newEl;
        if (newTag === 'UL' || newTag === 'OL') {
            newEl = document.createElement(newTag.toLowerCase());
            const li = document.createElement('li');
            li.innerHTML = cleanText.trim() || '<br>';
            newEl.appendChild(li);
        } else {
            newEl = document.createElement(newTag);
            newEl.innerHTML = cleanText.trim() || '<br>';
        }
        block.parentNode.replaceChild(newEl, block);
        setCaretToEnd(newTag === 'UL' || newTag === 'OL' ? newEl.firstChild : newEl);
    }

    function handleInlineShortcuts() {
        const block = getActiveBlock();
        if (!block) return;
        let html = block.innerHTML.replace(/&nbsp;/g, ' ');
        let updated = false;
        html = html.replace(/\*\*([^*]+)\*\*/g, (_, m) => { updated = true; return `<strong>${m}</strong>`; });
        html = html.replace(/\*([^*]+)\*/g, (_, m) => { updated = true; return `<em>${m}</em>`; });
        html = html.replace(/`([^`]+)`/g, (_, m) => { updated = true; return `<code>${m}</code>`; });
        html = html.replace(/~~([^~]+)~~/g, (_, m) => { updated = true; return `<del>${m}</del>`; });
        if (updated) { block.innerHTML = html; setCaretToEnd(block); }
    }

    // ─── SPINNER HELPER ────────────────────────────────────────────────────────

    function makeSpinner(label) {
        const div = document.createElement('div');
        div.className = 'nina-spinner';
        div.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            <span>${label}</span>`;
        return div;
    }

    function showSpinner(widgetEl, label) {
        const existing = widgetEl.querySelector('.nina-spinner');
        if (existing) existing.remove();
        widgetEl.style.position = 'relative';
        widgetEl.appendChild(makeSpinner(label));
    }

    function hideSpinner(widgetEl) {
        const s = widgetEl.querySelector('.nina-spinner');
        if (s) s.remove();
    }

    // ─── FILE HANDLING ─────────────────────────────────────────────────────────

    function handlePaste(e) {
        const cb = e.clipboardData || window.clipboardData;
        if (cb.files && cb.files.length) { e.preventDefault(); handleUploadedFiles(cb.files); return; }
        e.preventDefault();
        
        const html = cb.getData('text/html');
        const text = cb.getData('text/plain');
        
        if (html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // Bereinige das HTML von Styles, Klassen und IDs, um das Design einheitlich zu halten
            doc.body.querySelectorAll('*').forEach(el => {
                el.removeAttribute('style');
                el.removeAttribute('class');
                el.removeAttribute('id');
            });
            const cleanHtml = doc.body.innerHTML;
            if (cleanHtml) {
                try {
                    // Verwende native Browser-Methode, die Absätze trennt, ohne ungültige Schachtelungen zu erzeugen
                    document.execCommand('insertHTML', false, cleanHtml);
                } catch (err) {
                    // Fallback, falls execCommand blockiert wird
                    insertHtmlAtCaret(cleanHtml);
                }
            }
        } else if (text) {
            try {
                // Fügt den bereinigten Text an der Cursorposition ein (erstellt automatisch <p>-Tags nach Bedarf)
                document.execCommand('insertText', false, text);
            } catch (err) {
                // Fallback mit manuellem Absatz-Wrapping, falls execCommand fehlschlägt
                const content = text.split(/\r?\n/).map(l => l.trim() ? `<p>${escHtml(l)}</p>` : '<p><br></p>').join('');
                insertHtmlAtCaret(content);
            }
        }
        
        saveActiveNote();
        updateCharCount();
        updateAttachmentBar();
    }

    // ─── ATTACHMENT SYSTEM ────────────────────────────────────────────────────
    // Anhänge werden in note.attachments[] gespeichert, NICHT im Editor-DOM.

    function getActiveNote() {
        return notes.find(n => n.id === activeNoteId) || null;
    }

    function handleUploadedFiles(files) {
        for (const f of files) addAttachmentToNote(f);
    }

    function addAttachmentToNote(file) {
        const note = getActiveNote();
        if (!note) return;
        if (!note.attachments) note.attachments = [];

        const attId = 'att-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const sizeKB = Math.round(file.size / 1024);
        const sizeStr = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';
        const isImage = file.type.startsWith('image/');

        // Platzhalter mit Spinner sofort anzeigen
        const placeholder = { id: attId, filename: file.name, size: sizeStr, dataUrl: '', driveId: '', uploading: true, isImage };
        note.attachments.push(placeholder);
        updateAttachmentBar();

        const processFile = (dataUrl) => {
            const idx = note.attachments.findIndex(a => a.id === attId);
            if (idx === -1) return;
            note.attachments[idx].dataUrl = dataUrl;
            note.attachments[idx].uploading = false;
            saveNotes();
            updateAttachmentBar();

            // Drive-Upload
            if (window.NinaDrive && window.NinaDrive.isConnected()) {
                note.attachments[idx].uploading = true;
                updateAttachmentBar();
                window.NinaDrive.uploadAttachment(dataUrl, file.name, activeNoteId).then(driveId => {
                    const i2 = note.attachments.findIndex(a => a.id === attId);
                    if (i2 !== -1) {
                        note.attachments[i2].driveId = driveId || '';
                        note.attachments[i2].dataUrl = ''; // Drive ist die Quelle
                        note.attachments[i2].uploading = false;
                        saveNotes();
                        updateAttachmentBar();
                    }
                }).catch(() => {
                    const i2 = note.attachments.findIndex(a => a.id === attId);
                    if (i2 !== -1) { note.attachments[i2].uploading = false; updateAttachmentBar(); }
                });
            }
        };

        if (isImage) {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height, max = 800;
                    if (w > h ? w > max : h > max) { if (w > h) { h = h * max / w; w = max; } else { w = w * max / h; h = max; } }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    processFile(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            const reader = new FileReader();
            reader.onload = e => processFile(e.target.result);
            reader.readAsDataURL(file);
        }
    }

    // Lädt fehlende dataUrls (driveId vorhanden, dataUrl leer) vom Drive nach
    async function restoreAttachmentsFromDrive() {
        const note = getActiveNote();
        if (!note || !note.attachments || !note.attachments.length) return;
        if (!window.NinaDrive || !window.NinaDrive.isConnected()) return;

        for (const att of note.attachments) {
            if (att.driveId && !att.dataUrl) {
                att.uploading = true;
                updateAttachmentBar();
                try {
                    att.dataUrl = await window.NinaDrive.downloadAttachment(att.driveId) || '';
                } catch (_) {}
                att.uploading = false;
                updateAttachmentBar();
            }
        }
        saveNotes();
    }

    function updateAttachmentBar() {
        const bar = notesShadow.getElementById('attachment-bar');
        const list = notesShadow.getElementById('attachment-list');
        const countEl = notesShadow.getElementById('attachment-count');
        const note = getActiveNote();
        const attachments = (note && note.attachments) || [];

        if (!attachments.length) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        countEl.textContent = `${attachments.length}`;
        list.innerHTML = '';

        attachments.forEach(att => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';

            // Spinner overlay
            if (att.uploading) {
                chip.style.opacity = '0.7';
                chip.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--m3-primary-dark)" stroke-width="2.5" stroke-linecap="round" style="animation:nina-spin 0.9s linear infinite;flex-shrink:0;">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.65rem;color:var(--m3-primary-dark);">Hochladen…</span>`;
                list.appendChild(chip);
                return;
            }

            const isImg = att.isImage && att.dataUrl;
            const iconHtml = isImg
                ? `<img src="${att.dataUrl}" class="att-chip-img" />`
                : `<div class="att-chip-doc-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`;

            chip.innerHTML = `
                ${iconHtml}
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;" title="${escHtml(att.filename)}">${escHtml(att.filename)}</span>
                <div style="display:flex;gap:2px;flex-shrink:0;">
                    <button class="att-dl att-chip-btn" title="Herunterladen">
                        <svg style="width:13px;height:13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    </button>
                    <button class="att-del att-chip-btn att-chip-btn-del" title="Entfernen">
                        <svg style="width:13px;height:13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>`;

            chip.querySelector('.att-dl').addEventListener('click', (e) => {
                e.stopPropagation();
                if (att.dataUrl) triggerDownload(att.filename, att.dataUrl);
            });
            chip.querySelector('.att-del').addEventListener('click', (e) => {
                e.stopPropagation();
                const n = getActiveNote();
                if (n) {
                    n.attachments = n.attachments.filter(a => a.id !== att.id);
                    saveNotes();
                    updateAttachmentBar();
                }
            });

            // Bild-Vorschau per Klick auf Icon
            if (isImg) {
                chip.querySelector('img').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openLightbox(att.filename, att.dataUrl);
                });
            }

            list.appendChild(chip);
        });
    }

    function insertHtmlAtCaret(html) {
        const editorContent = notesShadow.getElementById('note-editor-content');
        editorContent.focus();
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const el = document.createElement('div');
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let lastNode;
        while (el.firstChild) lastNode = frag.appendChild(el.firstChild);
        range.insertNode(frag);
        if (lastNode) {
            const r = range.cloneRange();
            r.setStartAfter(lastNode);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
    }

    // ─── LIGHTBOX ─────────────────────────────────────────────────────────────

    function openLightbox(filename, dataUrl) {
        const modal = notesShadow.getElementById('lightbox-modal');
        notesShadow.getElementById('lightbox-img').src = dataUrl;
        notesShadow.getElementById('lightbox-title').textContent = filename;
        const dlBtn = notesShadow.getElementById('lightbox-download-btn');
        dlBtn.onclick = () => triggerDownload(filename, dataUrl);
        modal.classList.add('open');
    }

    function triggerDownload(filename, dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    // ─── GOOGLE DRIVE ─────────────────────────────────────────────────────────

    function showDriveStatusBar() {
        const bar = notesShadow.getElementById('drive-status-bar');
        bar.style.display = 'block';
        updateDriveButton();
    }

    function updateDriveButton() {
        const btn = notesShadow.getElementById('drive-login-btn');
        const label = notesShadow.getElementById('drive-btn-label');
        if (window.NinaDrive && window.NinaDrive.isConnected()) {
            label.textContent = 'Google Drive: verbunden ✓';
            btn.classList.add('connected');
        } else {
            label.textContent = 'Mit Google Drive verbinden';
            btn.classList.remove('connected');
        }
    }

    function handleDriveAuth() {
        if (!window.NinaDrive) return;
        if (window.NinaDrive.isConnected()) {
            window.NinaDrive.disconnect();
            updateDriveButton();
        } else {
            window.NinaDrive.connect().then(() => {
                updateDriveButton();
                return window.NinaDrive.syncAll(notes);
            }).then(mergedNotes => {
                if (mergedNotes) {
                    notes = mergedNotes;
                    saveNotes();
                    renderNotesList();
                }
            }).catch(err => console.warn('NINA Drive:', err));
        }
    }

    // ─── UTILS ────────────────────────────────────────────────────────────────

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // ─── BOOT ─────────────────────────────────────────────────────────────────

    function boot() {
        initNotesOverlay();
        if (isStandalone) {
            openNotesOverlay();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
