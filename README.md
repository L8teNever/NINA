# NINA & NINA Flow - Chrome Addons & Web Portal

Dieses Repository enthält den Quellcode für zwei mächtige Chrome-Erweiterungen sowie das dazugehörige Web-Portal, welches als Präsentations- und Download-Plattform dient.

## 🚀 Die Erweiterungen

### 1. [NINA](./NINA)
Eine All-in-One-Mediensteuerung für deinen Browser. Bietet stufenlose Geschwindigkeitssteuerung, Audio-Boost, Auto-Skip für Intros und Werbung, SponsorBlock-Integration und vieles mehr auf Plattformen wie YouTube, Netflix und Disney+.

### 2. [NINA Flow](./Nina%20Flow)
Ein wunderschönes New-Tab-Override im Android 16 (Material Design 3) Stil. Beinhaltet ein interaktives Live-Wetter-Widget, eine flüssig animierte Uhr, eine KI-Suchleiste (Gemini) und personalisierbare Schnellzugriffe.

## 💻 Das Web-Portal (Docker)

Das Web-Portal ist eine mit **FastAPI** und **Tailwind CSS** gebaute Plattform, die über Docker bereitgestellt wird. Es unterstützt 11 Sprachen mit automatischer Spracherkennung.

### Hosting via Docker Compose

Das Projekt wird automatisch über GitHub Actions gebaut und als Docker-Image in der GitHub Container Registry (`ghcr.io`) zur Verfügung gestellt.

Um das Projekt lokal oder auf einem Server zu starten, nutze die `docker-compose.yml`:
```yaml
version: '3.8'
services:
  web:
    image: ghcr.io/L8teNever/nina:latest
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
```
Anschließend einfach ausführen:
```bash
docker-compose up -d
```
Der Server läuft dann standardmäßig auf Port `8000`.
