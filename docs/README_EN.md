# 🎬 NINA - Video Streaming Companion

**Made by Simon**

---

## 📱 Chrome Web Store

[➜ View NINA on Chrome Web Store](https://chromewebstore.google.com/detail/NINA/[EXTENSION_ID])

---

## 🎯 About NINA

NINA is your personal companion for video streaming platforms. With NINA, you can fully personalize and optimize your streaming experience – all locally in your browser, without any detours to external servers.

### ✨ Key Features

- ⚡ **Adjust Video Speed** – Set playback speed on 30+ streaming platforms
- 🔊 **Audio Enhancements** – Sound optimization and adjustments
- 👎 **Show YouTube Dislikes** – See how many dislikes videos have again
- 📝 **Notes with Google Drive Sync** – Create notes about videos and sync them with Google Drive
- 🔍 **Overlay Search** – Quick search function directly on any website
- 🎨 **Modern UI** – Intuitive sidebar and options

### 🎥 Supported Platforms

- YouTube & YouTube Shorts
- Netflix
- Disney+
- Amazon Prime Video
- Twitch
- Crunchyroll
- DAZN
- HBO Max / Max
- Paramount+
- Apple TV
- Hulu
- Vimeo
- Joyn
- ZDF Mediathek & ARD Mediathek
- RTL+ & TVNow
- And many more!

---

## 📥 Installation

### Method 1: Chrome Web Store (Recommended) ⭐

1. Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/NINA/[EXTENSION_ID])
2. Click **"Add to Chrome"**
3. Confirm the permissions with **"Add extension"**
4. Done! NINA is now active and ready to use

### Method 2: Manual Installation from Source Code

1. **Clone or download the repository:**
   ```bash
   git clone https://github.com/L8teNever/NINA.git
   cd NINA
   ```

2. **Open Chrome and navigate to the extensions page:**
   - Type `chrome://extensions/` in the address bar

3. **Enable Developer Mode:**
   - Toggle **"Developer mode"** in the top right

4. **Load the extension:**
   - Click **"Load unpacked"**
   - Navigate to the directory containing `manifest.json`
   - Confirm

5. **Done!** NINA will now appear in your extensions

---

## 🏗️ Project Structure

```
NINA/
├── manifest.json              # Chrome Extension Configuration
├── background.js              # Service Worker (Background Processes)
├── ui/
│   ├── redirect.html          # New Tab Page
│   ├── options.html           # Settings
│   ├── sidepanel.html         # Sidebar
│   ├── tailwind.min.css       # Styling
│   └── [more UI files]
├── content/
│   ├── speed-patch.js         # Video Speed Control
│   ├── audio-patch.js         # Audio Enhancements
│   ├── frame-speed.js         # Frame-based Speed Control
│   ├── universal.js           # Universal Platform Patches
│   ├── youtube-dislike.js     # YouTube Dislike API Integration
│   ├── joyn.js                # Joyn-specific Features
│   ├── overlay-search.js      # Search Function
│   ├── notes-overlay.js       # Notes Interface
│   └── [more content scripts]
├── lib/
│   ├── google-drive.js        # Google Drive API
│   └── [more libraries]
├── styles/
│   └── overlay.css            # UI Styling
├── icons/
│   ├── icon16.png, icon32.png, icon48.png, icon128.png
│   └── icon.png
├── docs/
│   ├── README.md              # German Documentation
│   ├── README_EN.md           # English Documentation
│   ├── PRIVACY_POLICY.md      # German Privacy Policy
│   └── PRIVACY_POLICY_EN.md   # English Privacy Policy
└── [more files]
```

### 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Tailwind CSS), JavaScript (ES6+)
- **Backend:** Chrome Extension Manifest V3, Service Workers
- **APIs:** Google Drive API, YouTube Dislikes API, Sponsor.ajay (Sponsor Block)
- **Browser APIs:** `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.sidePanel`, `chrome.bookmarks`, `chrome.identity`

---

## 💬 Support & Contact

Do you have questions or issues? Contact us:

📧 **Email:** support-chrome@l8tenever.com

---

## 📄 License

This project is licensed under the **MIT License**.  
See `LICENSE` for more information.

---

**Enjoy NINA! 🎉**
