use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::Command, ShellExt};

pub struct CobaltDownload<'a> {
    pub url: &'a str,
    pub title: &'a str,
    pub download_dir: &'a str,
    pub temp_dir: &'a Path,
    pub format_string: &'a str,
    pub subtitles: bool,
    pub ffmpeg_path: &'a str,
}

fn executable_on_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|directory| directory.join(name))
            .find(|candidate| candidate.is_file())
    })
}

pub fn command(app: &AppHandle, download: CobaltDownload<'_>) -> Result<Command, String> {
    let mut roots = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.join("cobalt"));
    }
    if cfg!(debug_assertions) {
        roots.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("cobalt"));
    }
    let root = roots
        .into_iter()
        .find(|root| root.join("api/desktop-runner.mjs").is_file())
        .ok_or("The bundled local Cobalt engine was not found.")?;

    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let node = Some(root.join("runtime").join(node_name))
        .filter(|candidate| candidate.is_file())
        .or_else(|| executable_on_path(node_name))
        .ok_or("Local Cobalt requires Node.js 22 or 24. Install Node.js or bundle its runtime.")?;
    let ffmpeg_name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let ffmpeg = Some(PathBuf::from(download.ffmpeg_path))
        .filter(|candidate| candidate.is_file())
        .or_else(|| executable_on_path(ffmpeg_name))
        .ok_or("Local Cobalt requires the app's FFmpeg binary or FFmpeg on PATH.")?;

    let request = serde_json::json!({
        "url": download.url,
        "title": download.title,
        "download_dir": download.download_dir,
        "temp_dir": download.temp_dir,
        "format_string": download.format_string,
        "subtitles": download.subtitles,
        "ffmpeg_path": ffmpeg,
    });
    Ok(app
        .shell()
        .command(node)
        .args(["--no-node-snapshot", "desktop-runner.mjs"])
        .current_dir(root.join("api"))
        .env("DLPGUI_COBALT_REQUEST", request.to_string()))
}
