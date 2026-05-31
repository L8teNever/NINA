# Privacy Policy - NINA Extension

**Last Updated: May 2026**

## Overview

NINA is committed to protecting your privacy. This privacy policy explains how the extension handles your data.

## Data Collection

NINA does **NOT** collect, store, or transmit any personal data to external servers. All user data remains on your device.

## Local Storage

The extension stores the following data locally on your device (never sent to external servers):
- **Settings preferences** (playback speed, toggle states, language)
- **Custom bookmarks and shortcuts**
- **New tab customization** (background color, overlay preferences)
- **Chrome bookmarks filters** (if enabled)

## External APIs

NINA integrates with the following external services (optional):

1. **Return YouTube Dislike API** (returnyoutubedislikeapi.com)
   - Fetches dislike counts for YouTube videos
   - Only data sent: video ID
   - Used only when feature is enabled

2. **SponsorBlock API** (sponsor.ajay.app)
   - Fetches crowdsourced sponsor segment data
   - Only data sent: video ID
   - Used only when feature is enabled

3. **Chrome Bookmarks API**
   - Reads your local browser bookmarks
   - Data never leaves your device

## Permissions Explanation

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Show extension icon in current tab |
| `storage` | Save user settings and bookmarks |
| `scripting` | Inject video control features on streaming sites |
| `tabs` | Monitor tab activity for feature compatibility |
| `sidePanel` | Display side panel on supported pages |
| `bookmarks` | Read your local Chrome bookmarks (optional feature) |

## Host Permissions

The extension requests host permissions for supported streaming platforms to:
- Detect and modify video player controls
- Apply user-configured settings
- Enable auto-skip and playback features

**Your data is never sent to these platforms beyond normal browser traffic.**

## Data Security

- ✅ All settings stored locally (not on cloud)
- ✅ No account required
- ✅ No login credentials stored
- ✅ No tracking or analytics
- ✅ No third-party ads or profiling

## Changes to This Policy

We may update this policy occasionally. Changes will be posted here with the last updated date.

## Contact

For privacy concerns or questions: support@l8tenever.com

## User Control

You have full control:
- Access all your data through the settings page
- Delete all settings by clicking "Reset all settings"
- Uninstall the extension anytime
- Disable any feature individually

---

By using NINA, you agree to this privacy policy.
