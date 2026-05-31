// NINA Notes Overlay – Content Script
// Erstellt ein Shadow-DOM-Overlay über allen Seiten

(function () {
    if (window.__NINA_NOTES_LOADED__) return;
    window.__NINA_NOTES_LOADED__ = true;

    const STORAGE_KEY = 'nina_notes';
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
        notesRootContainer.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;pointer-events:none;';
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
            #notes-backdrop {
                position: fixed; inset: 0; z-index: 2147483640;
                display: flex; align-items: center; justify-content: center;
                background-color: rgba(11,12,14,0.92);
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                opacity: 0; pointer-events: none; visibility: hidden;
                transition: opacity 0.3s cubic-bezier(0.16,1,0.3,1), visibility 0.3s;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            #notes-backdrop.active {
                opacity: 1 !important; pointer-events: auto !important; visibility: visible !important;
            }
            .material-glow {
                background: radial-gradient(circle at 50% 50%, rgba(6,182,212,0.1) 0%, rgba(8,145,178,0.02) 45%, rgba(11,12,14,0) 75%) !important;
            }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.01); border-radius: 8px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(6,182,212,0.15); border-radius: 8px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #06b6d4; }
            .note-card {
                background-color: rgba(11,12,14,0.25);
                border: 1px solid rgba(255,255,255,0.03);
                transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
                cursor: pointer; border-radius: 12px; padding: 14px;
            }
            .note-card:hover {
                border-color: rgba(6,182,212,0.2);
                background-color: rgba(6,182,212,0.02);
                transform: translateY(-1px);
            }
            .note-card.active {
                border-color: rgba(6,182,212,0.35) !important;
                background-color: rgba(6,182,212,0.06) !important;
                box-shadow: inset 0 0 12px rgba(6,182,212,0.05);
            }
            .editor-drag-over {
                border-color: rgba(6,182,212,0.5) !important;
                background-color: rgba(6,182,212,0.04) !important;
                box-shadow: 0 0 25px rgba(6,182,212,0.15) !important;
            }
            #note-editor-content h1 { font-size:1.75rem!important;font-weight:800!important;color:#ffffff!important;margin-top:1.5rem!important;margin-bottom:0.75rem!important;border-bottom:1px solid rgba(6,182,212,0.1)!important;padding-bottom:0.25rem!important;display:block; }
            #note-editor-content h2 { font-size:1.4rem!important;font-weight:700!important;color:#f3f4f6!important;margin-top:1.25rem!important;margin-bottom:0.5rem!important;display:block; }
            #note-editor-content h3 { font-size:1.15rem!important;font-weight:600!important;color:#e5e7eb!important;margin-top:1rem!important;margin-bottom:0.4rem!important;display:block; }
            #note-editor-content p { font-size:0.95rem!important;color:#cbd5e1!important;line-height:1.7!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content blockquote { border-left:4px solid #06b6d4!important;padding-left:1rem!important;color:#94a3b8!important;font-style:italic!important;background-color:rgba(255,255,255,0.02)!important;padding-top:0.5rem!important;padding-bottom:0.5rem!important;border-radius:0 8px 8px 0!important;margin:1rem 0!important;display:block; }
            #note-editor-content ul { list-style-type:disc!important;padding-left:1.5rem!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content ol { list-style-type:decimal!important;padding-left:1.5rem!important;margin-bottom:0.75rem!important;display:block; }
            #note-editor-content li { font-size:0.95rem!important;color:#cbd5e1!important;margin-bottom:0.35rem!important;display:list-item; }
            #note-editor-content code { background-color:rgba(6,182,212,0.12)!important;color:#22d3ee!important;padding:0.15rem 0.35rem!important;border-radius:6px!important;font-family:'Fira Code',ui-monospace,monospace!important;font-size:0.85em!important; }
            #note-editor-content strong { color: #fff !important; }
            #note-editor-content em { color: #a5b4fc !important; }
            #note-editor-content del { text-decoration: line-through; color: #6b7280 !important; }
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            #lightbox-modal { position:fixed;inset:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(8px);z-index:2147483645;display:none;flex-direction:column;align-items:center;justify-content:center;padding:1rem; }
            #lightbox-modal.open { display: flex; }
            * { box-sizing: border-box; }
            button { cursor: pointer; }
            @keyframes nina-spin { to { transform: rotate(360deg); } }
            .nina-spinner {
                position:absolute;inset:0;background:rgba(11,12,14,0.75);border-radius:inherit;
                display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
                backdrop-filter:blur(4px);z-index:2;
            }
            .nina-spinner svg { animation: nina-spin 0.9s linear infinite; }
            .nina-spinner span { font-size:0.6rem;color:#67e8f9;font-weight:600;letter-spacing:0.05em; }
            .nina-widget-wrap { position:relative; display:inline-flex; vertical-align:top; margin:12px 0; }
        `;
        notesShadow.appendChild(style);

        // HTML
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
        <div id="notes-backdrop">
            <div class="material-glow" style="position:absolute;inset:0;pointer-events:none;z-index:0;"></div>

            <!-- Haupt-Container -->
            <div style="position:relative;z-index:1;width:100%;max-width:1100px;padding:0 1rem;display:flex;flex-direction:column;align-items:center;">
                <!-- Close Button -->
                <div style="width:100%;display:flex;justify-content:flex-end;margin-bottom:0.75rem;">
                    <button id="notes-close-btn" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:1.25rem;transition:all 0.2s;" title="Schließen">✕</button>
                </div>

                <!-- Dashboard -->
                <div id="notes-dashboard" style="width:100%;height:82vh;min-height:500px;max-height:850px;background:rgba(30,31,34,0.8);border:1px solid rgba(255,255,255,0.05);border-radius:24px;box-shadow:0 25px 50px rgba(0,0,0,0.5);display:flex;overflow:hidden;backdrop-filter:blur(20px);">

                    <!-- Linkes Panel: Liste -->
                    <div id="notes-list-panel" style="width:30%;border-right:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;padding:20px;min-width:220px;max-width:300px;">
                        <div style="display:flex;gap:8px;margin-bottom:16px;flex-shrink:0;">
                            <div style="position:relative;flex:1;">
                                <input type="text" id="note-search" placeholder="Suchen..." autocomplete="off"
                                    style="width:100%;background:rgba(11,12,14,0.5);border:1px solid #3f3f46;color:#fff;border-radius:12px;padding:10px 12px 10px 34px;font-size:0.75rem;outline:none;font-family:inherit;transition:border-color 0.2s;">
                                <svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#71717a;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                                </svg>
                            </div>
                            <button id="create-note-btn" title="Neue Notiz"
                                style="padding:0 14px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:12px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:inherit;">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                                </svg>
                            </button>
                        </div>
                        <!-- Drive Sync Status -->
                        <div id="drive-status-bar" style="display:none;margin-bottom:12px;flex-shrink:0;">
                            <button id="drive-login-btn" style="width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.2);border-radius:10px;color:#67e8f9;font-size:0.7rem;font-weight:600;font-family:inherit;transition:all 0.2s;">
                                <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="currentColor"><path d="M6.28 3h11.44L24 12l-6.28 9H6.28L0 12z"/></svg>
                                <span id="drive-btn-label">Mit Google Drive verbinden</span>
                            </button>
                        </div>
                        <div id="notes-list-container" class="custom-scrollbar" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px;">
                            <!-- Wird befüllt -->
                        </div>
                    </div>

                    <!-- Rechtes Panel: Editor -->
                    <div id="notes-editor-panel" style="flex:1;display:flex;flex-direction:column;padding:24px;background:rgba(30,31,34,0.3);min-width:0;">

                        <!-- Placeholder -->
                        <div id="editor-placeholder" style="display:flex;flex-direction:column;flex:1;align-items:center;justify-content:center;text-align:center;padding:24px;">
                            <div style="width:64px;height:64px;border-radius:16px;background:rgba(6,182,212,0.05);border:1px solid rgba(6,182,212,0.1);display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
                                <svg xmlns="http://www.w3.org/2000/svg" style="width:32px;height:32px;color:rgba(6,182,212,0.4);" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </div>
                            <h3 style="color:#fff;font-weight:700;font-size:0.875rem;margin:0 0 4px;">Bereit zum Schreiben</h3>
                            <p style="color:#71717a;font-size:0.75rem;max-width:240px;line-height:1.6;margin:0;">Wähle links eine Notiz aus oder erstelle eine neue.</p>
                        </div>

                        <!-- Editor Workspace -->
                        <div id="editor-workspace" style="display:none;flex-direction:column;flex:1;min-height:0;">

                            <!-- Header -->
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;flex-wrap:wrap;gap:8px;">
                                <span id="note-save-status" style="font-size:0.7rem;color:#71717a;display:flex;align-items:center;gap:6px;user-select:none;">
                                    <span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;"></span> Bereit
                                </span>
                                <div style="display:flex;align-items:center;gap:12px;">
                                    <span id="note-char-counter" style="font-size:0.625rem;color:#71717a;background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:9999px;user-select:none;">0 Zeichen</span>
                                    <button id="note-delete-btn" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:rgba(127,29,29,0.2);border:1px solid rgba(127,29,29,0.3);color:#f87171;font-size:0.6875rem;font-weight:600;font-family:inherit;transition:all 0.2s;">
                                        <svg xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                        Löschen
                                    </button>
                                </div>
                            </div>

                            <!-- Anhangs-Leiste -->
                            <div id="attachment-bar" style="display:none;flex-direction:column;gap:6px;padding-bottom:14px;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;">
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
                                    <span style="font-size:0.625rem;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;">
                                        <svg style="width:14px;height:14px;color:#22d3ee;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                        Anhänge
                                    </span>
                                    <span id="attachment-count" style="font-size:0.5625rem;color:#22d3ee;font-weight:700;background:rgba(6,182,212,0.1);padding:2px 8px;border-radius:9999px;user-select:none;">0</span>
                                </div>
                                <div id="attachment-list" class="no-scrollbar" style="display:flex;gap:8px;overflow-x:auto;padding:4px 0;"></div>
                            </div>

                            <!-- Editor -->
                            <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
                                <div
                                    id="note-editor-content"
                                    contenteditable="true"
                                    style="width:100%;flex:1;overflow-y:auto;border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:16px;background:rgba(11,12,14,0.3);color:#cbd5e1;font-size:0.95rem;line-height:1.6;outline:none;resize:none;font-family:inherit;transition:border-color 0.2s;"
                                    class="custom-scrollbar"
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Lightbox -->
        <div id="lightbox-modal">
            <button id="close-lightbox-btn" style="position:absolute;top:24px;right:24px;color:#9ca3af;font-size:1.75rem;font-weight:600;border:0;background:transparent;cursor:pointer;transition:color 0.2s;" title="Schließen">✕</button>
            <img id="lightbox-img" style="max-width:100%;max-height:80vh;border-radius:16px;object-fit:contain;box-shadow:0 25px 50px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.05);" src="" alt="Vorschau">
            <div style="margin-top:20px;display:flex;flex-direction:column;align-items:center;gap:12px;background:rgba(30,31,34,0.9);border:1px solid rgba(255,255,255,0.05);padding:14px 20px;border-radius:16px;max-width:400px;width:100%;backdrop-filter:blur(8px);">
                <span id="lightbox-title" style="font-size:0.75rem;font-weight:600;color:#d1d5db;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                <button id="lightbox-download-btn" style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:12px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;font-size:0.75rem;font-weight:600;font-family:inherit;transition:all 0.2s;">
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

        closeBtn.addEventListener('click', closeNotesOverlay);

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
            renderNotesList();
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
            container.innerHTML = '<div style="text-align:center;padding:48px 0;color:#52525b;font-size:0.75rem;">Keine Notizen gefunden</div>';
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
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                    <span style="font-weight:700;font-size:0.75rem;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px;">${escHtml(note.title || 'Neue Notiz')}</span>
                    <span style="font-size:0.5625rem;color:#71717a;flex-shrink:0;">${date}</span>
                </div>
                <p style="font-size:0.6875rem;color:#6b7280;overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;line-height:1.5;margin:0;">${escHtml(preview)}</p>
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

        notesShadow.getElementById('editor-placeholder').style.display = 'none';
        const ws = notesShadow.getElementById('editor-workspace');
        ws.style.display = 'flex';

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
        notes.unshift({ id, title: 'Neue Notiz', content: '<p><br></p>', updated: Date.now(), driveFileId: null });
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

        saveNotes();
        renderNotesList();

        const status = notesShadow.getElementById('note-save-status');
        status.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;animation:pulse 1s infinite;"></span> Sichernd…';
        setTimeout(() => {
            status.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block;"></span> Gespeichert';
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
        let content = '';
        if (html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.body.querySelectorAll('*').forEach(el => { el.removeAttribute('style'); el.removeAttribute('class'); });
            content = doc.body.innerHTML;
        } else if (text) {
            content = text.split(/\r?\n/).map(l => l.trim() ? `<p>${escHtml(l)}</p>` : '<p><br></p>').join('');
        }
        if (content) insertHtmlAtCaret(content);
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
            chip.style.cssText = 'position:relative;display:flex;align-items:center;gap:8px;background:rgba(11,12,14,0.6);border:1px solid rgba(63,63,70,0.8);padding:6px 8px 6px 6px;border-radius:10px;font-size:0.75rem;color:#d1d5db;flex-shrink:0;transition:all 0.2s;max-width:180px;';

            // Spinner overlay
            if (att.uploading) {
                chip.style.opacity = '0.7';
                chip.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" style="animation:nina-spin 0.9s linear infinite;flex-shrink:0;">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.65rem;color:#67e8f9;">Hochladen…</span>`;
                list.appendChild(chip);
                return;
            }

            const isImg = att.isImage && att.dataUrl;
            const iconHtml = isImg
                ? `<img src="${att.dataUrl}" style="width:24px;height:24px;object-fit:cover;border-radius:5px;border:1px solid rgba(255,255,255,0.08);flex-shrink:0;" />`
                : `<div style="padding:3px;background:rgba(6,182,212,0.1);border-radius:5px;flex-shrink:0;"><svg style="width:13px;height:13px;color:#22d3ee;display:block;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg></div>`;

            chip.innerHTML = `
                ${iconHtml}
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;" title="${escHtml(att.filename)}">${escHtml(att.filename)}</span>
                <div style="display:flex;gap:2px;flex-shrink:0;">
                    <button class="att-dl" title="Herunterladen" style="padding:3px;border-radius:5px;background:transparent;border:0;color:#9ca3af;cursor:pointer;display:flex;">
                        <svg style="width:13px;height:13px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    </button>
                    <button class="att-del" title="Entfernen" style="padding:3px;border-radius:5px;background:transparent;border:0;color:#9ca3af;cursor:pointer;display:flex;">
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
                chip.querySelector('img').style.cursor = 'pointer';
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
        const label = notesShadow.getElementById('drive-btn-label');
        if (window.NinaDrive && window.NinaDrive.isConnected()) {
            label.textContent = 'Google Drive: verbunden ✓';
        } else {
            label.textContent = 'Mit Google Drive verbinden';
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotesOverlay);
    } else {
        initNotesOverlay();
    }
})();
