# Coin Web Viewer

This is a simple static website that displays coins exported from the iOS app as a single JSON file (`coins.json`).

## How To Use

1. In the iOS app: `Stats` → `Export` → `Export For Website (coins.json + thumbnails)`.
2. Copy the exported `coins.json` into `NastyTangent.github/` (same folder as `NastyTangent.github/index.html`).
3. Commit + push to GitHub Pages.

The site will auto-load `./coins.json` on startup (so your GitHub Pages site stays up-to-date).

The site stores the imported data in your browser's local storage so it persists on refresh.

## Coin Photos (Embedded Thumbnails)

This site expects your exported `coins.json` to include embedded *thumbnail* images:

- `obverseImageData` and `reverseImageData` are base64-encoded JPEG thumbnails.
- The site uses those thumbnails for the list and for the tap-to-view viewer.

## Live Silver Spot

The site reads `spot.json` for a live-ish silver spot price (so you don’t have to type it manually).

To enable auto-updates:

1. In your GitHub repo settings: add an Actions secret named `SILVER_API_KEY` with your GoldAPI key (XAG/USD).
2. Merge the workflow file (`.github/workflows/update_silver_spot.yml`) into your default branch (usually `main`).

GitHub Actions will update `NastyTangent.github/spot.json` hourly (and append to `NastyTangent.github/spot_history.json` for the chart).

## Notes

If a thumbnail is missing for a coin, the UI will show `—` (no BU fallback).

## Files

- `index.html` – UI
- `styles.css` – styling
- `app.js` – import, filtering, rendering
