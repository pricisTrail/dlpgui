# dlp-gui

Tauri + React desktop app for `yt-dlp`, with local Chrome and Firefox/Zen
browser companions.

## Development

- `bun run dev`
- `bun run tauri dev`

## Chrome Companion

The app now exposes a local bridge on `http://127.0.0.1:46321` for the unpacked extension in [`extension/chrome`](extension/chrome/README.md).

Load that folder in `chrome://extensions` to get:

- a toolbar action that sends the current tab to the app
- a watch-page quick action on YouTube
- small `dlp` buttons injected next to YouTube card menus

## Firefox / Zen Companion

The Firefox-compatible extension is in
[`extension/firefox`](extension/firefox/README.md). Load its `manifest.json`
from `about:debugging#/runtime/this-firefox` for local testing.
