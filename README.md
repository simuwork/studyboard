# Studyboard

A companion Chrome extension that focuses on listing every published file for your active Canvas courses while adding AI-powered study helpers. It complements the Canvas Focus assignment tracker by giving a dedicated side panel for quick file access.

## Features

- **Course-wide file inventory** - Pulls every published file for each active course
- **Collapsible course groups** - Expand a course to scan its files without leaving Canvas
- **Useful context** - Shows last updated date, file size, and the uploader when available
- **One-click refresh** - Re-syncs in place without closing the panel

## Project Structure

```
studyboard/
├── manifest.json           # Chrome extension definition
├── background.js           # Bridges panel and Canvas tab
├── content.js              # Runs in Canvas, fetches courses and files
├── sidepanel.html          # Side panel markup
├── README.md               # Project overview
├── icons/                  # Extension icons
├── styles/
│   └── main.css            # Styling for the side panel UI
└── scripts/
    ├── api-service.js      # Messaging helpers
    ├── files-dashboard.js  # Core workflow
    ├── ui-renderer.js      # DOM rendering helpers
    └── main.js             # Entry point
```

## Getting Started

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `canvas-files` folder
4. Visit any Canvas page and open the Studyboard side panel from the toolbar icon

## Notes

- The extension keeps requests sequential to avoid Canvas API rate limits.
- Results are limited to the most recent ~300 files per course to stay lightweight.
- If a course fails to load, the panel will show an inline message while other courses remain accessible.
