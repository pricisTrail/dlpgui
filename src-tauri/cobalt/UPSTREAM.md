# Local Cobalt engine

This directory vendors only the API engine and version-info package from
[imputnet/cobalt](https://github.com/imputnet/cobalt), version **11.7.1**,
commit **a636575b09de1fc55d9b8cd98cac88f5f2f16b42**. The upstream website is
not included. The original engine source is about 340 KiB.

The engine's AGPL-3.0 license is preserved in [api/LICENSE](api/LICENSE).
The complete source at this pinned revision is available at
<https://github.com/imputnet/cobalt/tree/a636575b09de1fc55d9b8cd98cac88f5f2f16b42>.

Desktop adaptations made on 2026-11-16:

- Added `api/desktop-runner.mjs` and `api/desktop-client.mjs` for one download
  process at a time, with streamed output, safe filenames, collision handling,
  idle timeouts, and the existing app's progress protocol.
- Reused the app's FFmpeg, removing the duplicate `ffmpeg-static` dependency.
- Made the API return its loopback listener and wait for its internal tunnel.
- Propagated failed FFmpeg output as an interrupted HTTP response so incomplete
  files cannot be reported as successfully downloaded.
- Replaced Git checkout discovery in `packages/version-info/index.js` with the
  pinned revision metadata so the engine also works inside an installer.
- Changed the workspace dependency to a copied local package, pinned
  `isolated-vm` to 6.0.2, and recorded dependencies in `api/package-lock.json`.

`scripts/prepare-cobalt.ps1` at the project root installs production dependencies
without lifecycle scripts or compilation and downloads the checksum-verified
native prebuilt for Node.js 22 or 24 on Windows x64. It reuses installed Node by
default. `-BundleNode` also copies that runtime and its license for installers.
Dependency directories and runtime binaries are excluded from Git; Tauri bundles
the prepared `cobalt/` resource directory when packaging the app.

The desktop runner binds both API listeners to `127.0.0.1` on ephemeral ports.
Its API uses a random per-process credential, rejects browser-origin requests,
and is only alive while that fallback download runs. It does not use the public
`api.cobalt.tools` service or require a hosted API key. It does not import browser
cookies. Source websites can still restrict requests from the machine's IP.

Measured on Windows x64 with Node.js 24.14.0: about **31 MiB** for the source and
production dependencies, plus about **87 MiB** if Node itself is bundled. These
are unpacked disk sizes; installer compression has not been measured.
