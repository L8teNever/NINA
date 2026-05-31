# NINA — Chrome Web Store Listing (Copy-Paste-Vorlage)

Alle Texte für das Chrome Web Store Developer Dashboard. Reihenfolge entspricht den Tabs / Feldern im Dashboard.

---

## 1. Tab "Store-Eintrag"

### Feld: Name
```
NINA
```

### Feld: Kurzbeschreibung (max 132 Zeichen)
```
NINA — Speed-, Audio-Boost & Auto-Skip für Streaming-Dienste. Mit Auto-Like, SponsorBlock & Dislike-Anzeige.
```

### Feld: Ausführliche Beschreibung
```
NINA — die All-in-One-Mediensteuerung für deinen Browser.

🎬 Variable Wiedergabegeschwindigkeit
Stelle jedes Video stufenlos zwischen 0.25× und 10× ein. Funktioniert auf
den meisten großen Streaming-Diensten. Die Geschwindigkeit bleibt fest —
auch wenn der Player versucht, sie zurückzusetzen.

🔊 Audio-Boost bis 600 %
Zu leise Videos sind Geschichte. Der eingebaute WebAudio-Verstärker hebt
die Lautstärke weit über das normale Browser-Maximum hinaus an.

⏭ Auto-Skip
Überspringt Intros, Outros und Werbeunterbrechungen automatisch, sobald
ein Skip-Button erscheint. Erkennt zusätzlich die „Nächste Folge"-Buttons
der großen Streaming-Anbieter und führt dich nahtlos weiter.

👍 Auto-Like für YouTube
Sobald du mehr als X % eines Videos angesehen hast, wird der Like-Button
automatisch gedrückt. Schwelle frei zwischen 1 % und 100 % einstellbar,
Standard 10 %, jederzeit deaktivierbar. Bereits gelikte Videos werden
nicht erneut angeklickt — kein versehentliches Un-Liken.

🚫 SponsorBlock-Integration auf YouTube
Farbige Markierungen für Sponsor-Werbung, Eigenwerbung, Intros, Outros,
Vorschau, Off-Topic-Musik und Filler direkt in der Fortschrittsleiste.
Hover zeigt Details an, ein Klick auf den Skip-Button springt vor.

📊 YouTube-Dislike-Zahl wiederhergestellt
Blendet die entfernte Dislike-Zahl wieder neben dem Daumen ein
(via öffentliche Return-YouTube-Dislike-API).

⚡ Tastenkürzel auf jeder Streaming-Seite
• A / D — langsamer / schneller
• ↑ / ↓ — Lautstärke

🛠 Selbstdiagnose & Funktionstest
Eingebauter Test: prüft auf Knopfdruck, ob die Geschwindigkeitsanpassung
auf der aktuellen Seite tatsächlich greift, und gibt bei Problemen eine
konkrete Fehlermeldung samt Lösungshinweis (z. B. „Player überschreibt
playbackRate — Seite neu laden").

🎨 Material 3 Design
Aufgeräumte Side-Panel-Oberfläche im Android-15-Dark-Mode-Look. Kompakte
Toolbar-Popup-Ansicht für schnelle Zugriffe.

🔐 Datenschutz
Keine Tracker, keine Konten, keine externen Skripte. Deine Einstellungen
werden ausschließlich lokal in deinem Browser gespeichert. Die einzigen
Netzwerk-Aufrufe gehen zu den öffentlichen JSON-APIs von SponsorBlock und
Return-YouTube-Dislike — und nur auf YouTube-/watch-Seiten mit der
Video-ID, die du ohnehin gerade ansiehst.

🌍 Mehrsprachig verfügbar
Unterstützt vollständig Deutsch und Englisch (passt sich automatisch an die Browsersprache an).

Unterstützte Plattformen
NINA funktioniert auf den gängigsten Streaming-Plattformen weltweit, darunter internationale Video-Dienste, deutschsprachige Mediatheken, Live-Streaming-Plattformen und spezialisierte Anime-Services.
```

### Feld: Kategorie
```
Unterhaltung
```
(alternativ: *Produktivität*)

### Feld: Sprache
```
Deutsch
```

### Feld: Symbolbild (Store icon)
Upload: `icons/icon128.png` (128 × 128 px)

### Feld: Screenshots
Upload: `screenshots/nina-screenshot-1280x800.png` (1280 × 800 px)

---

## 2. Tab "Umgang mit dem Datenschutz" / Privacy practices

### Feld: Beschreibung des alleinigen Zwecks (Single Purpose)
```
Mediensteuerung auf Streaming-Webseiten: stufenloses Anpassen der
Wiedergabegeschwindigkeit (0.25× – 10×), Audio-Verstärker bis 600 %,
automatisches Überspringen von Intros und Werbeunterbrechungen,
optionales automatisches Liken eines YouTube-Videos nach einer vom
Nutzer wählbaren Prozent-Schwelle, dazu SponsorBlock-Markierungen
und Anzeige der entfernten YouTube-Dislike-Zahl.
```

### Permission Justifications

#### `activeTab`
```
Wird genutzt, um beim Klick auf das Toolbar-Icon das Side-Panel für genau den Tab zu öffnen, in dem der Nutzer aktiv ist, und um die gewählte Geschwindigkeit/Lautstärke sofort an dieses Tab zu senden. Nutzergeste-gebunden, kein passives Lesen anderer Tabs.
```

#### `storage`
```
Speichert die persönlichen Einstellungen (Wiedergabegeschwindigkeit, Audio-Boost-Pegel, Auto-Skip-An/Aus, Auto-Like-An/Aus + Schwelle in %) lokal über chrome.storage.local, damit sie zwischen Browser-Sitzungen erhalten bleiben. Ohne diese Berechtigung müsste der Nutzer alles bei jedem Browserstart erneut konfigurieren.
```

#### `scripting`
```
Erforderlich, damit die Erweiterung nach SPA-Navigationen (YouTube, Netflix, Disney+ wechseln Videos ohne vollen Seitenreload) den Speed-Patch in den aktiven Tab nachinjizieren kann, sowie um beim Bewegen des Geschwindigkeits-Sliders im Side-Panel die neue Rate latenzfrei in den MAIN-World des aktiven Tabs zu übertragen.
```

#### `tabs`
```
Wird ausschließlich für chrome.tabs.query({active:true}) zum Ermitteln des aktiven Tabs und für chrome.tabs.onUpdated benutzt, um nach SPA-Navigationen das Re-Injizieren auszulösen. Die Tab-URL wird nur zum Prüfen des Schemas (http(s)) gelesen, damit nicht-injizierbare Seiten (chrome://, Web Store) sauber ignoriert werden. Es findet kein Tab-übergreifendes Auslesen statt.
```

#### `sidePanel`
```
Das gesamte Haupt-UI der Erweiterung ist ein Side Panel (sidepanel.html). chrome.sidePanel.open() wird im Klick-Handler des Toolbar-Icons aufgerufen, damit das Panel direkt aufgeht.
```

### Host Permission Justification
```
Die Erweiterung muss auf jeder der gelisteten Streaming-Plattformen HTMLMediaElement.prototype.playbackRate patchen und ein WebAudio-GainNode für den Audio-Boost installieren. Joyn rendert seinen Player in einem cross-origin Iframe auf glomex.com, deshalb muss diese Domain mit in der Liste sein. Die beiden HTTPS-Hosts sponsor.ajay.app und returnyoutubedislikeapi.com werden ausschließlich auf YouTube /watch-Seiten aufgerufen, um öffentliche JSON-Daten (SponsorBlock-Segmente und Dislike-Zähler) abzufragen — kein Code-Download, kein Tracking, keine Übertragung von Nutzerdaten.
```

### Verwendung von Remote-Code
**Auswahl: Nein**

Begründung (falls Feld vorhanden):
```
Die Erweiterung lädt und führt keinen externen Code aus. Es bestehen genau zwei fetch-Aufrufe, beide ausschließlich auf YouTube-/watch-Seiten und beide gegen öffentliche, dokumentierte JSON-APIs:
- https://sponsor.ajay.app/api/skipSegments?videoID=… (SponsorBlock) liefert Segment-Zeitstempel
- https://returnyoutubedislikeapi.com/votes?videoId=… (Return-YouTube-Dislike) liefert die öffentliche Dislike-Zahl

Beide Responses sind reine JSON-Daten, die geparst und in die Seiten-UI eingefügt werden. Es wird kein Skript, kein WebAssembly und keine HTML-Fragmente von einem Drittserver heruntergeladen oder ausgeführt.
```

### Daten-Sammlung Checkliste (alle ❌ Nein)

| Kategorie | Sammelt NINA? |
|---|---|
| Personally identifiable information | ❌ Nein |
| Health information | ❌ Nein |
| Financial and payment information | ❌ Nein |
| Authentication information | ❌ Nein |
| Personal communications | ❌ Nein |
| Location | ❌ Nein |
| Web history | ❌ Nein |
| User activity | ❌ Nein |
| Website content | ❌ Nein |

### Drei Zusicherungen (alle ✅ haken)

- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## 3. Englische Fassung (für den englischen Web-Store-Eintrag)

### Feld: Name
```
NINA — Media Controller
```

### Feld: Kurzbeschreibung (max 132 Zeichen)
```
NINA — Speed control, audio boost & auto-skip for streaming sites. Includes auto-like, SponsorBlock & dislikes.
```

### Feld: Ausführliche Beschreibung
```
NINA — the all-in-one media controller for your browser.

🎬 Variable Playback Speed
Adjust any video playback speed continuously between 0.25× and 10×. Works on most major streaming services. The speed remains locked—even when the player tries to reset it.

🔊 Audio Boost up to 600%
Too quiet videos are a thing of the past. The built-in WebAudio amplifier boosts the volume far beyond the browser's normal maximum.

⏭ Auto-Skip
Automatically skips intros, recaps, and ad breaks as soon as a skip button appears. Additionally detects the "Next Episode" buttons of major streaming providers and takes you forward seamlessly.

👍 Auto-Like for YouTube
As soon as you watch more than X% of a video, the like button is automatically clicked. The threshold is freely adjustable between 1% and 100% (default 10%) and can be disabled at any time. Already liked videos will not be clicked again—no accidental un-likes.

🚫 SponsorBlock Integration on YouTube
Colored markers for sponsor ads, self-promotion, intros, outros, previews, off-topic music, and fillers directly in the progress bar. Hover shows details; clicking the skip button jumps forward.

📊 YouTube Dislike Count Restored
Displays the removed dislike count next to the thumbs-up icon (via the public Return-YouTube-Dislike API).

⚡ Keyboard Shortcuts on Any Streaming Site
• A / D — slower / faster
• ↑ / ↓ — volume up / down

🎨 Material 3 Design
Clean sidebar interface in a dark mode look. Compact toolbar popup view for quick access.

🔐 Privacy
No trackers, no accounts, no external scripts. Your settings are stored exclusively local in your browser. The only network requests go to the public JSON APIs of SponsorBlock and Return-YouTube-Dislike—and only on YouTube watch pages using the video ID you are currently viewing.

🌍 Multilingual
Fully supports English and German (automatically adapts to your browser language).

Supported Platforms:
NINA works on the most popular streaming platforms worldwide, including international video services, media libraries, live streaming platforms, and specialized anime services.
```

### Single purpose
```
Media control for streaming websites: variable playback speed (0.25× – 10×), audio gain boost up to 600%, automatic skipping of intros and ad breaks, optional auto-like of a YouTube video after a user-defined percentage of the video has been watched, SponsorBlock markers, and restoration of the removed YouTube dislike count.
```

### Permission justifications (EN)

**activeTab**
```
Used on user click to open the side panel against the currently active tab and push speed/volume changes only to that tab.
```

**storage**
```
Persists user preferences (speed, audio boost, auto-skip, auto-like threshold) across browser sessions.
```

**scripting**
```
Required to re-inject the speed/volume patches after SPA navigations on streaming sites and to push slider changes from the side panel to the page's MAIN world without latency.
```

**tabs**
```
Used to identify the active tab and react to navigations; the URL is only read to skip non-injectable schemes (chrome://, Web Store).
```

**sidePanel**
```
The extension's primary UI is a Side Panel opened via chrome.sidePanel.open() on toolbar click.
```

### Host permission justification (EN)
```
The core feature (HTMLMediaElement.prototype.playbackRate patch and WebAudio gain boost) must run in every frame that hosts a <video> element on the listed streaming platforms, including cross-origin player iframes (glomex.com for joyn.de). The two HTTPS hosts sponsor.ajay.app and returnyoutubedislikeapi.com are accessed only on YouTube /watch pages to fetch public JSON data (SponsorBlock segment timestamps and dislike counts). No page content is read, stored, or transmitted to extension servers.
```

### Remote code (EN)
```
No. The extension does not load or execute any remote code. It performs exactly two fetch requests, both only on YouTube /watch pages and both against public, documented JSON APIs (sponsor.ajay.app, returnyoutubedislikeapi.com). Both responses are pure JSON data that is parsed and rendered into the page UI. No script, WebAssembly, or HTML fragment is downloaded or executed from any third-party server.
```

---

## 4. Kontakt-E-Mail (außerhalb des Listings)

Dashboard → oben rechts → **Kontoeinstellungen** → Feld *Kontakt-E-Mail-Adresse* → eintragen → Bestätigungsmail abwarten → Link klicken.

---

## 5. Übersicht: was hochladen

| Slot | Datei |
|---|---|
| Symbolbild (Store icon) | `icons/icon128.png` |
| Screenshot 1 | `screenshots/nina-screenshot-1280x800.png` |
| Erweiterungs-ZIP | `nina.zip` (1.2 MB → 56 KB, je nach Build) |

---

## 6. Manifest-Übersicht (zur Referenz)

- **Name:** NINA
- **Version:** 3.1.2
- **Permissions:** `activeTab`, `storage`, `scripting`, `tabs`, `sidePanel`
- **Host Permissions:** 37 explizite Hosts (kein `<all_urls>`)
- **Single Purpose:** Mediensteuerung auf Streaming-Seiten
- **Remote Code:** Nein
- **Datenerfassung:** Keine
