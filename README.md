# dlp-gui

Tauri + React desktop app for `yt-dlp`, with a local Cobalt fallback engine
and Chrome and Firefox/Zen browser companions.

## Development

- `bun run dev`
- `bun run tauri dev`

## Local Cobalt fallback

Downloads use yt-dlp first, including the existing browser-cookie retries.
If those attempts fail, or yt-dlp cannot start, the app tries the bundled
[Cobalt API engine](https://github.com/imputnet/cobalt) locally. The existing
quality options stay the same: the selected resolution, audio-only mode, and
English subtitle preference are passed to Cobalt. No hosted instance or API
key is needed. Playlist discovery continues to use yt-dlp; fallback applies
to each queued video, including batch and browser-extension downloads.

For development on Windows x64, install Node.js 22 or 24 and run:

```powershell
./scripts/prepare-cobalt.ps1
```

This prepares engine dependencies without building the desktop UI. Cobalt
reuses the app's FFmpeg binary, or FFmpeg on PATH, and starts only when a
download needs fallback. Cancellation and quitting the app stop its process
tree. A failed or partial transfer is not published as a completed file, and
existing files are not overwritten.

The local engine takes about 31 MiB with dependencies. The release workflow
uses `./scripts/prepare-cobalt.ps1 -BundleNode` to include Node and its license
for a self-contained installer (roughly another 87 MiB unpacked). See
[the pinned source and adaptations](src-tauri/cobalt/UPSTREAM.md).

Backend-only checks, with no desktop build or UI startup:

```powershell
node --test src-tauri/cobalt/api/desktop-client.test.mjs
node --no-node-snapshot scripts/test-cobalt-engine.mjs
```

The engine smoke checks use locally generated media and FFmpeg, so they do
not depend on external video sites. Live downloads and the app UI still
need manual verification. Local Cobalt uses the machine's own network
connection, so websites can still reject a download.

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
