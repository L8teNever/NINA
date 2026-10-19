# NINA Lite

Abgespeckte NINA-Version mit nur drei Dingen:

- **Meine Serien** – Serien-Tracking und Bibliothek (Crunchyroll, Netflix, Prime Video, Disney+, Joyn, AniList-Anbindung)
- **Mehr Geschwindigkeit** – Popup am Toolbar-Symbol (bis 4x, auf jeder Webseite) und Geschwindigkeitsmenüs in den Playern
- **Auto-Skip** – Intros, Recaps und Werbung werden übersprungen

Kein neuer Tab, keine Notizen, kein Drive-Sync, keine Tastenkürzel-Overlays, kein YouTube-Dislike, keine KI-Textverbesserung.

## Bauen

```
node lite/build.js
```

Erzeugt `dist/NINA-Lite/` (zum Laden als entpackte Erweiterung) und `NINA-Lite-<Version>.zip`.
Die Version kommt aus der `manifest.json` der Haupt-Erweiterung. Das Manifest wird aus der des Hauptprojekts abgeleitet
(gleiche Seiten, gleiche Skripte – nur ohne die entfernten). Eigen sind nur `lite/background.js` (gekürzte Kopie des
Service Workers) und `lite/ui/` (Einstellungsseite). Ändert sich die Geschwindigkeits-Logik in `background.js`, bitte
`lite/background.js` nachziehen.

Lite hat keinen festen `key` und damit eine eigene Erweiterungs-ID. Es kann neben NINA installiert sein, sollte aber
nicht gleichzeitig mit NINA auf denselben Seiten laufen.
