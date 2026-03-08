# Coin Web Viewer

This is a simple static website that displays coins exported from the iOS app as a single JSON file (`coins.json`).

## How To Use

1. In the iOS app: `Stats` → `Export` → `Export For Website (coins.json)`.
2. Copy the exported `coins.json` into this website folder (same folder as `index.html`).
3. Commit + push to GitHub Pages.

The site will auto-load `./coins.json` on startup (so your GitHub Pages site stays up-to-date).

The site stores the imported data in your browser's local storage so it persists on refresh.

## Real Coin Photos (Thumbnails)

This site expects real coin photos to exist in this folder:

- `coin-web/coin-images/<coinId>/obverse_thumb.jpg`
- `coin-web/coin-images/<coinId>/reverse_thumb.jpg`
- `coin-web/coin-images/<coinId>/obverse_full.jpg`
- `coin-web/coin-images/<coinId>/reverse_full.jpg`

The JSON (`coin-web/coins.json`) stays small (no embedded images). Photos live as separate files.

## Live Silver Spot

The site reads `coin-web/spot.json` for a live-ish silver spot price (so you don’t have to type it manually).

To enable auto-updates:

1. In your GitHub repo settings: add an Actions secret named `SILVER_API_KEY` with your GoldAPI key (XAG/USD).
2. Merge the workflow file (`.github/workflows/update_silver_spot.yml`) into your default branch (usually `main`).

GitHub Actions will update `coin-web/spot.json` hourly.

## Notes

If a photo is missing for a coin, the UI will show `—` (no BU fallback).

## Files

- `index.html` – UI
- `styles.css` – styling
- `app.js` – import, filtering, rendering
