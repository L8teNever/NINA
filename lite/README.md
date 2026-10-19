# NINA Lite

Abgespeckte NINA-Version mit nur drei Dingen:

- **Meine Serien** – Serien-Tracking und Bibliothek (Crunchyroll, Netflix, Prime Video, Disney+, Joyn, AniList-Anbindung); Anmeldung mit dem Google-Konto sichert das Tracking in Google Drive
- **Mehr Geschwindigkeit** – Popup am Toolbar-Symbol (bis 4x, auf jeder Webseite) und Geschwindigkeitsmenüs in den Playern
- **Auto-Skip** – Intros, Recaps und Werbung werden übersprungen

Kein neuer Tab, keine Notizen, kein Drive-Sync, keine Tastenkürzel-Overlays, kein YouTube-Dislike, keine KI-Textverbesserung.

## Bauen

```
node lite/build.js
```

Erzeugt `dist/NINA-Lite/` (zum Laden als entpackte Erweiterung) und `NINA-Lite-<Version>.zip`.
Die Version steht in `lite/build.js` (`LITE_VERSION`), unabhängig von der Haupt-Erweiterung. Das Manifest wird aus der des Hauptprojekts abgeleitet
(gleiche Seiten, gleiche Skripte – nur ohne die entfernten). Eigen sind nur `lite/background.js` (gekürzte Kopie des
Service Workers) und `lite/ui/` (Einstellungsseite). Ändert sich die Geschwindigkeits-Logik in `background.js`, bitte
`lite/background.js` nachziehen.

Lite verwendet denselben `key` (= dieselbe Erweiterungs-ID) und denselben Google-OAuth-Client wie NINA. Dadurch funktioniert die
Google-Anmeldung (Sync des Seiten-Trackings über Google Drive) ohne eigenen Client – Lite und NINA lassen sich aber nicht
gleichzeitig installieren.

## Handy (Lemur, Kiwi, …)

Chrome für Android lädt keine Erweiterungen, Chromium-Browser wie Lemur oder Kiwi schon – dort die Zip entpacken und
den Ordner als entpackte Erweiterung laden. Dafür ist Lite angepasst:

- Einstellungen: auf schmalen Bildschirmen wird die Seitenleiste zu einer Tab-Leiste oben, Zeilen mit Auswahlfeldern brechen um
- Popup: skaliert auf die Bildschirmbreite, größere Schieberegler und Tasten
- Meine Serien: war bereits responsiv (Navigationsleiste unten)
- Akku: `build.js` entschärft beim Bauen die Seitenskripte (`patchOut`) – Seiten-Scan nur gedrosselt statt bei jeder DOM-Änderung,
  langsameres Polling und nichts, solange der Tab im Hintergrund ist. Passt ein Patch nicht mehr, bricht der Build ab.

Die Google-Anmeldung nutzt `chrome.identity.getAuthToken`; ob ein Chromium-Fork ohne Google-Dienste das unterstützt, hängt vom Browser ab.
