# dlp-gui Firefox / Zen Companion

This extension sends YouTube videos to the local `dlp-gui` app over
`http://127.0.0.1:46321`. It is intended for Firefox and compatible
Firefox-based browsers such as Zen Browser.

## Load it locally

1. Start `dlp-gui` so its local browser bridge is online.
2. Open `about:debugging#/runtime/this-firefox` in Firefox or Zen.
3. Select **Load Temporary Add-on**.
4. Choose this file: `extension/firefox/manifest.json`.
5. Open a YouTube video. Use the injected download button or the extension's
   toolbar button. If the button is hidden, pin the extension from the browser's
   extensions menu.

When you edit the extension, return to `about:debugging` and select **Reload**.
Temporary add-ons are removed when the browser closes, so repeat these steps
after restarting it.

## Keep it installed after restart

Firefox Release and Firefox Beta require extensions to be signed. For a private,
persistent install, submit the extension to Mozilla Add-ons as an unlisted
extension, download the signed `.xpi`, and install it from
`about:addons` using **Install Add-on From File**.

Developer Edition, Nightly, ESR, and unbranded Firefox builds can also allow an
unsigned extension by setting `xpinstall.signatures.required` to `false` in
`about:config`. Whether a Firefox-based browser permits this depends on how that
browser is packaged.

## How it works

- The toolbar action sends the current tab to `dlp-gui`.
- YouTube watch pages get a download button and quality picker.
- The badge shows `ON` when the desktop app's local bridge is reachable and
  `OFF` when it is not.

## Requirements

- Firefox/Gecko 140 or newer (including a current Zen Browser release).
- The Tauri app must be running.
- The browser must allow the extension to access YouTube and the local bridge.

## Privacy

Firefox's manifest declares browsing activity, website content, and website
activity because the extension passes the selected URL, page title, and download
choice out of the browser extension. That data is sent only to the `dlp-gui`
desktop app on `127.0.0.1`; the extension does not contact a remote analytics or
collection service.
