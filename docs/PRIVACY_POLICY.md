# 🔒 Datenschutzerklärung – NINA Chrome Extension

**Gültig ab:** Juni 2026  
**Sprache:** Deutsch  
**Entspricht:** DSGVO & Google Chrome Web Store Richtlinien

---

## 📌 Allgemeines

Diese Datenschutzerklärung erklärt, wie die Chrome Extension **NINA** mit Ihren Daten umgeht. NINA ist eine Streaming-Erweiterung, die Ihnen hilft, Videos schneller abzuspielen, Audio zu optimieren, Notizen zu erstellen und weitere Features auf Streaming-Plattformen zu nutzen.

**Wichtigste Aussage:** NINA speichert fast alle Daten lokal auf Ihrem Gerät. Es werden keine persönlichen Informationen an externe Server übertragen – mit Ausnahme von explizit von Ihnen autorisierten Google Drive-Uploads für Notizen.

---

## 👤 Verantwortlicher & Kontakt

| Information | Wert |
|-----------|-------|
| **Entwickler** | Simon |
| **E-Mail** | support-chrome@l8tenever.com |
| **GitHub** | https://github.com/L8teNever/NINA |
| **Land** | Deutschland |

Für Fragen zur Datenschutzerklärung oder zu Ihren Rechten kontaktieren Sie uns unter der oben angegebenen E-Mail-Adresse.

---

## 💾 Lokal gespeicherte Daten

Die folgende Daten werden **ausschließlich lokal auf Ihrem Computer** gespeichert und verlassen Ihr Gerät nicht:

### Benutzerpräferenzen & Einstellungen

Über die NINA-Einstellungsseite können Sie folgende Einstellungen speichern:

| Einstellung | Speicherort | Beschreibung |
|-----------|-----------|----------|
| **Geschwindigkeitsprofile** | `chrome.storage.local` | Ihre bevorzugten Wiedergabegeschwindigkeiten pro Website |
| **Audio-Einstellungen** | `chrome.storage.local` | Audio-Optimierungsparameter |
| **Aktivierte Websites** | `chrome.storage.local` | Liste der Websites, auf denen NINA aktiv ist |
| **Feature-Toggles** | `chrome.storage.local` | Welche Features Sie aktiviert oder deaktiviert haben |
| **UI-Präferenzen** | `chrome.storage.local` | Sprache, Design, Sidebar-Status |

**Speichermechanismus:** NINA nutzt die Chrome Storage API (`chrome.storage.local`), die Daten in einem verschlüsselten, lokal verwalteten Speicher Ihres Browsers ablegt.

### Notizen & Annotation (Lokal)

- Notizen, die Sie in NINA erstellen, werden **zunächst lokal** auf Ihrem Gerät gespeichert
- Sie können lokal gespeicherte Notizen jederzeit löschen
- Diese Daten werden nicht an externe Server übertragen, solange Sie die Google Drive-Synchronisierung nicht aktivieren

---

## 🔗 Externe Dienste & Drittanbieter-APIs

### 1. **Google Drive Integration (Optional & Explizit)**

**Was passiert:**
- NINA kann Ihre Notizen mit Google Drive synchronisieren – **nur wenn Sie dies explizit aktivieren**
- Dazu benötigt NINA Zugriff auf Ihr Google-Konto

**Welche Daten werden übertragen:**
- Nur die Notizen, die Sie selbst in NINA erstellt haben
- Keine Browsing-Daten, Verlauf oder andere persönliche Informationen

**Warum wird das benötigt:**
- Um Ihre Notizen in der Cloud zu sichern und auf mehreren Geräten verfügbar zu machen
- Google verarbeitet diese Daten gemäß der [Google Datenschutzerklärung](https://policies.google.com/privacy)

**Ihre Kontrolle:**
- Sie können die Google Drive-Funktion jederzeit deaktivieren
- Sie können den Zugriff auf Ihr Google-Konto in den Chrome-Einstellungen widerrufen
- Bereits hochgeladene Notizen können Sie direkt in Google Drive löschen

**OAuth 2.0 Credentials:**
NINA nutzt Google OAuth 2.0 für sichere Authentifizierung. Dies ist ein branchenstandardisiertes Verfahren und Google erhält nur Informationen, dass Sie NINA autorisiert haben.

### 2. **Return YouTube Dislike API (Öffentlich & Datenschutzfreundlich)**

**Was passiert:**
- Auf YouTube-Videos zeigt NINA Community-Bewertungen (Likes/Dislikes) an
- Diese Daten kommen von der öffentlichen Return YouTube Dislike API: https://returnyoutubedislikeapi.com/

**Welche Daten werden übertragen:**
- Nur die YouTube-Video-ID, um die Bewertungen zu laden
- **Keine** persönlichen Informationen oder Nutzerdaten

**Warum wird das benötigt:**
- Google hat die öffentliche Dislike-Zahl aus YouTube entfernt
- Diese API stellt Community-Bewertungen wieder her
- Es ist ein öffentlicher Dienst mit eigener Datenschutzerklärung

**Ihre Kontrolle:**
- Sie können diese Funktion in den NINA-Einstellungen deaktivieren
- Die API sammelt keine Informationen, die Sie identifizieren können

### 3. **Sponsor API (Video-Skipping Feature)**

**Was passiert:**
- NINA kann Sponsor-Segmente in YouTube-Videos automatisch überspringen (wenn aktiviert)
- Daten kommen von https://sponsor.ajay.app/

**Welche Daten werden übertragen:**
- Nur die Video-ID, um zu erkennen, welche Segmente übersprungen werden
- **Keine** persönlichen Daten

**Ihre Kontrolle:**
- Diese Funktion kann in den Einstellungen deaktiviert werden

### 4. **Google APIs (Authentifizierung & Autorisierung)**

**Domains:**
- `www.googleapis.com`
- `oauth2.googleapis.com`
- `accounts.google.com`

**Zweck:** Sichere Authentifizierung für Google Drive und Google OAuth 2.0

**Datenübertragung:** Nur Authentifizierungstokens, keine Nutzerdaten

---

## 🔐 Berechtigungen – Detaillierte Erklärung

NINA fordert die folgenden Berechtigungen an. Hier erklären wir, warum:

### ✅ `activeTab`

**Zweck:** Zugriff auf den aktuellen Tab, den Sie gerade offen haben

**Verwendung:**
- Um zu erkennen, welche Streaming-Seite Sie gerade besuchen
- Um Speed-Control und Audio-Funktionen genau auf die richtige Seite anzuwenden

**Datenschutz:** Diese Berechtigung wird nur aktiviert, wenn Sie eine unterstützte Streaming-Seite besuchen

---

### ✅ `storage`

**Zweck:** Speichern Ihrer Einstellungen lokal

**Verwendung:**
- Speichert Ihre bevorzugten Geschwindigkeiten, Audio-Einstellungen, Notizen, UI-Präferenzen
- Alle Daten bleiben **auf Ihrem Gerät**

**Datenschutz:** Nur Sie und NINA haben Zugriff auf diese Daten

---

### ✅ `scripting`

**Zweck:** Injection von Code in Web-Seiten zur Anpassung von Funktionalität

**Verwendung:**
- Platziert Speed-Control und Audio-Buttons auf Streaming-Seiten
- Macht YouTube-Dislikes sichtbar
- Aktiviert Notizen-Overlays

**Datenschutz:** 
- Der injizierte Code lädt nur lokale Ressourcen
- Kein Tracking oder Datensammlung durch diese Berechtigung

---

### ✅ `tabs`

**Zweck:** Verwaltung und Überwachung von Browser-Tabs

**Verwendung:**
- Um zu verfolgen, welche Tabs offen sind (für Kontextinformationen)
- Um Features bei Tab-Wechsel zu aktualisieren

**Datenschutz:** NINA speichert keine Tab-Historien oder persönliche Informationen über die Seiten, die Sie besuchen

---

### ✅ `sidePanel`

**Zweck:** Öffnen und Verwalten der NINA Sidebar

**Verwendung:**
- Zeigt die NINA-Einstellungen und Noten in einem Side-Panel

**Datenschutz:** Nur UI-Verwaltung, keine Datensammlung

---

### ✅ `bookmarks`

**Zweck:** Zugriff auf Ihre Browser-Lesezeichen

**Verwendung:**
- Optional: Ermöglicht das Erstellen von Lesezeichen für Ihre Notizen
- Verbessert die Notiz-Verwaltung

**Datenschutz:** 
- NINA verändert Ihre Lesezeichen nicht ohne Ihr Wissen
- Diese Berechtigung ist optional und kann deaktiviert werden

---

### ✅ `identity`

**Zweck:** Authentifizierung mit Google-Konto

**Verwendung:**
- Nur für Google Drive-Integration (optional)
- Sichere OAuth 2.0 Authentifizierung

**Datenschutz:** 
- Google authentifiziert Sie, teilt Ihre Identität aber nicht mit NINA
- Sie können diese Berechtigung jederzeit widerrufen

---

### ✅ `favicon`

**Zweck:** Abrufen von Website-Icons

**Verwendung:**
- Zeigt Favicons (Website-Icons) in der Notizen-Liste an
- Verbessert die Benutzerfreundlichkeit

**Datenschutz:** Dies sind öffentliche Icons, die von Websites bereitgestellt werden

---

## 📍 Host Permissions – Betroffene Domains

NINA fordert Zugriffsrechte für die folgenden Domains an:

**Streaming-Plattformen:**
- YouTube, Netflix, Amazon Prime Video, Disney+, Twitch
- Crunchyroll, DAZN, Hulu, Apple TV+, Max (HBO), Paramount+
- Joyn, ZDF, ARD Mediathek, RTL+, Arte.tv
- Und weitere (insgesamt 25+ Plattformen)

**Google Services:**
- `www.googleapis.com` (Google Drive API)
- `oauth2.googleapis.com` (Authentifizierung)
- `accounts.google.com` (Google Anmeldung)

**APIs:**
- `sponsor.ajay.app` (Sponsor-Skipping)
- `returnyoutubedislikeapi.com` (YouTube Dislikes)

**Zweck:** Damit NINA korrekt auf diesen Seiten funktioniert und Features wie Speed-Control, Audio-Enhancement und Notizen bereitstellen kann.

---

## 🚫 Was NINA NICHT tut

✅ NINA sammelt KEINE:
- ❌ Browsing-Verlauf
- ❌ Passwörter oder Anmeldedaten
- ❌ Kreditkartendaten oder Zahlungsinformationen
- ❌ Persönliche Metadaten (Name, Adresse, Telefonnummer)
- ❌ IP-Adressen oder Geolocation
- ❌ Informationen über besuchte Websites (außer Funktionalität)
- ❌ Cookies von Drittanbietern (nur eigene Einstellungen)

✅ NINA speichert NICHT:
- ❌ Sitzungsdaten
- ❌ Logs Ihrer Streaming-Aktivitäten
- ❌ Informationen über Videos, die Sie ansehen

✅ NINA verkauft NIEMALS:
- ❌ Ihre Daten an Dritte
- ❌ Ihre Daten zu Werbe- oder Marketingzwecken
- ❌ Ihre Daten an Datenbroker

---

## 🗑️ Datenlöschung & Ihr Recht zum Vergessen

### Automatische Löschung

**Wenn Sie NINA deinstallieren:**
- ✅ Alle lokal gespeicherten Daten werden sofort gelöscht
- ✅ Alle Einstellungen, Notizen und Präferenzen werden entfernt
- ✅ Chrome bereinigt automatisch alle Extension-Daten

### Manuelle Löschung

Sie können jederzeit einzelne Daten löschen:

1. **Notizen löschen:** Öffnen Sie die NINA-Einstellungen → Klicken Sie auf "Notizen löschen"
2. **Google Drive trennen:** Öffnen Sie Einstellungen → Google-Konto deaktivieren
3. **Alle lokalen Daten zurücksetzen:** Deinstallieren → Neuinstallieren

### Google Drive Daten

- Notizen, die Sie auf Google Drive hochgeladen haben, müssen Sie manuell in Google Drive löschen
- Öffnen Sie: https://drive.google.com → Suchen Sie NINA-Notizen → Papierkorb

---

## 📋 Ihre DSGVO-Rechte

Nach der Europäischen Datenschutz-Grundverordnung (DSGVO) haben Sie folgende Rechte:

### 1. **Recht auf Auskunft (Art. 15 DSGVO)**
- Sie können jederzeit erfragen, welche Daten NINA von Ihnen speichert
- **Antwort:** NINA speichert nur Daten, die Sie selbst eingeben (Einstellungen, Notizen)

### 2. **Recht auf Berichtigung (Art. 16 DSGVO)**
- Sie können falsche Daten korrigieren
- Sie können Ihre Einstellungen und Notizen in NINA jederzeit ändern

### 3. **Recht auf Löschung (Art. 17 DSGVO)**
- Sie können jederzeit die Löschung Ihrer Daten verlangen
- **Wie:** Deinstallieren Sie NINA oder nutzen Sie die "Daten zurücksetzen"-Funktion

### 4. **Recht auf Datenportabilität (Art. 20 DSGVO)**
- Sie können Ihre Notizen exportieren
- Ihre Einstellungen können über JSON exportiert werden (falls verfügbar)

### 5. **Recht auf Widerspruch (Art. 21 DSGVO)**
- Sie können der Verarbeitung Ihrer Daten widersprechen
- **Wie:** Deaktivieren Sie bestimmte Features in den Einstellungen oder deinstallieren Sie NINA

---

## 🔄 Datenverarbeitung bei Google Drive Sync

Falls Sie die Google Drive-Integration nutzen:

| Aspekt | Details |
|--------|----------|
| **Datenverantwortlicher** | Sie (Ihr Google-Konto) & NINA-Entwickler |
| **Rechtsgrundlage** | Ausdrückliche Zustimmung (Art. 6 Abs. 1 a DSGVO) |
| **Speicherdauer** | Solange Sie Ihre NINA-Notizen auf Google Drive aufbewahren |
| **Empfänger** | Google Ireland Limited (Google Services) |
| **Weitergabe an Dritte** | Nein (außer Google zur technischen Speicherung) |
| **Automatische Profilerstellung** | Nein |

---

## 🌍 Internationale Datenübertragung

**Google Drive Speicherung:**
- Daten werden in Google-Rechenzentren weltweit gespeichert
- Google hat Standardvertragsklauseln (SCC) und andere Sicherungsmechanismen
- Dies geschieht nur mit Ihrer expliziten Zustimmung

**APIs:**
- Return YouTube Dislike und Sponsor API können Daten weltweit verarbeiten
- Dies sind jedoch nur Video-IDs, keine persönlichen Daten

---

## 🔐 Sicherheit & Verschlüsselung

**Lokal gespeicherte Daten:**
- ✅ Chrome verschlüsselt `chrome.storage.local` lokal
- ✅ Daten werden durch Ihr Gerätekennwort geschützt
- ✅ Kein Netzwerkverkehr für lokale Daten

**Google Drive Daten:**
- ✅ Übertragung über HTTPS verschlüsselt
- ✅ Google Drive nutzt End-to-End Verschlüsselung (falls aktiviert)
- ✅ OAuth 2.0 sichere Authentifizierung

---

## 📧 Änderungen an dieser Datenschutzerklärung

Wir können diese Datenschutzerklärung jederzeit ändern. 

**Wenn sich etwas ändert:**
- ✅ Wir werden Sie über GitHub oder die Chrome Web Store notifizieren
- ✅ Die Versionsgeschichte wird gepflegt
- ✅ Sie haben das Recht, NINA zu deinstallieren, wenn Sie den neuen Bedingungen nicht zustimmen

---

## 📞 Kontakt 

**Bei Fragen:**
- Kontaktieren Sie uns unter: support-chrome@l8tenever.com
- GitHub Issues: https://github.com/L8teNever/NINA/issues
---

## ✅ Zusammenfassung – Das Wichtigste

| Frage | Antwort |
|--------|----------|
| **Sammelt NINA meine Daten?** | Nur die Einstellungen, die Sie eingeben – lokal auf Ihrem Gerät |
| **Werden meine Daten an Dritte weitergegeben?** | Nein – außer optional an Google Drive (auf Ihre Anfrage hin) |
| **Wie kann ich meine Daten löschen?** | Deinstallieren Sie NINA oder nutzen Sie die Reset-Funktion |
| **Ist NINA sicher?** | Ja – verschlüsselte lokale Speicherung, HTTPS für externe APIs |
| **Kann ich NINA vertrauen?** | Ja – Open Source auf GitHub, transparente Datenschutzerklärung |
| **Welche Daten werden on YouTube Dislikes benötigt?** | Nur die Video-ID – keine persönlichen Daten |

---

**Datum der letzten Aktualisierung:** Juni 2026  
**Version:** 1.0  
**Sprache:** Deutsch  
**Zuständigkeit:** Deutschland

🔒 Ihre Privatsphäre ist uns wichtig. Danke, dass Sie NINA nutzen!