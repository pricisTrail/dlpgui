<div align="center">

# 🎬 dlp-gui

**A lightweight, fast yt-dlp desktop client built with Rust + Tauri**

I couldn't find a beautiful GUI that saved me from writing commands and worked well for daily use — so I stopped searching and built my own.

<img width="1366" height="768" alt="dlp-gui screenshot main" src="https://github.com/user-attachments/assets/411374c1-f566-45c9-b0a1-07f7c8dc9458" />
<img width="1366" height="768" alt="dlp-gui screenshot downloads" src="https://github.com/user-attachments/assets/04b94c9f-4257-4368-9a42-754eb1427f87" />

</div>

---

## Why dlp-gui?

Most yt-dlp GUIs are either Electron memory hogs or clunky wrappers. dlp-gui is built **performance-first** — Rust backend via Tauri means native-level speed with a fraction of the RAM usage. The frontend is React + Tailwind CSS for a clean, modern interface that stays out of your way.

---

## ✨ Features

### 🎥 Download Videos & Audio
- Paste a URL, pick a quality, hit download — that simple.
- **Quality selector** from 240p up to 4K (2160p), plus **Audio Only** mode for music.
- **Subtitle support** — download embedded subtitles with any video quality.
- Real-time **progress bar**, speed, ETA, and file size displayed for every download.

### 📋 Playlist Support
- Automatically detects playlist URLs and fetches all video entries.
- Displays playlist title, channel, video count, and individual video details.
- Download entire playlists at your chosen quality with one click.

### 📄 Batch Downloads via TXT Import
- Import a `.txt` file with one URL per line to queue dozens of downloads instantly.
- Batch quality selector (240p–4K or Audio Only) with optional subtitles.
- No need to paste URLs one by one.

### 📅 Schedule Downloads
- Pick a date and time — downloads start automatically when the clock hits it.
- Scheduler checks every 10 seconds and kicks off queued jobs right on time.
- Schedule single URLs or entire batches.

### ⚡ aria2c Accelerated Downloads
- Toggle **aria2c** in Settings for blazing-fast downloads.
- 16 parallel connections (`-x16 -s16`) with 1 MB split size.
- Automatically switches between DASH (aria2c) and HLS (native) streams depending on the mode.
- Requires [aria2](https://aria2.github.io/) installed on your system.

### 🔧 Format & Quality Intelligence
- Fetches available formats directly from yt-dlp and shows estimated file sizes.
- Smart format string building — picks the best video + audio combo for your chosen resolution.
- Falls back gracefully when specific qualities aren't available.

### 📂 Download Management
- **Custom save directory** — browse and pick where files land.
- **Cancel active downloads** — kills the full process tree cleanly (Windows `taskkill /T` support).
- **Per-download logs** — expand any download to see raw yt-dlp output for debugging.
- **Paginated download queue** for managing large batches.

### 📜 Download History
- Completed, errored, and cancelled downloads auto-move to a persistent history panel.
- Stores up to 100 entries in `localStorage`.
- **Open folder** to jump straight to the downloaded file.
- Clear all or remove individual entries.

### 🔄 yt-dlp Auto-Update
- Check for new yt-dlp versions from GitHub Releases right inside the app.
- **One-click update** — downloads and replaces the bundled binary.
- **Auto-update on launch** option so you're always on the latest version.

### 🖥️ Modern, Dark UI
- Slate-toned dark theme with indigo accents.
- Built with **Tailwind CSS** + **Lucide icons** — responsive and sharp.
- Settings modal, schedule modal, and playlist panel all feel native.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Rust, Tauri 2 |
| **Frontend** | React 19, TypeScript, Vite 7 |
| **Styling** | Tailwind CSS 3, Lucide React |
| **Package Manager** | Bun |
| **Download Engine** | yt-dlp (bundled sidecar) |
| **Media Processing** | FFmpeg (bundled sidecar) |
| **Accelerator** | aria2c (optional, user-installed) |

---

## 📦 Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Bun](https://bun.sh/) (or Node.js — Bun is used by default)
- [aria2](https://aria2.github.io/) *(optional, for accelerated downloads)*

> **yt-dlp** and **FFmpeg** are bundled as Tauri sidecars — place them in `src-tauri/binaries/` before building.

---

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/pricisTrail/dlpgui.git
cd dlpgui

# Install frontend dependencies
bun install

# Run in development mode
bun run tauri dev

# Build for production
bun run tauri build
```

---

## 📁 Project Structure

```
dlpgui/
├── src/                  # React frontend
│   ├── App.tsx           # Main application (all features)
│   ├── main.tsx          # Entry point
│   └── index.css         # Tailwind base styles
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── lib.rs        # Tauri commands (download, formats, playlist, update)
│   │   └── main.rs       # App entry point
│   ├── binaries/         # yt-dlp & FFmpeg sidecars
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri config (window, bundling, sidecars)
├── package.json
└── tailwind.config.js
```

---

## ⚙️ Configuration

All settings are accessible from the **⚙ Settings** button in the app:

| Setting | Description |
|---------|-------------|
| **Save Directory** | Choose where downloaded files are saved |
| **aria2c Toggle** | Enable/disable 16-connection parallel downloads |
| **yt-dlp Version** | View current version, check for updates, or auto-update |
| **Auto-Update** | Automatically update yt-dlp on every app launch |

---

## 📝 License

This project is open source. See the repository for license details.

---

<div align="center">

**Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp) & [Tauri](https://tauri.app/) • Built with [Bun](https://bun.sh/) & [Rust](https://www.rust-lang.org/)**

</div>
