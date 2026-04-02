# dlp-gui Chrome Companion

This extension sends YouTube videos to the local `dlp-gui` app over `http://127.0.0.1:46321`.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `extension/chrome`.

## How it works

- The browser action sends the current tab to `dlp-gui`.
- YouTube watch pages get a `Download in dlp-gui` button.
- YouTube cards get a small `dlp` quick action near the existing menu area.

## Requirements

- The Tauri app must be running.
- In the app header or settings, the Chrome bridge should show as online.
