@echo off
echo ==================================================
echo Erstelle NINA_Flow.zip aus dem Nina Flow Ordner...
echo ==================================================

if exist "NINA_Flow.zip" del "NINA_Flow.zip"
powershell -NoProfile -Command "Compress-Archive -Path '.\Nina Flow\*' -DestinationPath '.\NINA_Flow.zip' -Force"

echo.
echo NINA_Flow.zip wurde erfolgreich im Hauptverzeichnis erstellt!
pause
