# yt-dlp GUI

A cross-platform desktop application for downloading videos and audio using [yt-dlp](https://github.com/yt-dlp/yt-dlp), built with Tauri, React, and TypeScript.
                                              <img width="1366" height="768" alt="Screenshot_84" src="https://github.com/user-attachments/assets/fa36b47d-ca1c-4079-a4bd-e244bb2a92f8" />
                                              <img width="1366" height="768" alt="Screenshot_83" src="https://github.com/user-attachments/assets/29ca3d27-f0f8-41b5-a6dd-8c6044c6370c" />



## Features

### Downloading

- **Single video downloads** — Paste any video URL and start downloading immediately.
- **Playlist downloads** — Paste a playlist URL to automatically detect all videos and download them individually.
- **Batch downloads** — Import a `.txt` file containing multiple URLs (one per line) to queue and download them all at once.
- **Audio-only downloads** — Select "Audio Only" to extract and save the best available audio stream.

### Quality Selection

Choose from a range of quality presets for both single and batch/playlist downloads:

| Option | Resolution |
|--------|-----------|
| 4K | 2160p |
| 2K | 1440p |
| FHD | 1080p |
| HD | 720p |
| SD | 480p |
| — | 360p |
| — | 240p |
| Audio Only | Best audio |

### Subtitle Support

- Optionally embed subtitles alongside any video quality selection.
- Subtitle embedding is available for both single and playlist downloads.

### Scheduled Downloads

- Schedule any download (single, batch, or playlist) to start at a specific date and time.
- Scheduled downloads are shown pinned at the top of the downloads list and start automatically when their scheduled time arrives.

### Download Management

- **Real-time progress** — Live progress bar showing percentage, download speed, file size, and estimated time remaining (ETA).
- **Multi-phase progress bar** — Visual breakdown of the video download phase, audio download phase, and merging/processing phase.
- **Per-download logs** — Expand any download to see raw yt-dlp output logs.
- **Cancel downloads** — Cancel any in-progress or pending download at any time.
- **Pagination** — Active downloads and history are paginated (5 items per page) for easy browsing.

### Download History

- Completed, failed, and cancelled downloads are automatically moved to a persistent history list (keeps up to 100 entries).
- Re-open the containing folder directly from a history entry.
- Remove individual history entries or clear the entire history.

### Settings

- **Save path** — Choose a custom directory for all downloads; defaults to your system's Downloads folder.
- **aria2c accelerator** — Enable or disable [aria2c](https://aria2.github.io/) as an external downloader for potentially faster downloads.
- **yt-dlp updates** — Check for the latest yt-dlp version, update with one click, or enable automatic updates on app startup.

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Backend:** Rust via [Tauri v2](https://tauri.app/)
- **Downloader:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) (bundled binary)
- **Media processing:** [ffmpeg](https://ffmpeg.org/) (bundled binary)

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) and [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/)

### Recommended IDE

[VS Code](https://code.visualstudio.com/) + [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### Running in Development

```bash
bun install
bun run tauri dev
```

### Building

```bash
bun run tauri build
```
