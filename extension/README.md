# Fine Print Fortune - Chrome Extension

A Chrome Extension that provides tarot readings for Terms of Service and Privacy Policy pages.

## Features

- **Auto-detection**: Automatically detects when you're on a ToS or Privacy Policy page
- **Sidebar UI**: Opens a clean sidebar interface for your tarot reading
- **Three-card Spread**: Analyzes Collection, Sharing, and Retention aspects of the policy
- **Smart Analysis**: Uses keyword matching and friction detection to provide relevant card readings
- **Reversed Cards**: Cards appear upside-down when the policy contains vague or obstructive language
- **Receipt Citations**: Click "🧾 Receipt" under each card to see the exact sentences that triggered it
- **Reading History**: All readings are saved and can be viewed in the full history page

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `extension` folder from this project
5. The Fine Print Fortune extension should now appear in your extensions list

### Using the Extension

1. Navigate to any Terms of Service or Privacy Policy page (e.g., twitter.com/tos, google.com/privacy)
2. The extension will automatically detect the ToS page and show a badge (!) on the extension icon
3. The sidebar will automatically open with your tarot reading
4. If auto-detection doesn't work, click the extension icon and then click "Analyze Current Page"

## How It Works

1. **Content Script** (`content.js`) - Runs on all web pages to detect ToS/Privacy pages by:
   - URL patterns (e.g., `/terms`, `/privacy`, `/tos`)
   - Page title patterns
   - Heading content

2. **Background Worker** (`background.js`) - Handles:
   - ToS page detection events
   - Badge notifications
   - Automatic sidebar opening

3. **Side Panel** (`sidepanel.html` + `sidepanel.js`) - Displays:
   - Tarot card readings
   - Card meanings specific to privacy/ToS context
   - Reversal indicators for vague or shady language

4. **Tarot Engine** (`narrative_v2_implementation.js`) - Performs:
   - Keyword matching against card meanings
   - Friction detection for ambiguous language
   - Three-position spread (Collection, Sharing, Retention)

## Development

### File Structure

```
extension/
├── manifest.json              # Extension configuration
├── background.js             # Service worker
├── content.js                # Content script for page detection
├── sidepanel.html            # Sidebar UI
├── sidepanel.js              # Sidebar logic
├── narrative_v2_implementation.js  # Tarot engine
├── deck.json                 # Tarot deck data
├── icons/                    # Extension icons
├── major_arcana/             # Major arcana card images
└── minor_arcana/             # Minor arcana card images
```

### Testing

1. Make changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Fine Print Fortune extension
4. Test on a ToS page (or any page using the "Analyze Current Page" button)

## Privacy

This extension:
- Only reads page content when explicitly analyzing
- Does not send data to external servers
- Stores no personal information
- Runs entirely locally in your browser

## Credits

Built for Hackathon 9 - Midwest Baddies
