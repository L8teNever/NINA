# 🎬 NINA - Video-Streaming Companion

**Made by Simon**

---

## 📱 Chrome Web Store

[➜ NINA im Chrome Web Store anschauen](https://chromewebstore.google.com/detail/nina/hodpbndnggncjcpilnjggfjcmnkjmmjp?hl=de&utm_source=ext_sidebar)

---

## 🎯 Über NINA

NINA ist dein persönlicher Begleiter für Video-Streaming-Plattformen. Mit NINA kannst du deine Streaming-Erfahrung vollständig personalisieren und optimieren – alles lokal in deinem Browser, ohne Umwege über externe Server.

### ✨ Hauptfunktionen

- ⚡ **Video-Geschwindigkeit anpassen** – Spielgeschwindigkeit auf über 30 Streaming-Plattformen einstellen
- 🔊 **Audio-Verbesserungen** – Sound-Optimierungen und Anpassungen
- 👎 **YouTube Dislikes anzeigen** – Sehe wieder, wie viele Dislikes Videos haben
- 📝 **Notizen mit Google Drive Sync** – Erstelle Notizen zu Videos und synchronisiere sie mit Google Drive
- 🔍 **Overlay-Suche** – Schnelle Suchfunktion direkt auf jeder Seite
- 🎨 **Moderne UI** – Intuitive Seitenleiste und Optionen

### 🎥 Unterstützte Plattformen

- YouTube & YouTube Shorts
- Netflix
- Disney+
- Amazon Prime Video
- Twitch
- Crunchyroll
- DAZN
- HBO Max / Max
- Paramount+
- Apple TV
- Hulu
- Vimeo
- Joyn
- ZDF Mediathek & ARD Mediathek
- RTL+ & TVNow
- Und viele weitere!

---

## 📥 Installation

### Methode 1: Chrome Web Store (Empfohlen) ⭐

1. Besuche den [Chrome Web Store](https://chromewebstore.google.com/detail/NINA/[EXTENSION_ID])
2. Klicke auf **"Zu Chrome hinzufügen"**
3. Bestätige die Berechtigung mit **"Erweiterung hinzufügen"**
4. Fertig! NINA ist nun aktiv und bereit zur Nutzung

### Methode 2: Manuelle Installation aus Quellcode

1. **Repository klonen oder downloaden:**
   ```bash
   git clone https://github.com/L8teNever/NINA.git
   cd NINA
   ```

2. **Chrome öffnen und zur Verwaltungsseite navigieren:**
   - Tippe `chrome://extensions/` in die Adressleiste

3. **Entwicklermodus aktivieren:**
   - Rechts oben den Schalter **"Entwicklermodus"** aktivieren

4. **Erweiterung laden:**
   - Klick auf **"Entpackte Erweiterung laden"**
   - Navigiere zum Verzeichnis, das `manifest.json` enthält
   - Bestätigen

5. **Fertig!** NINA erscheint nun in deinen Erweiterungen

---

## 🏗️ Projektstruktur

```
NINA/
├── manifest.json              # Chrome Extension Konfiguration
├── background.js              # Service Worker (Hintergrund-Prozesse)
├── ui/
│   ├── redirect.html          # Neue-Tabs-Seite
│   ├── options.html           # Einstellungen
│   ├── sidepanel.html         # Seitenleiste
│   ├── tailwind.min.css       # Styling
│   └── [weitere UI-Dateien]
├── content/
│   ├── speed-patch.js         # Video-Geschwindigkeit
│   ├── audio-patch.js         # Audio-Optimierungen
│   ├── frame-speed.js         # Frame-basierte Geschwindigkeit
│   ├── universal.js           # Universelle Plattform-Patches
│   ├── youtube-dislike.js     # YouTube Dislike API Integration
│   ├── joyn.js                # Joyn-spezifische Funktionen
│   ├── overlay-search.js      # Suchfunktion
│   ├── notes-overlay.js       # Notizen-Interface
│   └── [weitere Content Scripts]
├── lib/
│   ├── google-drive.js        # Google Drive API
│   └── [weitere Bibliotheken]
├── styles/
│   └── overlay.css            # UI Styling
├── icons/
│   ├── icon16.png, icon32.png, icon48.png, icon128.png
│   └── icon.png
├── docs/
│   ├── README.md              # Deutsche Dokumentation
│   ├── README_EN.md           # Englische Dokumentation
│   ├── PRIVACY_POLICY.md      # Deutsche Datenschutz
│   └── PRIVACY_POLICY_EN.md   # Englische Datenschutz
└── [weitere Dateien]
```

### 🛠️ Tech-Stack

- **Frontend:** HTML5, CSS3 (Tailwind CSS), JavaScript (ES6+)
- **Backend:** Chrome Extension Manifest V3, Service Workers
- **APIs:** Google Drive API, YouTube Dislikes API, Sponsor.ajay (Sponsor Block)
- **Browser-APIs:** `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.sidePanel`, `chrome.bookmarks`, `chrome.identity`

---

## 💬 Support & Kontakt

Hast du Fragen oder Probleme? Kontaktiere uns:

📧 **E-Mail:** support-chrome@l8tenever.com

---

## 📄 Lizenz

Dieses Projekt ist unter der **MIT-Lizenz** lizenziert.  
Siehe `LICENSE` für weitere Informationen.

---

**Viel Spaß mit NINA! 🎉**
