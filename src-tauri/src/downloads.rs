use std::path::PathBuf;

use regex::Regex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{
    ShellExt,
    process::CommandEvent,
};

use crate::models::{
    DownloadProgress, FormatsResponse, PlaylistInfo, PlaylistVideo, QualityOption,
};
use crate::state::ACTIVE_DOWNLOADS;

fn format_size(bytes: u64, is_estimate: bool) -> String {
    if bytes == 0 {
        return "Unknown".to_string();
    }

    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    let prefix = if is_estimate { "~" } else { "" };

    if bytes >= GB {
        format!("{}{:.2} GB", prefix, bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{}{:.2} MB", prefix, bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{}{:.2} KB", prefix, bytes as f64 / KB as f64)
    } else {
        format!("{}{} B", prefix, bytes)
    }
}

#[tauri::command]
pub async fn fetch_formats(
    app: AppHandle,
    url: String,
) -> Result<FormatsResponse, String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;

    let args = vec![
        "-J".to_string(),
        "--no-warnings".to_string(),
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "--extractor-args".to_string(),
        "youtube:skip=dash".to_string(),
        url,
    ];

    let output = sidecar_command
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch formats: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let formats = json["formats"].as_array().ok_or("No formats found")?;
    let duration = json["duration"].as_f64().unwrap_or(0.0);

    let estimate_size = |bitrate: f64, dur: f64| -> u64 {
        if bitrate > 0.0 && dur > 0.0 {
            ((bitrate * dur / 8.0) * 1024.0 * 0.18) as u64
        } else {
            0
        }
    };

    let mut best_audio_size = 0u64;
    let mut best_audio_format_id = String::new();
    let mut best_audio_bitrate = 0.0;
    let mut best_audio_is_estimated = false;

    for format in formats {
        let vcodec = format["vcodec"].as_str().unwrap_or("none");
        let acodec = format["acodec"].as_str().unwrap_or("none");

        if (vcodec == "none" || vcodec.is_empty()) && acodec != "none" && !acodec.is_empty() {
            let abr = format["abr"].as_f64().unwrap_or(0.0);
            let tbr = format["tbr"].as_f64().unwrap_or(0.0);
            let audio_br = if abr > 0.0 { abr } else { tbr };

            let direct_size = format["filesize"]
                .as_u64()
                .or_else(|| format["filesize_approx"].as_u64());
            let (size, is_estimated) = if let Some(value) = direct_size {
                (value, false)
            } else {
                (estimate_size(audio_br, duration), true)
            };

            if audio_br > best_audio_bitrate || (audio_br == 0.0 && size > best_audio_size) {
                best_audio_bitrate = audio_br;
                best_audio_size = size;
                best_audio_format_id = format["format_id"].as_str().unwrap_or("").to_string();
                best_audio_is_estimated = is_estimated;
            }
        }
    }

    let target_heights = vec![144, 240, 360, 480, 720, 1080, 1440];
    let mut qualities = Vec::new();

    for target_height in target_heights {
        let mut best_video_for_height: Option<&serde_json::Value> = None;
        let mut best_vbr = 0.0;

        for format in formats {
            let height = format["height"].as_i64().unwrap_or(0) as i32;
            let vcodec = format["vcodec"].as_str().unwrap_or("none");

            if height == target_height && vcodec != "none" && !vcodec.is_empty() {
                let vbr = format["vbr"].as_f64().unwrap_or(0.0);
                let tbr = format["tbr"].as_f64().unwrap_or(0.0);
                let bitrate = if vbr > 0.0 { vbr } else { tbr };

                if best_video_for_height.is_none() || bitrate > best_vbr {
                    best_video_for_height = Some(format);
                    best_vbr = bitrate;
                }
            }
        }

        if let Some(video_format) = best_video_for_height {
            let format_id = video_format["format_id"].as_str().unwrap_or("").to_string();
            let acodec = video_format["acodec"].as_str().unwrap_or("none");
            let has_audio = acodec != "none" && !acodec.is_empty();
            let vbr = video_format["vbr"].as_f64().unwrap_or(0.0);
            let tbr = video_format["tbr"].as_f64().unwrap_or(0.0);
            let video_bitrate = if vbr > 0.0 { vbr } else { tbr };

            let direct_size = video_format["filesize"]
                .as_u64()
                .or_else(|| video_format["filesize_approx"].as_u64());
            let (video_size, video_is_estimated) = if let Some(size) = direct_size {
                (size, false)
            } else {
                (estimate_size(video_bitrate, duration), true)
            };

            let (audio_size, total_size, format_string, is_estimated) = if has_audio {
                (
                    0,
                    video_size,
                    format!(
                        "(bv*[height={}]+ba)/b[height={}]/b[height<={}]",
                        target_height, target_height, target_height
                    ),
                    video_is_estimated,
                )
            } else {
                (
                    best_audio_size,
                    video_size + best_audio_size,
                    if !best_audio_format_id.is_empty() {
                        format!("({}+{})/best", format_id, best_audio_format_id)
                    } else {
                        format!("(bv*[height<={}]+ba)/b[height<={}]", target_height, target_height)
                    },
                    video_is_estimated || best_audio_is_estimated,
                )
            };

            qualities.push(QualityOption {
                quality: format!("{}p", target_height),
                height: target_height,
                video_size,
                audio_size,
                total_size,
                total_size_formatted: format_size(total_size, is_estimated),
                format_string,
                has_combined_audio: has_audio,
                available: true,
            });
        } else {
            qualities.push(QualityOption {
                quality: format!("{}p", target_height),
                height: target_height,
                video_size: 0,
                audio_size: 0,
                total_size: 0,
                total_size_formatted: "N/A".to_string(),
                format_string: format!(
                    "(bv*[height<={}]+ba)/b[height<={}]/best",
                    target_height, target_height
                ),
                has_combined_audio: false,
                available: false,
            });
        }
    }

    qualities.sort_by(|a, b| b.height.cmp(&a.height));

    Ok(FormatsResponse {
        qualities,
        best_audio_size,
        best_audio_format_id,
    })
}

#[tauri::command]
pub async fn fetch_playlist_info(
    app: AppHandle,
    url: String,
) -> Result<PlaylistInfo, String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    let args = vec![
        "-J".to_string(),
        "--flat-playlist".to_string(),
        "--no-warnings".to_string(),
        url,
    ];

    let output = sidecar_command
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch playlist info: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let title = json["title"]
        .as_str()
        .unwrap_or("Unknown Playlist")
        .to_string();
    let channel = json["channel"]
        .as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown Channel")
        .to_string();
    let description = json["description"].as_str().unwrap_or("").to_string();

    let entries: Vec<PlaylistVideo> = json["entries"]
        .as_array()
        .map(|array| {
            array
                .iter()
                .filter_map(|entry| {
                    let id = entry["id"].as_str()?.to_string();
                    let video_title = entry["title"]
                        .as_str()
                        .unwrap_or("Unknown Video")
                        .to_string();
                    let video_url = entry["url"]
                        .as_str()
                        .map(|url| url.to_string())
                        .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));

                    Some(PlaylistVideo {
                        id,
                        title: video_title,
                        url: video_url,
                        duration: entry["duration"].as_f64(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(PlaylistInfo {
        video_count: entries.len(),
        title,
        channel,
        description,
        entries,
    })
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    id: String,
    url: String,
    download_dir: String,
    format_string: String,
    subtitles: bool,
    use_aria2c: bool,
) -> Result<(), String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;

    let ffmpeg_path = {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
        let target = tauri::utils::platform::target_triple().map_err(|e| e.to_string())?;
        let ffmpeg_exe_with_target = format!("ffmpeg-{}.exe", target);
        let ffmpeg_exe_simple = "ffmpeg.exe";

        let possible_paths = vec![
            exe_dir.join(ffmpeg_exe_simple),
            exe_dir.join(&ffmpeg_exe_with_target),
            exe_dir.join("binaries").join(ffmpeg_exe_simple),
            exe_dir.join("binaries").join(&ffmpeg_exe_with_target),
            PathBuf::from("binaries").join(&ffmpeg_exe_with_target),
            PathBuf::from("src-tauri/binaries").join(&ffmpeg_exe_with_target),
        ];

        let mut found_path = None;
        for path in &possible_paths {
            if path.exists() {
                found_path = Some(
                    path.canonicalize()
                        .unwrap_or_else(|_| path.to_path_buf())
                        .to_string_lossy()
                        .to_string(),
                );
                break;
            }
        }

        match found_path {
            Some(path) => path,
            None => exe_dir.join(ffmpeg_exe_simple).to_string_lossy().to_string(),
        }
    };

    let is_audio_only = format_string == "ba/b";
    let output_template = "%(title)s.%(ext)s".to_string();
    let home_path = format!("home:{}", download_dir);
    let download_temp_dir = PathBuf::from(&download_dir).join("_dlpgui_temp").join(&id);
    if let Err(err) = std::fs::create_dir_all(&download_temp_dir) {
        println!(
            "[WARN] Failed to create yt-dlp temp directory {:?}: {}",
            download_temp_dir, err
        );
    }
    let temp_path = format!("temp:{}", download_temp_dir.to_string_lossy());
    let subtitle_path = format!("subtitle:{}", download_temp_dir.to_string_lossy());

    let mut args = vec![
        "--progress".to_string(),
        "--newline".to_string(),
        "--no-update".to_string(),
        "--no-playlist".to_string(),
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_path,
        "--no-keep-fragments".to_string(),
        "-P".to_string(),
        home_path,
        "-P".to_string(),
        temp_path,
        "-P".to_string(),
        subtitle_path,
        "-o".to_string(),
        output_template,
    ];

    if !is_audio_only {
        args.push("--merge-output-format".to_string());
        args.push("mp4".to_string());
        args.push("--embed-thumbnail".to_string());
    }

    let extractor_skip = if subtitles {
        if use_aria2c {
            "youtube:skip=hls,translated_subs"
        } else {
            "youtube:skip=dash,translated_subs"
        }
    } else if use_aria2c {
        "youtube:skip=hls"
    } else {
        "youtube:skip=dash"
    };

    args.push("--extractor-args".to_string());
    args.push(extractor_skip.to_string());

    if use_aria2c {
        args.push("--downloader".to_string());
        args.push("aria2c".to_string());
        args.push("--downloader-args".to_string());
        args.push("aria2c:-x16 -s16 -k1M --file-allocation=none --check-certificate=false".to_string());
    }

    let height_re = Regex::new(r"height<=(\d+)").unwrap();
    if let Some(caps) = height_re.captures(&format_string) {
        let height = &caps[1];
        args.push("-S".to_string());
        args.push(format!("res:{}", height));
        args.push("-f".to_string());
        args.push("bv+ba/b".to_string());
    } else {
        args.push("-f".to_string());
        args.push(format_string.clone());
    }

    if subtitles {
        args.push("--write-subs".to_string());
        args.push("--write-auto-sub".to_string());
        if !is_audio_only {
            args.push("--embed-subs".to_string());
        }
        args.push("--sub-langs".to_string());
        args.push("en,en-US,en-GB,en-orig,-live_chat".to_string());
    }

    args.push("-N".to_string());
    args.push("4".to_string());
    args.push(url);

    let (mut rx, child) = sidecar_command
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.insert(id.clone(), child);
    }

    let app_clone = app.clone();
    let id_clone = id.clone();
    let temp_dir_for_cleanup = download_temp_dir.clone();

    tokio::spawn(async move {
        let mut current_phase = "downloading".to_string();
        let mut download_count = 0;

        let re_progress = Regex::new(
            r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)\s+at\s+([\d.]+\s*[kKMGT]?i?B/s)\s+ETA\s+([\d:]+)"
        )
        .unwrap();
        let re_progress_unknown = Regex::new(
            r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)\s+at\s+(\S+)\s+ETA\s+(\S+)"
        )
        .unwrap();
        let re_aria2c_progress = Regex::new(
            r"\[#\w+\s+[\d.]+[kKMGT]?i?B/([\d.]+[kKMGT]?i?B)\((\d+)%\).*DL:([\d.]+[kKMGT]?i?B).*ETA:(\w+)"
        )
        .unwrap();
        let re_progress_simple =
            Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)").unwrap();
        let re_format_info = Regex::new(r"\[info\].*?:\s*Downloading.*?(video|audio)").unwrap();
        let re_merging = Regex::new(r"\[Merger\]|\[ffmpeg\].*Merging").unwrap();
        let re_postprocess =
            Regex::new(r"\[(ExtractAudio|EmbedSubtitle|EmbedThumbnail|Metadata|FixupM3u8|FixupM4a)\]").unwrap();
        let re_destination = Regex::new(r"\[download\]\s+Destination:\s+(.+)").unwrap();
        let re_already_downloaded = Regex::new(r"has already been downloaded").unwrap();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).trim().to_string();
                    if line_str.is_empty() {
                        continue;
                    }

                    let is_progress_line = re_progress.is_match(&line_str)
                        || re_progress_unknown.is_match(&line_str)
                        || re_aria2c_progress.is_match(&line_str)
                        || re_progress_simple.is_match(&line_str);

                    if re_destination.is_match(&line_str) {
                        download_count += 1;
                        current_phase = if download_count == 1 {
                            "video".to_string()
                        } else {
                            "audio".to_string()
                        };
                    }

                    if let Some(caps) = re_format_info.captures(&line_str) {
                        current_phase = caps[1].to_lowercase();
                    }

                    if re_merging.is_match(&line_str) {
                        current_phase = "merging".to_string();
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: 99.0,
                                size: String::new(),
                                speed: String::new(),
                                eta: String::new(),
                                status: "downloading".to_string(),
                                phase: "merging".to_string(),
                            },
                        );
                    }

                    if re_postprocess.is_match(&line_str) {
                        current_phase = "processing".to_string();
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: 99.5,
                                size: String::new(),
                                speed: String::new(),
                                eta: String::new(),
                                status: "downloading".to_string(),
                                phase: "processing".to_string(),
                            },
                        );
                    }

                    let adjusted_percent = |raw_percent: f32| -> f32 {
                        if download_count > 1 {
                            50.0 + (raw_percent * 0.45)
                        } else if download_count == 1 {
                            raw_percent * 0.5
                        } else {
                            raw_percent
                        }
                    };

                    if let Some(caps) = re_progress.captures(&line_str) {
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: adjusted_percent(
                                    caps[1].parse::<f32>().unwrap_or(0.0),
                                ),
                                size: caps[2].trim().to_string(),
                                speed: caps[3].trim().to_string(),
                                eta: caps[4].trim().to_string(),
                                status: "downloading".to_string(),
                                phase: current_phase.clone(),
                            },
                        );
                    } else if let Some(caps) = re_progress_unknown.captures(&line_str) {
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: adjusted_percent(
                                    caps[1].parse::<f32>().unwrap_or(0.0),
                                ),
                                size: caps[2].trim().to_string(),
                                speed: caps[3].trim().to_string(),
                                eta: caps[4].trim().to_string(),
                                status: "downloading".to_string(),
                                phase: current_phase.clone(),
                            },
                        );
                    } else if let Some(caps) = re_aria2c_progress.captures(&line_str) {
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: adjusted_percent(
                                    caps[2].parse::<f32>().unwrap_or(0.0),
                                ),
                                size: caps[1].to_string(),
                                speed: caps[3].to_string(),
                                eta: caps[4].to_string(),
                                status: "downloading".to_string(),
                                phase: current_phase.clone(),
                            },
                        );
                    } else if let Some(caps) = re_progress_simple.captures(&line_str) {
                        let _ = app_clone.emit(
                            "download-progress",
                            DownloadProgress {
                                id: id_clone.clone(),
                                percentage: adjusted_percent(
                                    caps[1].parse::<f32>().unwrap_or(0.0),
                                ),
                                size: caps[2].trim().to_string(),
                                speed: "...".to_string(),
                                eta: "...".to_string(),
                                status: "downloading".to_string(),
                                phase: current_phase.clone(),
                            },
                        );
                    } else if let Some(caps) = re_destination.captures(&line_str) {
                        let full_path = caps[1].trim();
                        let filename = full_path
                            .split(|c| c == '/' || c == '\\')
                            .last()
                            .unwrap_or(full_path);
                        let _ = app_clone.emit(
                            "download-title",
                            serde_json::json!({
                                "id": id_clone.clone(),
                                "title": filename,
                            }),
                        );
                    } else if re_already_downloaded.is_match(&line_str) {
                        if let Some(start) = line_str.find("[download] ") {
                            let rest = &line_str[start + 11..];
                            if let Some(end) = rest.find(" has already") {
                                let full_path = &rest[..end];
                                let filename = full_path
                                    .split(|c| c == '/' || c == '\\')
                                    .last()
                                    .unwrap_or(full_path);
                                let _ = app_clone.emit(
                                    "download-title",
                                    serde_json::json!({
                                        "id": id_clone.clone(),
                                        "title": filename,
                                    }),
                                );
                            }
                        }
                    }

                    let lower_line = line_str.to_ascii_lowercase();
                    let should_emit_log = !is_progress_line
                        && (re_destination.is_match(&line_str)
                            || re_merging.is_match(&line_str)
                            || re_postprocess.is_match(&line_str)
                            || re_already_downloaded.is_match(&line_str)
                            || lower_line.contains("error")
                            || lower_line.contains("warning")
                            || lower_line.contains("failed"));

                    if should_emit_log {
                        let _ = app_clone.emit(
                            "download-log",
                            serde_json::json!({
                                "id": id_clone.clone(),
                                "message": line_str,
                            }),
                        );
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).trim().to_string();
                    if line_str.is_empty() {
                        continue;
                    }

                    let is_progress_line = re_progress.is_match(&line_str)
                        || re_progress_unknown.is_match(&line_str)
                        || re_aria2c_progress.is_match(&line_str)
                        || re_progress_simple.is_match(&line_str);
                    let lower_line = line_str.to_ascii_lowercase();
                    let should_emit_log = !is_progress_line
                        || lower_line.contains("error")
                        || lower_line.contains("warning")
                        || lower_line.contains("failed");

                    if should_emit_log {
                        let _ = app_clone.emit(
                            "download-log",
                            serde_json::json!({
                                "id": id_clone.clone(),
                                "message": line_str,
                                "is_error": true,
                            }),
                        );
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let status = if payload.code == Some(0) {
                        "completed"
                    } else {
                        "error"
                    };
                    let _ = app_clone.emit(
                        "download-status",
                        serde_json::json!({
                            "id": id_clone.clone(),
                            "status": status,
                        }),
                    );
                    break;
                }
                _ => {}
            }
        }

        if let Ok(mut downloads) = ACTIVE_DOWNLOADS.lock() {
            downloads.remove(&id_clone);
        }

        if temp_dir_for_cleanup.exists() {
            let _ = std::fs::remove_dir_all(&temp_dir_for_cleanup);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let child_opt = {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.remove(&id)
    };

    if let Some(child) = child_opt {
        let pid = child.pid();

        #[cfg(target_os = "windows")]
        {
            let output = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();

            match output {
                Ok(result) => {
                    if !result.status.success() {
                        let _ = child.kill();
                    }
                }
                Err(_) => {
                    let _ = child.kill();
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
        }
    }

    let _ = app.emit(
        "download-status",
        serde_json::json!({
            "id": id,
            "status": "cancelled",
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let normalized = path.replace('/', "\\");
        let normalized = normalized.trim_end_matches('\\');
        tokio::process::Command::new("explorer.exe")
            .arg(normalized)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        tokio::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        tokio::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}
