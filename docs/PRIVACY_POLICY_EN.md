# 🔒 Privacy Policy – NINA

**Responsible Party:** Simon  
**Email:** support-chrome@l8tenever.com  
**Effective Date:** June 2026

---

## 📋 Overview

NINA is a Chrome extension that enhances and optimizes streaming platforms. This privacy policy explains what data NINA collects, how it is processed, and which permissions are necessary.

**Important:** NINA processes **all data locally in your browser**. No data is transmitted to external servers (except for optional Google Drive synchronization, which only occurs with explicit consent).

---

## 🎯 What Does NINA Do?

NINA provides the following features on video streaming platforms and webpages:

- **Video Speed Control** – Adjusts playback speed
- **Audio Enhancements** – Improves audio quality and settings
- **YouTube Dislikes Display** – Shows historical dislike counts
- **Notes Feature** – Allows creating notes on videos (optionally with Google Drive sync)
- **Overlay Search** – Provides quick search function on websites
- **AI Text Improvement** – Enhances selected text directly in input fields and notes (optionally via Gemini API)
- **Platform-Specific Improvements** – Optimizes features on supported streaming sites

---

## 💾 Local Data Collection

All data that NINA collects is stored **exclusively locally** in your browser:

### Stored Data (Chrome Local & Sync Storage)

- **User Settings:** Your video speed, audio settings, text improvement preferences, and interface preferences
- **Gemini API Key:** The API key specified for AI text improvement (synchronized securely across your devices using `chrome.storage.sync`)
- **Notes:** Locally created notes on videos (only transferred when explicitly syncing to Google Drive)
- **Bookmarks & Favorites:** Locally saved video favorites
- **Cache Data:** Technical cache information to optimize the extension

### Data Processing

- All settings are managed through `chrome.storage.local`
- Data **does not leave** your browser without explicit action
- Data is **immediately deleted** when you uninstall NINA

---

## 🔐 Permissions & Their Usage

NINA requires the following permissions to function properly:

| Permission | Reason | Data Usage |
|---|---|---|
| **`storage`** | Stores your settings locally | All user settings, notes, and preferences are stored in `chrome.storage.local` |
| **`activeTab`** | Detects the active website | Only necessary to recognize which video you're currently watching (not logged) |
| **`tabs`** | Access to tab information | Manages tab metadata locally; no data is transmitted |
| **`scripting`** | Modifies video players | Injects scripts into streaming sites to adjust speed and audio |
| **`sidePanel`** | Opens the sidebar | Displays the NINA sidebar with settings and notes |
| **`bookmarks`** | Access to bookmarks | Allows saving video bookmarks (locally, not synced) |
| **`identity`** | Google authentication | **Only** for optional Google Drive synchronization (with explicit consent) |
| **`favicon`** | Website icons | Loads favicons locally to enhance the UI |

---

## 🌐 External API Connections

NINA only connects to the following external APIs, and **only when the feature is explicitly used**:

### Google Drive (Optional)

- **Purpose:** Sync notes with Google Drive
- **Activation:** Only when you explicitly enable Google Drive integration
- **Data:** Notes that you manually sync to Google Drive
- **Control:** You can disable this feature anytime

### Google Gemini API (Optional)

- **Purpose:** AI-powered correction of spelling, punctuation, and text formatting
- **Source:** `https://generativelanguage.googleapis.com/`
- **Activation:** Only when you add a custom API key in the settings and trigger text improvement via shortcut or button
- **Data:** Only the text selection you have highlighted and your API key for authorization
- **Control:** You decide when text is sent to the API. No data is transmitted without your API key or explicit action. Google processes API data in accordance with the Gemini API Terms (data is not used for model training by default).

### YouTube Dislikes API

- **Purpose:** Retrieve historical dislike counts
- **Source:** `https://returnyoutubedislikeapi.com/`
- **Data:** Only YouTube video IDs are transmitted (anonymized)
- **No Personal Data:** Your search history or user information is not sent

### Sponsor.ajay (Optional)

- **Purpose:** Detect sponsor segments in videos (optional)
- **Source:** `https://sponsor.ajay.app/`
- **Data:** Only video metadata; no personal information
- **Control:** This feature is optional and can be disabled

### Google APIs (Only for Google Drive Sync)

- **Purpose:** OAuth authentication for Google Drive
- **Sources:**
  - `https://www.googleapis.com/`
  - `https://oauth2.googleapis.com/`
  - `https://accounts.google.com/`
- **Data:** Only the access token is transmitted (encrypted)
- **Control:** You only grant access when you enable Google Drive sync

---

## 👤 Your Rights

### Data Access
You can view your stored data anytime:
- Chrome Settings → Data Management → `chrome://extensions/` → NINA → "Manage Storage"

### Data Deletion
**Your data is automatically deleted when you uninstall NINA:**
1. Open Chrome → `chrome://extensions/`
2. Find NINA
3. Click the trash bin icon
4. Confirm

Deletion occurs **immediately and permanently**.

### Google Drive Data
If you have used Google Drive Sync:
- This data is also stored in your Google Drive
- You can manually delete it via Google Drive
- NINA stores no access to it after uninstallation

---

## 🛡️ Security & Privacy

- **No Tracking:** NINA does not store usage data or browsing history
- **No Third-Party Advertising:** No analytics tools or tracking pixels
- **Local Processing:** 100% of data processing occurs locally
- **Open Source:** Source code is viewable on [GitHub](https://github.com/L8teNever/NINA)
- **Regular Updates:** Security updates are deployed continuously

---

## 📧 Contact & Questions

Do you have questions about this privacy policy or how NINA handles your data?

📧 **Write to us:** support-chrome@l8tenever.com

---

**Last Updated:** June 2026  
**Version:** 1.0
