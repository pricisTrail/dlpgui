# dlp-gui

Tauri + React desktop app for `yt-dlp`, with a local Chrome companion bridge.

## Development

- `bun run dev`
- `bun run tauri dev`

## Chrome Companion

The app now exposes a local bridge on `http://127.0.0.1:46321` for the unpacked extension in [`extension/chrome`](extension/chrome/README.md).

Load that folder in `chrome://extensions` to get:

- a toolbar action that sends the current tab to the app
- a watch-page quick action on YouTube
- small `dlp` buttons injected next to YouTube card menus
