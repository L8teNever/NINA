# 🎬 NINA – Chrome Extension for Streaming

**[📥 Install from Chrome Web Store](https://chromewebstore.google.com/detail/nina/hodpbndnggncjcpilnjggfjcmnkjmmjp?hl=de&utm_source=ext_sidebar)**

---

## 📖 About NINA

NINA is a powerful Chrome extension designed to enhance your streaming experience across all major video platforms. Whether you're watching YouTube, Netflix, Amazon Prime, or any of our supported streaming services, NINA provides essential tools to control playback, improve content discovery, and take notes seamlessly.

---

## ✨ Features

- 🎚️ **Advanced Playback Control** – Adjust video speed on any streaming platform
- 🔊 **Audio Enhancement** – Optimize audio settings for better sound quality
- 👎 **YouTube Dislikes** – See community ratings on YouTube videos (via Return YouTube Dislike API)
- 📝 **Smart Notes** – Take annotated notes directly on web pages with Google Drive integration
- 🔍 **Overlay Search** – Quick search overlay functionality on any website
- 🎨 **New Tab Page** – Custom new tab redirect
- ⚙️ **Advanced Settings** – Comprehensive configuration panel
- 🎯 **Multi-Platform Support** – Works on 25+ streaming services including:
  - YouTube, Netflix, Amazon Prime Video, Disney+
  - Twitch, Crunchyroll, DAZN
  - Joyn, ZDF Mediathek, ARD Mediathek, RTL+
  - Apple TV+, Max (HBO), Hulu, Paramount+
  - And many more...

---

## 📥 Installation

### Option 1: Chrome Web Store (Recommended) ✅

1. Click the link above: **[Install from Chrome Web Store](https://chromewebstore.google.com/detail/nina/hodpbndnggncjcpilnjggfjcmnkjmmjp?hl=de&utm_source=ext_sidebar)**
2. Click the **"Add to Chrome"** button
3. Confirm the permissions dialog
4. Done! NINA is ready to use

### Option 2: Manual Installation from Source (For Developers)

If you want to install NINA directly from the GitHub source code:

#### Step 1: Download the Source Code

Choose one of the following methods:

**Via Git:**
```bash
git clone https://github.com/L8teNever/NINA.git
cd NINA
```

**Via ZIP Download:**
- Go to https://github.com/L8teNever/NINA
- Click **Code** → **Download ZIP**
- Extract the ZIP file to a folder on your computer

#### Step 2: Load the Extension into Chrome

1. Open Google Chrome
2. Navigate to **`chrome://extensions/`** (copy & paste into the address bar)
3. Toggle the **Developer Mode** switch in the top-right corner
4. Click **"Load unpacked"** button (top-left)
5. Select the `NINA` folder (the one containing `manifest.json`)
6. The extension will now appear in your extensions list and be ready to use

#### Step 3: Verify Installation

- Look for the NINA icon in your Chrome toolbar
- Click the icon to see available options
- Visit one of the supported streaming sites to test features

---

## 📁 Project Structure

```
NINA/
├── manifest.json              # Extension configuration and permissions
├── background.js              # Service worker (background tasks)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── ui/                        # User Interface
│   ├── options.html           # Settings page
│   ├── sidepanel.html         # Side panel interface
│   ├── redirect.html          # Custom new tab page
│   └── tailwind.min.css       # Tailwind CSS framework
├── content/                   # Content scripts for streaming sites
│   ├── speed-patch.js         # Playback speed control
│   ├── audio-patch.js         # Audio enhancement
│   ├── frame-speed.js         # Frame-level speed adjustment
│   ├── universal.js           # Universal streaming features
│   ├── youtube-dislike.js     # YouTube dislike counter
│   ├── joyn.js                # Joyn-specific adaptations
│   ├── overlay-search.js      # Search overlay functionality
│   └── notes-overlay.js       # Notes feature overlay
├── styles/
│   └── overlay.css            # Styling for overlays
├── lib/
│   └── google-drive.js        # Google Drive integration
├── docs/                      # Documentation (this folder)
│   ├── README.md              # This file
│   └── PRIVACY_POLICY.md      # Privacy & data handling information
└── _locales/                  # Internationalization files
    └── en/messages.json       # English translations
```

---

## 🛠️ Technology Stack

- **JavaScript (ES6+)** – Core extension logic
- **HTML5** – User interface markup
- **CSS3 & Tailwind CSS** – Styling and responsive design
- **Chrome Extensions API (Manifest V3)** – Extension framework
- **Google Drive API** – Cloud notes storage
- **Return YouTube Dislike API** – Community ratings data
- **Local Storage (`chrome.storage.local`)** – User preferences & settings

---

## ⚙️ Configuration & Permissions

NINA requires the following permissions to function:

| Permission | Purpose |
|-----------|----------|
| `activeTab` | Access the currently active browser tab |
| `storage` | Store user settings and preferences locally |
| `scripting` | Inject content scripts into web pages |
| `tabs` | Manage and monitor browser tabs |
| `sidePanel` | Display the side panel interface |
| `bookmarks` | Access and manage bookmarks |
| `identity` | Handle Google authentication for Drive |
| `favicon` | Retrieve website favicons |

For detailed information about data handling and privacy, see [PRIVACY_POLICY.md](./PRIVACY_POLICY.md).

---

## 📋 Supported Streaming Platforms

NINA works seamlessly with:

- 🎥 **YouTube** & **YouTube Music**
- 🍿 **Netflix**, **Amazon Prime Video**, **Disney+**
- 📺 **Twitch**, **Crunchyroll**, **Funimation**, **Wakanim**
- 🎬 **DAZN**, **Max (HBO)**, **Hulu**, **Paramount+**
- 📡 **German Public Broadcasting**: Joyn, ZDF, ARD, RTL+, 3sat, arte.tv
- 🎨 **And 10+ additional platforms...**

---

## 🔄 Updates & Support

- **Latest Version:** 3.2.1
- **GitHub Repository:** https://github.com/L8teNever/NINA
- **Report Issues:** https://github.com/L8teNever/NINA/issues
- **Feature Requests:** https://github.com/L8teNever/NINA/discussions

---

## 📜 License

This project is released under the **[MIT License](../LICENSE)**. Feel free to use, modify, and distribute NINA according to the license terms.

---

## 🤝 Contributing

We welcome contributions! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add YourFeature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

---

## ⚖️ Disclaimer

NINA is provided "as-is" without warranty. The developer is not responsible for any issues or damages caused by the extension. Always review the [Privacy Policy](./PRIVACY_POLICY.md) before use.

---

**Made with ❤️ by Simon & NINA Team**