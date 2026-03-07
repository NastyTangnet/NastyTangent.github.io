# Coin Web Viewer

This is a simple static website that displays coins exported from the iOS app as a single JSON file (`coins.json`).

## How To Use

1. In the iOS app: `Stats` → `Export` → `Export For Website (coins.json)`.
2. Copy the exported `coins.json` into this website folder (same folder as `index.html`).
3. Commit + push to GitHub Pages.

The site will auto-load `./coins.json` on startup (so your GitHub Pages site stays up-to-date).

The site stores the imported data in your browser's local storage so it persists on refresh.

## Files

- `index.html` – UI
- `styles.css` – styling
- `app.js` – import, filtering, rendering
