use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::models::YtDlpVersionInfo;

fn get_ytdlp_path() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;

    let target = tauri::utils::platform::target_triple().map_err(|e| e.to_string())?;
    let ytdlp_simple = "yt-dlp.exe";
    let ytdlp_exe = format!("yt-dlp-{}.exe", target);

    let possible_paths = vec![
        exe_dir.join(ytdlp_simple),
        exe_dir.join(&ytdlp_exe),
        exe_dir.join("binaries").join(ytdlp_simple),
        exe_dir.join("binaries").join(&ytdlp_exe),
        PathBuf::from("src-tauri/binaries").join(ytdlp_simple),
        PathBuf::from("src-tauri/binaries").join(&ytdlp_exe),
        PathBuf::from("binaries").join(ytdlp_simple),
        PathBuf::from("binaries").join(&ytdlp_exe),
    ];

    for path in possible_paths {
        if path.exists() {
            return path.canonicalize().map_err(|e| e.to_string());
        }
    }

    Err(format!(
        "yt-dlp not found. Checked runtime and bundled paths from {:?}",
        exe_dir
    ))
}

#[tauri::command]
pub async fn check_ytdlp_update(app: AppHandle) -> Result<YtDlpVersionInfo, String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;

    let output = sidecar_command
        .args(vec!["--version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let current_version = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .header("User-Agent", "yt-dlp-gui")
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API returned status: {}", response.status()));
    }

    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let latest_version = release["tag_name"]
        .as_str()
        .ok_or("Failed to get latest version tag")?
        .to_string();

    Ok(YtDlpVersionInfo {
        update_available: current_version != latest_version,
        current_version,
        latest_version,
    })
}

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let ytdlp_path = get_ytdlp_path()?;
    println!("[DEBUG] Updating yt-dlp at: {:?}", ytdlp_path);

    let client = reqwest::Client::new();
    let response = client
        .get("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
        .send()
        .await
        .map_err(|e| format!("Failed to download yt-dlp: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    let temp_path = ytdlp_path.with_extension("exe.new");
    std::fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to write yt-dlp: {}", e))?;

    let backup_path = ytdlp_path.with_extension("exe.old");
    let _ = std::fs::remove_file(&backup_path);

    if ytdlp_path.exists() {
        std::fs::rename(&ytdlp_path, &backup_path)
            .map_err(|e| format!("Failed to backup old yt-dlp: {}", e))?;
    }

    std::fs::rename(&temp_path, &ytdlp_path)
        .map_err(|e| format!("Failed to install new yt-dlp: {}", e))?;

    let _ = std::fs::remove_file(&backup_path);

    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    let output = sidecar_command
        .args(vec!["--version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let new_version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    println!("[DEBUG] yt-dlp updated to version: {}", new_version);

    Ok(new_version)
}
