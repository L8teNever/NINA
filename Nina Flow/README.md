# NINA Flow - Chrome Extension

NINA Flow ist eine leistungsstarke und visuell beeindruckende Chrome-Erweiterung, die deine Standard-"Neuer Tab"-Seite durch einen personalisierten, interaktiven Desktop im modernen **Android 16 / Material Design 3**-Stil ersetzt.

## 🌟 Hauptfunktionen (basierend auf dem Code)

Die Erweiterung besteht primär aus einer umfangreichen `index.html`, die alle Funktionen lokal oder über API-Aufrufe bereitstellt:

### 1. New Tab Override
Durch den Eintrag `"chrome_url_overrides": { "newtab": "index.html" }` in der `manifest.json` wird bei jedem neuen Tab automatisch das NINA Flow Dashboard geladen.

### 2. Dynamische Widgets im Bento-Grid
- **Interaktive Uhr:** Eine animierte, einzeilige Uhr (Roboto Flex) mit flüssigen Übergängen beim Ziffernwechsel.
- **Datum & Feiertage:** Zeigt das aktuelle Datum an. Ein Klick öffnet ein dediziertes Modal ("Holidays App"), das die kommenden Feiertage auflistet.
- **Live-Wetter Widget:**
  - Zeigt die aktuelle Temperatur und das Wetterbild an.
  - Ein Klick öffnet detaillierte Wetterinformationen in einem Modal (gefühlt, Windgeschwindigkeit, Luftfeuchtigkeit) sowie eine **5-Tage-Prognose**.
  - Der Hintergrund des Widgets passt sich automatisch dem Wetter an (z. B. sonnig, wolkig, regnerisch).

### 3. Smarte Suchleiste & KI-Integration
- **Google-Suche:** Eine zentrale Suchleiste für schnelle Websuchen oder direkte Wetterabfragen.
- **Gemini KI Spark:** Ein integrierter "Auto Awesome"-Button in der Suchleiste, der direkte Suchanfragen oder Text-Inputs an Google Gemini weiterleitet.

### 4. Personalisierbare Schnellzugriffe (Wegweiser)
- Ein anpassbares Raster für wichtige Links (standardmäßig Schul-Links wie Moodle, Untis, Outlook, Google Drive).
- Diese Verknüpfungen (Name, Icon, URL) können vom Nutzer live in den Einstellungen bearbeitet werden.

### 5. Google-Dienste Launcher & Account
- **App-Launcher (3x3 Grid):** Ein Schnellmenü oben rechts bietet direkten Zugriff auf 9 wichtige Google-Dienste (Suche, YouTube, Maps, Gmail, Drive, Kalender, Play Store, Meet, Translate).
- **Konto-Verwaltung:** Ein aufrufbares Profil-Popup simuliert den Account-Wechsel und verlinkt direkt auf die Google-Kontoeinstellungen.

### 6. Systemeinstellungen & Personalisierung
Ein detailliertes Einstellungs-Modal erlaubt die Anpassung des Dashboards:
- Festlegen des **Standard-Standorts** für das Wetter.
- Umschalten der **Temperatureinheit** zwischen Celsius (°C) und Fahrenheit (°F).
- Ein- und Ausschalten des **Ambient Glows** (der dynamischen, mausgesteuerten Hintergrundbeleuchtung).
- Live-Editor zum Hinzufügen, Bearbeiten und Zurücksetzen der Schnellzugriffs-Links.

## 🛠 Technische Details
- **Styling:** Die Erweiterung nutzt **Tailwind CSS** für das Layout und verwendet spezielle Material Design 3 Farbpaletten.
- **Icons & Schriftarten:** Verwendet "Plus Jakarta Sans" sowie "Roboto Flex" und greift auf die "Material Symbols Outlined" Bibliothek zu.
- **Animationen:** Nutzt native CSS-Keyframes für Wettereffekte (drehende Sonne, schwebende Wolken, fallender Regen), Ladeeffekte (Materialize) und flüssige Modal-Übergänge.
