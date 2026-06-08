// NINA – Google Drive API Wrapper
// Stellt window.NinaDrive bereit, das von notes-overlay.js genutzt wird.

(function () {
    const FOLDER_NAME = 'NINA';
    const NOTES_SUBFOLDER = 'notes';
    const ATTACH_SUBFOLDER = 'attachments';
    const MIME_FOLDER = 'application/vnd.google-apps.folder';
    const MIME_JSON = 'application/json';
    const AUTH_KEY = 'nina_drive_connected';

    let _token = null;
    let _folderId = null;       // NINA/
    let _notesFolderId = null;  // NINA/notes/
    let _attachFolderId = null; // NINA/attachments/

    // ── TOKEN ──────────────────────────────────────────────────────────────────
    // chrome.identity ist nur im Background verfügbar → Message Passing

    async function getToken(interactive = false) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'NINA_GET_TOKEN', interactive }, (resp) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (resp && resp.error) {
                    reject(new Error(resp.error));
                } else if (resp && resp.token) {
                    _token = resp.token;
                    resolve(resp.token);
                } else {
                    reject(new Error('Kein Token erhalten'));
                }
            });
        });
    }

    async function revokeToken() {
        if (!_token) return;
        await new Promise((res) => {
            chrome.runtime.sendMessage({ type: 'NINA_REVOKE_TOKEN', token: _token }, () => res());
        });
        _token = null;
    }

    function authHeaders() {
        return { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' };
    }

    // ── DRIVE HELPERS ─────────────────────────────────────────────────────────

    async function driveGet(url) {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${_token}` } });
        if (!r.ok) throw new Error(`Drive GET ${r.status}`);
        return r.json();
    }

    async function driveDelete(fileId) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${_token}` }
        });
        if (!r.ok && r.status !== 404) throw new Error(`Drive DELETE ${r.status}`);
    }

    // Findet eine Datei/Ordner per Name in einem Parent-Ordner (oder root)
    async function findFile(name, parentId, mimeType) {
        let q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
        if (mimeType) q += ` and mimeType='${mimeType}'`;
        if (parentId) q += ` and '${parentId}' in parents`;
        const res = await driveGet(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&spaces=drive`
        );
        return res.files && res.files.length ? res.files[0] : null;
    }

    // Erstellt einen Ordner
    async function createFolder(name, parentId) {
        const meta = { name, mimeType: MIME_FOLDER };
        if (parentId) meta.parents = [parentId];
        const r = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(meta)
        });
        if (!r.ok) throw new Error(`Drive mkdir ${r.status}`);
        return (await r.json()).id;
    }

    // Gibt ID zurück (erstellt wenn nötig)
    async function ensureFolder(name, parentId) {
        const existing = await findFile(name, parentId, MIME_FOLDER);
        if (existing) return existing.id;
        return createFolder(name, parentId);
    }

    // Stellt sicher dass NINA/, NINA/notes/, NINA/attachments/ existieren
    async function ensureFolderStructure() {
        if (_notesFolderId && _attachFolderId) return;
        _folderId = await ensureFolder(FOLDER_NAME, null);
        _notesFolderId = await ensureFolder(NOTES_SUBFOLDER, _folderId);
        _attachFolderId = await ensureFolder(ATTACH_SUBFOLDER, _folderId);
    }

    // ── ATTACHMENT UPLOAD / DOWNLOAD ──────────────────────────────────────────

    // Konvertiert einen Data-URL-String in einen Blob
    function dataUrlToBlob(dataUrl) {
        const [header, base64] = dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        return new Blob([array], { type: mimeType });
    }

    // Lädt einen Anhang in NINA/attachments/{noteId}/ hoch
    // Gibt die Drive-File-ID zurück
    async function uploadAttachment(dataUrl, filename, noteId) {
        await ensureFolderStructure();

        // Unterordner für diese Notiz sicherstellen
        const noteAttachFolder = await ensureFolder(noteId, _attachFolderId);

        const blob = dataUrlToBlob(dataUrl);
        const mimeType = blob.type || 'application/octet-stream';

        const boundary = 'nina_att_' + Date.now();
        const meta = JSON.stringify({ name: filename, parents: [noteAttachFolder], mimeType });

        // Multipart-Upload
        const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`;
        const dataPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const end = `\r\n--${boundary}--`;

        const metaBytes = new TextEncoder().encode(metaPart);
        const dataPartBytes = new TextEncoder().encode(dataPart);
        const endBytes = new TextEncoder().encode(end);
        const fileBytes = new Uint8Array(await blob.arrayBuffer());

        const combined = new Uint8Array(metaBytes.length + dataPartBytes.length + fileBytes.length + endBytes.length);
        combined.set(metaBytes, 0);
        combined.set(dataPartBytes, metaBytes.length);
        combined.set(fileBytes, metaBytes.length + dataPartBytes.length);
        combined.set(endBytes, metaBytes.length + dataPartBytes.length + fileBytes.length);

        const r = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${_token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: combined
            }
        );
        if (!r.ok) throw new Error(`Drive upload attachment ${r.status}`);
        return (await r.json()).id;
    }

    // Lädt einen Anhang herunter und gibt einen Data-URL zurück
    async function downloadAttachmentAsDataUrl(fileId) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${_token}` }
        });
        if (!r.ok) throw new Error(`Drive download attachment ${r.status}`);
        const blob = await r.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // ── NOTE CRUD ─────────────────────────────────────────────────────────────

    // Listet alle Notiz-JSONs in NINA/notes/
    async function listNotes() {
        await ensureFolderStructure();
        const q = `'${_notesFolderId}' in parents and mimeType='${MIME_JSON}' and trashed=false`;
        const res = await driveGet(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&spaces=drive`
        );
        return res.files || [];
    }

    // Liest eine Notiz-Datei und gibt das JSON-Objekt zurück
    async function readNote(fileId) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${_token}` }
        });
        if (!r.ok) throw new Error(`Drive read ${r.status}`);
        return r.json();
    }

    // Speichert/aktualisiert eine Notiz in Drive
    // note: { id, title, content, created, updated, driveFileId }
    async function writeNote(note) {
        await ensureFolderStructure();

        const body = JSON.stringify({
            id: note.id,
            title: note.title,
            content: note.content,
            created: note.created,
            updated: note.updated,
            // Anhang-Metadaten mitspeichern (dataUrl bewusst weglassen –
            // wird auf anderen Geräten per driveId nachgeladen)
            attachments: (note.attachments || []).map(a => ({
                id: a.id,
                filename: a.filename,
                isImage: a.isImage,
                driveId: a.driveId
            }))
        });

        if (note.driveFileId) {
            // Update (PATCH)
            const boundary = 'nina_boundary_' + Date.now();
            const meta = JSON.stringify({ name: note.id + '.json' });
            const multipart = [
                `--${boundary}`,
                'Content-Type: application/json; charset=UTF-8',
                '',
                meta,
                `--${boundary}`,
                `Content-Type: ${MIME_JSON}`,
                '',
                body,
                `--${boundary}--`
            ].join('\r\n');

            const r = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${note.driveFileId}?uploadType=multipart`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${_token}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`
                    },
                    body: multipart
                }
            );
            if (!r.ok) throw new Error(`Drive PATCH ${r.status}`);
            return note.driveFileId;
        } else {
            // Neu erstellen (POST)
            const boundary = 'nina_boundary_' + Date.now();
            const meta = JSON.stringify({ name: note.id + '.json', parents: [_notesFolderId], mimeType: MIME_JSON });
            const multipart = [
                `--${boundary}`,
                'Content-Type: application/json; charset=UTF-8',
                '',
                meta,
                `--${boundary}`,
                `Content-Type: ${MIME_JSON}`,
                '',
                body,
                `--${boundary}--`
            ].join('\r\n');

            const r = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${_token}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`
                    },
                    body: multipart
                }
            );
            if (!r.ok) throw new Error(`Drive POST ${r.status}`);
            return (await r.json()).id;
        }
    }

    // Löscht eine Notiz-Datei aus Drive
    async function deleteNote(fileId) {
        await driveDelete(fileId);
    }

    // ── SYNC ──────────────────────────────────────────────────────────────────

    // Mergt lokale und Drive-Notizen (newer wins by `updated` timestamp)
    // Gibt das finale Array zurück und aktualisiert driveFileId in lokalen Notizen
    async function syncAll(localNotes) {
        const driveFiles = await listNotes();

        // Drive → lokale Map aufbauen
        const driveMap = {};
        for (const f of driveFiles) {
            try {
                const note = await readNote(f.id);
                driveMap[note.id] = { ...note, driveFileId: f.id };
            } catch (_) {}
        }

        const localMap = {};
        for (const n of localNotes) localMap[n.id] = n;

        const allIds = new Set([...Object.keys(localMap), ...Object.keys(driveMap)]);
        const merged = [];

        for (const id of allIds) {
            const local = localMap[id];
            const remote = driveMap[id];

            if (local && remote) {
                // Beide vorhanden → newer wins
                const winner = local.updated >= remote.updated ? local : remote;
                winner.driveFileId = remote.driveFileId;
                merged.push(winner);
                if (local.updated > remote.updated) {
                    // Lokal neuer → Drive updaten
                    await writeNote(winner).catch(() => {});
                }
            } else if (local && !remote) {
                // Nur lokal → in Drive hochladen
                const driveId = await writeNote(local).catch(() => null);
                local.driveFileId = driveId;
                merged.push(local);
            } else if (!local && remote) {
                // Nur in Drive → lokal übernehmen
                merged.push(remote);
            }
        }

        return merged;
    }

    // ── PUBLIC API ────────────────────────────────────────────────────────────

    window.NinaDrive = {
        isConnected() {
            return !!_token;
        },

        async connect() {
            _token = await getToken(true);
            await chrome.storage.local.set({ [AUTH_KEY]: true });
        },

        async disconnect() {
            await revokeToken();
            _folderId = null;
            _notesFolderId = null;
            _attachFolderId = null;
            await chrome.storage.local.remove(AUTH_KEY);
        },

        async writeNote(note) {
            if (!_token) return;
            const driveId = await writeNote(note);
            note.driveFileId = driveId;
            return driveId;
        },

        async deleteNote(fileId) {
            if (!_token || !fileId) return;
            await deleteNote(fileId);
        },

        async syncAll(localNotes) {
            if (!_token) return null;
            return syncAll(localNotes);
        },

        // Lädt einen Anhang in Drive hoch, gibt Drive-File-ID zurück
        async uploadAttachment(dataUrl, filename, noteId) {
            if (!_token) return null;
            return uploadAttachment(dataUrl, filename, noteId);
        },

        // Lädt einen Anhang von Drive als Data-URL herunter
        async downloadAttachment(fileId) {
            if (!_token || !fileId) return null;
            return downloadAttachmentAsDataUrl(fileId);
        },

        async tryAutoConnect() {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return false;
            const res = await new Promise(r => chrome.storage.local.get([AUTH_KEY], r));
            if (!res[AUTH_KEY]) return false;
            try {
                _token = await getToken(false);
                return true;
            } catch (_) {
                return false;
            }
        }
    };

    // Auto-Reconnect beim Laden (nur wenn Extension-Kontext gültig)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id) {
        window.NinaDrive.tryAutoConnect().catch(() => {});
    }
})();
