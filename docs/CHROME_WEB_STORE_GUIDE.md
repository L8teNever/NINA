# NINA - Chrome Web Store Upload Guide

Folge diesen Schritten, um NINA im Chrome Web Store zu veröffentlichen.

## Voraussetzungen

1. **Chrome Developer Account**: https://chrome.google.com/webstore/devconsole
2. **Registrierung**: $5 einmalige Gebühr (über Kreditkarte)
3. **Diese Dateien**:
   - Das NINA-Addon Verzeichnis
   - Die ZIP-Datei (NINA-addon.zip)
   - Screenshots (mindestens 1280x800px)
   - Icon (128x128px) - bereits vorhanden in `icons/icon128.png`

## Schritt-für-Schritt Upload

### 1. Chrome Developer Console
- Besuche: https://chrome.google.com/webstore/devconsole
- Melde dich mit deinem Google-Account an
- Akzeptiere die Developer Agreement

### 2. Neue Extension hinzufügen
- Klick auf "NEW ITEM"
- Akzeptiere die CWS Developer Agreement
- Eine neue Extension wird erstellt

### 3. ZIP-Datei hochladen
- **Package**: Lade `NINA-addon.zip` hoch
- Warte, bis die Datei hochgeladen ist (kann 1-2 Minuten dauern)

### 4. Addon-Informationen ausfüllen

#### Name und Beschreibung
- **Name**: NINA - Video Control & New Tab
- **Kurzbeschreibung** (< 132 Zeichen):
  ```
  Advanced video controls with playback speed, auto-skip, and custom new tab dashboard
  ```
- **Ausführliche Beschreibung**:
  ```
  NINA enhances your streaming experience across 30+ platforms with:

  ⚡ VIDEO CONTROLS
  • Playback speed control (1-10x speed)
  • Auto-skip intros, recaps & ads
  • YouTube dislikes & SponsorBlock
  • Prime Video X-Ray hiding

  📑 NEW TAB DASHBOARD
  • Beautiful digital clock
  • Quick shortcuts to Google services
  • Custom bookmarks & links
  • Smart bookmark search
  • Customizable appearance

  🛠️ SETTINGS
  • Per-feature toggles
  • Multi-language support
  • Local storage (your data is yours!)

  SUPPORTED PLATFORMS: YouTube, Netflix, Prime Video, Disney+, Crunchyroll, Joyn, Twitch, DAZN, and 20+ more!
  ```

#### Kategorie
- **Category**: Productivity

#### Sprachen
- **Sprachen**: English, Deutsch, Español, Français

#### Inhaltsrating
- Beantworte die Fragen für das IARC-Rating
- Wähle: Niedriges Risiko für alle Kategorien

### 5. Bilder hochladen

#### Icon
- **128x128px**: `icons/icon128.png` (bereits vorhanden)

#### Screenshots
- Mindestens 1 Screenshot erforderlich
- Empfohlen: 3-5 Screenshots
- Größe: 1280x800px

**Screenshot-Ideen:**
1. Neuer Tab mit Uhr und Shortcuts
2. Video-Player mit Geschwindigkeitsregler
3. Einstellungsseite mit Toggles
4. Customization-Optionen (Farben, Hintergrundbild)

#### Promotional Tile (optional)
- Größe: 440x280px
- Zeigt dein Addon attraktiv an

### 6. Rechtliche Informationen

#### Privacy Policy
- Kopiere den Inhalt aus `PRIVACY_POLICY.md`
- URL oder Text-Upload möglich
- **Wichtig**: Chrome Web Store verlangt explizite Privacy Policy!

#### Datenschutz & Berechtigungen
- Stelle sicher, dass die `PRIVACY_POLICY.md` erklärt, was die Berechtigungen tun

### 7. Kontakt & Support
- **Hersteller-E-Mail**: support@l8tenever.com
- **Support-Website**: Deine Webseite (optional)
- **Datenschutzrichtlinie**: Siehe oben

### 8. Berechtigungen erklären
Chrome wird automatisch erkennen, welche Berechtigungen dein Addon nutzt. Stelle sicher:
- ✅ `activeTab` - für Addon-Icon Anzeige
- ✅ `storage` - für Einstellungen speichern
- ✅ `scripting` - für Video-Kontrolle
- ✅ `bookmarks` - für Lesezeichen-Integration

### 9. Überprüfung durch Google
- **Wartezeit**: 1-3 Tage (meist 24 Stunden)
- Google überprüft automatisch auf:
  - Sicherheit & Malware
  - Richtlinien-Konformität
  - Manifest-Korrektheit
  - Berechtigungen

### 10. Veröffentlichung
- Nach Genehmigung wird dein Addon automatisch live!
- Du erhältst eine E-Mail mit der Web-Store-URL

## Chrome Web Store Link Format
Nach Veröffentlichung wird dein Addon unter dieser URL verfügbar:
```
https://chrome.google.com/webstore/detail/NINA-[ID]
```

## Tipps für schnelle Genehmigung

✅ **Gute Praktiken:**
- Klare, aussagekräftige Screenshots
- Detaillierte Beschreibung (was, nicht warum)
- Privacy Policy klar & vollständig
- Keine Bilder mit Werbung oder externen Links
- Test: Extension vor Upload lokal testen
- Manifest korrekt & vollständig

❌ **Vermeiden:**
- Falsche Versprechungen in der Beschreibung
- Zu viele External Calls ohne Erklärung
- Fehlende Privacy Policy
- Screenshots mit persönlichen Daten
- "Click here" Links in Beschreibung

## Updates nach Veröffentlichung

Um Updates zu veröffentlichen:
1. Erhöhe die `version` in `manifest.json`
2. Upload neue ZIP-Datei
3. Gib Update-Notes ein
4. Submit for review (meist < 24h genehmigt)

## Häufige Ablehnungsgründe & Lösungen

| Problem | Lösung |
|---------|--------|
| Fehlende Privacy Policy | Füge PRIVACY_POLICY.md bei |
| Manifest-Fehler | Validiere manifest.json auf Syntaxfehler |
| Zu aggressive Berechtigungen | Erkläre jede Berechtigung klar |
| Schlechte Screenshots | Screenshots müssen Hauptfunktion zeigen |
| Externe APIs ohne Erklärung | Erkläre SponsorBlock & YouTube Dislikes in Description |

## Support

Hast du Fragen?
- Lese die offizielle Dokumentation: https://developer.chrome.com/docs/webstore/
- Chrome Web Store Helpforum: https://support.google.com/chrome_webstore/
- Mein Support: support@l8tenever.com

---

**Viel Erfolg bei der Veröffentlichung! 🚀**
