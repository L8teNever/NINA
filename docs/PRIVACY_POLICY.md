# 🔒 Datenschutzerklärung – NINA

**Verantwortlicher:** Simon  
**E-Mail:** support-chrome@l8tenever.com  
**Gültig ab:** Juni 2026

---

## 📋 Überblick

NINA ist eine Chrome-Erweiterung, die Streaming-Plattformen verbessert und optimiert. Diese Datenschutzerklärung erklärt, welche Daten NINA erfasst, wie sie verarbeitet werden und welche Berechtigungen dafür notwendig sind.

**Wichtig:** NINA verarbeitet **alle Daten lokal in deinem Browser**. Keine Daten werden an externe Server übertragen (außer für die optionale Google Drive Synchronisierung, die nur mit expliziter Zustimmung erfolgt).

---

## 🎯 Was macht NINA?

NINA bietet folgende Funktionen auf Video-Streaming-Plattformen und Webseiten:

- **Video-Geschwindigkeitsregelung** – Passt die Wiedergabegeschwindigkeit an
- **Audio-Optimierungen** – Verbessert Audioqualität und -einstellungen
- **YouTube-Dislikes-Anzeige** – Zeigt historische Dislike-Zahlen an
- **Notizen-Funktion** – Ermöglicht Notizen zu Videos (optional mit Google Drive Sync)
- **Overlay-Suche** – Bietet schnelle Suchfunktion auf Websites
- **KI-Textverbesserung** – Verbessert markierten Text direkt in Eingabefeldern und Notizen (optional via Gemini API)
- **Plattform-spezifische Verbesserungen** – Optimiert Funktionen auf unterstützten Streaming-Seiten

---

## 💾 Lokale Datenerfassung

Alle Daten, die NINA erfasst, werden **ausschließlich lokal** in deinem Browser gespeichert:

### Gespeicherte Daten (Chrome Local & Sync Storage)

- **Nutzereinstellungen:** Deine Video-Geschwindigkeit, Audioeinstellungen, Textverbesserungs-Präferenzen und Oberflächeneinstellungen
- **Gemini API-Schlüssel:** Der für die KI-Textverbesserung angegebene API-Schlüssel (wird gesichert über `chrome.storage.sync` geräteübergreifend synchronisiert)
- **Notizen:** Lokal erstellte Notizen zu Videos (werden nur bei explizitem Google Drive Sync übertragen)
- **Bookmarks & Favoriten:** Lokal gespeicherte Video-Favoriten
- **Cache-Daten:** Technische Cache-Informationen zur Optimierung der Erweiterung

### Datenverarbeitung

- Alle Einstellungen werden durch `chrome.storage.local` verwaltet
- Daten verlassen deinen Browser **nicht** ohne explizite Aktion
- Daten werden **sofort gelöscht**, wenn du NINA deinstallierst

---

## 🔐 Berechtigungen & deren Verwendung

NINA benötigt folgende Berechtigungen, um ordnungsgemäß zu funktionieren:

| Berechtigung | Grund | Datennutzung |
|---|---|---|
| **`storage`** | Speichert deine Einstellungen lokal | Alle Nutzereinstellungen, Notizen und Präferenzen werden in `chrome.storage.local` gespeichert |
| **`activeTab`** | Ermittelt die aktive Website | Nur notwendig, um zu erkennen, welches Video du gerade anschaust (wird nicht protokolliert) |
| **`tabs`** | Zugriff auf Tab-Informationen | Verwaltet Tab-Metadaten lokal; keine Daten werden versendet |
| **`scripting`** | Modifiziert Video-Player | Injiziert Scripts in Streaming-Seiten, um Geschwindigkeit und Audio anzupassen |
| **`sidePanel`** | Öffnet die Seitenleiste | Zeigt die NINA-Seitenleiste mit Einstellungen und Notizen an |
| **`bookmarks`** | Zugriff auf Lesezeichen | Ermöglicht das Speichern von Video-Lesezeichen (lokal, nicht synchronisiert) |
| **`identity`** | Google-Authentifizierung | **Nur** für optionale Google Drive Synchronisierung (mit expliziter Zustimmung) |
| **`favicon`** | Website-Icons | Lädt Favicons lokal, um die UI zu verbessern |

---

## 🌐 Externe API-Verbindungen

NINA verbindet sich nur zu folgenden externen APIs, und **nur wenn die Funktion explizit genutzt wird**:

### Google Drive (Optional)

- **Zweck:** Notizen mit Google Drive synchronisieren
- **Aktivierung:** Nur, wenn du die Google Drive-Integration explizit aktivierst
- **Daten:** Notizen, die du manuell zu Google Drive synchronisierst
- **Kontrolle:** Du kannst diese Funktion jederzeit deaktivieren

### Google Gemini API (Optional)

- **Zweck:** KI-gestützte Verbesserung von Rechtschreibung, Zeichensetzung und Texten
- **Quelle:** `https://generativelanguage.googleapis.com/`
- **Aktivierung:** Nur, wenn du einen eigenen API-Schlüssel in den Einstellungen einträgst und die Verbesserung via Shortcut oder Button ausführst
- **Daten:** Nur der aktuell von dir markierte Textabschnitt sowie dein API-Schlüssel zur Autorisierung
- **Kontrolle:** Du bestimmst, wann Text an die API gesendet wird. Ohne API-Schlüssel oder explizite Aktion findet keine Übermittlung statt. Google verwendet API-Daten gemäß den Gemini API Terms (Daten werden standardmäßig nicht für das Modell-Training verwendet).

### YouTube Dislikes API

- **Zweck:** Historische Dislike-Zahlen abrufen
- **Quelle:** `https://returnyoutubedislikeapi.com/`
- **Daten:** Nur YouTube Video-IDs werden übertragen (anonymisiert)
- **Keine persönlichen Daten:** Deine Suchverlauf oder Nutzerinformationen werden nicht gesendet

### Sponsor.ajay (Optional)

- **Zweck:** Sponsor-Segmente in Videos erkennen (optional)
- **Quelle:** `https://sponsor.ajay.app/`
- **Daten:** Nur Video-Metadaten; keine persönlichen Informationen
- **Kontrolle:** Diese Funktion ist optional und kann deaktiviert werden

### Google APIs (Nur für Google Drive Sync)

- **Zweck:** OAuth-Authentifizierung für Google Drive
- **Quellen:** 
  - `https://www.googleapis.com/`
  - `https://oauth2.googleapis.com/`
  - `https://accounts.google.com/`
- **Daten:** Nur das Zugrifftoken wird übertragen (verschlüsselt)
- **Kontrolle:** Du gewährst Zugriff nur, wenn du Google Drive-Sync aktivierst

---

## 👤 Deine Rechte

### Dateneinsicht
Du kannst jederzeit deine gespeicherten Daten einsehen:
- Chrome-Einstellungen → Datenverwaltung → `chrome://extensions/` → NINA → "Speicher verwalten"

### Datenlöschung
**Deine Daten werden automatisch gelöscht, wenn du NINA deinstallierst:**
1. Chrome öffnen → `chrome://extensions/`
2. NINA finden
3. Auf den Papierkorb-Button klicken
4. Bestätigen

Die Löschung erfolgt **sofort und unwiderruflich**.

### Google Drive Daten
Falls du Google Drive Sync genutzt hast:
- Diese Daten sind auch in deinem Google Drive gespeichert
- Du kannst sie manuell über Google Drive löschen
- NINA speichert darauf keinen Zugriff nach der Deinstallation

---

## 🛡️ Sicherheit & Datenschutz

- **Keine Tracking:** NINA speichert keine Nutzungsdaten oder Browsing-Verlauf
- **Keine Drittanbieter-Werbung:** Keine Analytic-Tools oder Tracking-Pixel
- **Lokale Verarbeitung:** 100% der Datenverarbeitung findet lokal statt
- **Open Source:** Der Quellcode ist einsehbar auf [GitHub](https://github.com/L8teNever/NINA)
- **Regelmäßige Updates:** Sicherheitsupdates werden kontinuierlich eingespielt

---

## 📧 Kontakt & Fragen

Hast du Fragen zu dieser Datenschutzerklärung oder wie NINA deine Daten behandelt?

📧 **Schreib uns:** support-chrome@l8tenever.com

---

**Zuletzt aktualisiert:** Juni 2026  
**Version:** 1.0
