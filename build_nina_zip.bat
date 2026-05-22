@echo off
echo ========================================
echo Erstelle NINA.zip aus dem NINA Ordner...
echo ========================================

if exist "NINA.zip" del "NINA.zip"
powershell -NoProfile -Command "Compress-Archive -Path '.\NINA\*' -DestinationPath '.\NINA.zip' -Force"

echo.
echo NINA.zip wurde erfolgreich im Hauptverzeichnis erstellt!
pause
