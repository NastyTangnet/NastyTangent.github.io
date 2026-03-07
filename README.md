# Coin Web Viewer

This is a simple static website that displays coins exported from the iOS app as a single JSON file (including images).

## How To Use

1. In the iOS app: `Stats` → `Export` → `Export Coins (JSON + Images)`.
2. On the website: click `Import JSON` and select the exported file (e.g. `CoinExport-2026-03-07.json`).

The site stores the imported data in your browser's local storage so it persists on refresh.

## Files

- `index.html` – UI
- `styles.css` – styling
- `app.js` – import, filtering, rendering

