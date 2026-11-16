use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use regex::Regex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

use crate::cobalt::{self, CobaltDownload};
use crate::models::{
    DownloadProgress, FormatsResponse, PlaylistInfo, PlaylistVideo, QualityOption,
};
use crate::state::ACTIVE_DOWNLOADS;

const TITLE_MARKER: &str = "__DLPGUI_TITLE__";
const FAILED_DOWNLOADS_LOG: &str = "dlp-gui-failed-downloads.jsonl";

// A cancellation may arrive between an engine exiting and its replacement
// starting. Never put a cancelled download back into the active map.
fn replace_active_child(id: &str, child: CommandChild) -> bool {
    if let Ok(mut downloads) = ACTIVE_DOWNLOADS.lock() {
        if let Some(active) = downloads.get_mut(id) {
            *active = child;
            return true;
        }
    }
    let _ = child.kill();
    false
}

fn cleanup_download_temp_dir(download_dir: &str, temp_dir: &Path) {
    if let (Ok(root), Ok(target)) = (std::fs::canonicalize(download_dir), temp_dir.canonicalize()) {
        // Refuse to follow a redirected temp directory outside the chosen folder.
        let allowed_parent = root.join("_dlpgui_temp");
        if target.parent() == Some(allowed_parent.as_path()) {
            let _ = std::fs::remove_dir_all(target);
        }
    }
}

struct YtDlpOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn is_youtube_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("youtube.com/") || lower.contains("youtu.be/")
}

fn is_youtube_auth_challenge(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("http error 429")
        || lower.contains("too many requests")
        || lower.contains("sign in to confirm you")
        || lower.contains("confirm you’re not a bot")
        || lower.contains("confirm you're not a bot")
        || lower.contains("login_required")
}

fn is_cookie_source_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    (lower.contains("could not copy") && lower.contains("cookie"))
        || (lower.contains("failed to decrypt") && lower.contains("cookie"))
        || lower.contains("failed to load cookies")
        || (lower.contains("cookies database") && lower.contains("error"))
}

fn firefox_cookie_spec(root: &Path, label: &str) -> Option<(String, String)> {
    let profiles_ini = root.join("profiles.ini");
    let contents = std::fs::read_to_string(profiles_ini).ok()?;
    let mut candidates = Vec::new();

    for line in contents.lines() {
        let line = line.trim();
        let value = line
            .strip_prefix("Default=")
            .or_else(|| line.strip_prefix("Path="));
        let Some(value) = value else {
            continue;
        };

        let path = PathBuf::from(value.replace('/', "\\"));
        let profile_path = if path.is_absolute() {
            path
        } else {
            root.join(path)
        };
        if profile_path.join("cookies.sqlite").exists() && !candidates.contains(&profile_path) {
            candidates.push(profile_path);
        }
    }

    candidates.sort_by_key(|path| {
        std::fs::metadata(path.join("cookies.sqlite"))
            .and_then(|metadata| metadata.modified())
            .unwrap_or(UNIX_EPOCH)
    });

    candidates.pop().map(|profile_path| {
        (
            format!("firefox:{}", profile_path.to_string_lossy()),
            label.to_string(),
        )
    })
}

fn browser_cookie_sources() -> Vec<(String, String)> {
    let mut sources = Vec::new();

    if let Ok(app_data) = std::env::var("APPDATA") {
        let app_data = PathBuf::from(app_data);
        if let Some(source) = firefox_cookie_spec(&app_data.join("zen"), "Zen") {
            sources.push(source);
        }
        if let Some(source) =
            firefox_cookie_spec(&app_data.join("Mozilla").join("Firefox"), "Firefox")
        {
            sources.push(source);
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let local_app_data = PathBuf::from(local_app_data);
        let chromium_browsers = [
            (
                local_app_data
                    .join("Google")
                    .join("Chrome")
                    .join("User Data"),
                "chrome",
                "Chrome",
            ),
            (
                local_app_data
                    .join("BraveSoftware")
                    .join("Brave-Browser")
                    .join("User Data"),
                "brave",
                "Brave",
            ),
            (
                local_app_data
                    .join("Microsoft")
                    .join("Edge")
                    .join("User Data"),
                "edge",
                "Edge",
            ),
        ];

        for (user_data, browser, label) in chromium_browsers {
            if user_data.join("Local State").exists() {
                sources.push((browser.to_string(), label.to_string()));
            }
        }
    }

    sources
}

fn command_args(
    base_args: &[String],
    url: &str,
    cookie_file: Option<&str>,
    browser_cookie_spec: Option<&str>,
) -> Vec<String> {
    let mut args = base_args.to_vec();
    if let Some(cookie_file) = cookie_file.filter(|path| !path.trim().is_empty()) {
        args.push("--cookies".to_string());
        args.push(cookie_file.to_string());
    } else if let Some(cookie_spec) = browser_cookie_spec {
        args.push("--cookies-from-browser".to_string());
        args.push(cookie_spec.to_string());
    }
    args.push(url.to_string());
    args
}

async fn run_ytdlp_output(
    app: &AppHandle,
    base_args: &[String],
    url: &str,
    cookie_file: Option<&str>,
) -> Result<YtDlpOutput, String> {
    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(command_args(base_args, url, cookie_file, None))
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let first_stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success()
        || !is_youtube_url(url)
        || (!is_youtube_auth_challenge(&first_stderr) && !is_cookie_source_error(&first_stderr))
    {
        return Ok(YtDlpOutput {
            success: output.status.success(),
            stdout: output.stdout,
            stderr: output.stderr,
        });
    }

    let cookie_sources = browser_cookie_sources();
    if cookie_sources.is_empty() {
        return Ok(YtDlpOutput {
            success: false,
            stdout: output.stdout,
            stderr: output.stderr,
        });
    }

    let mut stderr = output.stderr;
    let mut stdout = output.stdout;

    for (cookie_spec, browser_label) in cookie_sources {
        stderr.extend_from_slice(
            format!(
                "\n[dlp-gui] YouTube rejected the current session; trying {} cookies.\n",
                browser_label
            )
            .as_bytes(),
        );

        let retry = app
            .shell()
            .sidecar("yt-dlp")
            .map_err(|e| e.to_string())?
            .args(command_args(base_args, url, None, Some(&cookie_spec)))
            .output()
            .await
            .map_err(|e| e.to_string())?;
        let success = retry.status.success();
        stdout = retry.stdout;
        stderr.extend_from_slice(&retry.stderr);

        if success {
            return Ok(YtDlpOutput {
                success: true,
                stdout,
                stderr,
            });
        }
    }

    Ok(YtDlpOutput {
        success: false,
        stdout,
        stderr,
    })
}

fn save_failed_download(
    download_dir: &str,
    id: &str,
    title: &str,
    url: &str,
    error: &str,
) -> Result<PathBuf, String> {
    let log_path = PathBuf::from(download_dir).join(FAILED_DOWNLOADS_LOG);
    let failed_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let record = serde_json::json!({
        "failed_at_unix": failed_at_unix,
        "id": id,
        "title": title,
        "url": url,
        "error": error,
    });
    let line = serde_json::to_string(&record).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open {:?}: {}", log_path, e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Failed to write {:?}: {}", log_path, e))?;

    Ok(log_path)
}

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
    cookie_file: Option<String>,
) -> Result<FormatsResponse, String> {
    let args = vec![
        "-J".to_string(),
        "--no-warnings".to_string(),
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "--extractor-args".to_string(),
        "youtube:skip=dash".to_string(),
    ];

    let output = run_ytdlp_output(&app, &args, &url, cookie_file.as_deref()).await?;

    if !output.success {
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
                        format!(
                            "(bv*[height<={}]+ba)/b[height<={}]",
                            target_height, target_height
                        )
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
    cookie_file: Option<String>,
) -> Result<PlaylistInfo, String> {
    let args = vec![
        "-J".to_string(),
        "--flat-playlist".to_string(),
        "--no-warnings".to_string(),
    ];

    let output = run_ytdlp_output(&app, &args, &url, cookie_file.as_deref()).await?;

    if !output.success {
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
    title: String,
    cookie_file: Option<String>,
    download_dir: String,
    format_string: String,
    subtitles: bool,
    use_aria2c: bool,
) -> Result<(), String> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("Invalid download ID".to_string());
    }
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
            None => exe_dir
                .join(ffmpeg_exe_simple)
                .to_string_lossy()
                .to_string(),
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
        "--print".to_string(),
        format!("before_dl:{}%(title)s", TITLE_MARKER),
        "--js-runtimes".to_string(),
        "node".to_string(),
        "--remote-components".to_string(),
        "ejs:github".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_path.clone(),
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
        args.push(
            "aria2c:-x16 -s16 -k1M --file-allocation=none --check-certificate=false".to_string(),
        );
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
    let primary_attempt = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|error| error.to_string())
        .and_then(|command| {
            command
                .args(command_args(&args, &url, cookie_file.as_deref(), None))
                .spawn()
                .map_err(|error| error.to_string())
        });
    let (rx, child, using_cobalt) = match primary_attempt {
        Ok((rx, child)) => (rx, child, false),
        Err(error) => {
            let _ = app.emit(
                "download-log",
                serde_json::json!({
                    "id": id,
                    "message": "[dlp-gui] yt-dlp could not start; trying the local Cobalt engine.",
                }),
            );
            let fallback = cobalt::command(
                &app,
                CobaltDownload {
                    url: &url,
                    title: &title,
                    download_dir: &download_dir,
                    temp_dir: &download_temp_dir,
                    format_string: &format_string,
                    subtitles,
                    ffmpeg_path: &ffmpeg_path,
                },
            )
            .and_then(|command| command.spawn().map_err(|error| error.to_string()));
            match fallback {
                Ok((rx, child)) => (rx, child, true),
                Err(fallback_error) => {
                    let error = format!(
                        "yt-dlp could not start: {}\nLocal Cobalt could not start: {}",
                        error, fallback_error
                    );
                    let _ = save_failed_download(&download_dir, &id, &title, &url, &error);
                    let _ = app.emit(
                        "download-log",
                        serde_json::json!({
                            "id": id, "message": error, "is_error": true,
                        }),
                    );
                    cleanup_download_temp_dir(&download_dir, &download_temp_dir);
                    return Err(error);
                }
            }
        }
    };

    {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.insert(id.clone(), child);
    }

    let app_clone = app.clone();
    let id_clone = id.clone();
    let url_clone = url.clone();
    let initial_title = title.clone();
    let download_dir_for_log = download_dir.clone();
    let base_args_for_retry = args.clone();
    let cookie_sources = if is_youtube_url(&url) {
        browser_cookie_sources()
    } else {
        Vec::new()
    };
    let temp_dir_for_cleanup = download_temp_dir.clone();

    tokio::spawn(async move {
        let mut rx = rx;
        let mut using_cobalt = using_cobalt;
        let mut current_phase = "downloading".to_string();
        let mut download_count = 0;
        let mut resolved_title = initial_title;
        let mut error_lines: Vec<String> = Vec::new();
        let mut saw_retryable_session_error = false;
        let mut next_cookie_source = 0usize;
        let mut browser_fallback_started = false;

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
        let re_postprocess = Regex::new(
            r"\[(ExtractAudio|EmbedSubtitle|EmbedThumbnail|Metadata|FixupM3u8|FixupM4a)\]",
        )
        .unwrap();
        let re_destination = Regex::new(r"\[download\]\s+Destination:\s+(.+)").unwrap();
        let re_already_downloaded = Regex::new(r"has already been downloaded").unwrap();

        'download: loop {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line).trim().to_string();
                        if line_str.is_empty() {
                            continue;
                        }

                        if let Some(title) = line_str.strip_prefix(TITLE_MARKER) {
                            let title = title.trim();
                            if !title.is_empty() {
                                resolved_title = title.to_string();
                                let _ = app_clone.emit(
                                    "download-title",
                                    serde_json::json!({
                                        "id": id_clone.clone(),
                                        "title": resolved_title.clone(),
                                    }),
                                );
                            }
                            continue;
                        }

                        if is_youtube_auth_challenge(&line_str) || is_cookie_source_error(&line_str)
                        {
                            saw_retryable_session_error = true;
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
                            && (lower_line.starts_with("[dlp-gui]")
                                || re_destination.is_match(&line_str)
                                || re_merging.is_match(&line_str)
                                || re_postprocess.is_match(&line_str)
                                || re_already_downloaded.is_match(&line_str)
                                || lower_line.contains("error")
                                || lower_line.contains("warning")
                                || lower_line.contains("failed"));

                        if should_emit_log {
                            if lower_line.contains("error")
                                || lower_line.contains("warning")
                                || lower_line.contains("failed")
                            {
                                error_lines.push(line_str.clone());
                            }
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

                        if is_youtube_auth_challenge(&line_str) || is_cookie_source_error(&line_str)
                        {
                            saw_retryable_session_error = true;
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
                            error_lines.push(line_str.clone());
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
                        let is_still_active = ACTIVE_DOWNLOADS
                            .lock()
                            .map(|downloads| downloads.contains_key(&id_clone))
                            .unwrap_or(false);
                        if !is_still_active {
                            break 'download;
                        }

                        if payload.code != Some(0)
                            && !using_cobalt
                            && (saw_retryable_session_error || browser_fallback_started)
                            && next_cookie_source < cookie_sources.len()
                        {
                            if let Some((cookie_spec, browser_label)) =
                                cookie_sources.get(next_cookie_source)
                            {
                                browser_fallback_started = true;
                                next_cookie_source += 1;
                                saw_retryable_session_error = false;
                                current_phase = "downloading".to_string();
                                download_count = 0;

                                let retry_message = format!(
                                    "[dlp-gui] YouTube rejected the current session; trying {} cookies.",
                                    browser_label
                                );
                                let _ = app_clone.emit(
                                    "download-log",
                                    serde_json::json!({
                                        "id": id_clone.clone(),
                                        "message": retry_message,
                                    }),
                                );

                                match app_clone.shell().sidecar("yt-dlp") {
                                    Ok(retry_command) => {
                                        match retry_command
                                            .args(command_args(
                                                &base_args_for_retry,
                                                &url_clone,
                                                None,
                                                Some(cookie_spec),
                                            ))
                                            .spawn()
                                        {
                                            Ok((retry_rx, retry_child)) => {
                                                if !replace_active_child(&id_clone, retry_child) {
                                                    break 'download;
                                                }
                                                rx = retry_rx;
                                                continue 'download;
                                            }
                                            Err(error) => {
                                                error_lines.push(format!(
                                                    "Failed to retry with {} cookies: {}",
                                                    browser_label, error
                                                ));
                                            }
                                        }
                                    }
                                    Err(error) => {
                                        error_lines.push(error.to_string());
                                    }
                                }
                            }
                        }

                        if payload.code != Some(0) && !using_cobalt {
                            using_cobalt = true;
                            let _ = app_clone.emit("download-log", serde_json::json!({
                                "id": id_clone,
                                "message": "[dlp-gui] yt-dlp retries failed; trying local Cobalt with the same quality.",
                            }));
                            let fallback = cobalt::command(
                                &app_clone,
                                CobaltDownload {
                                    url: &url_clone,
                                    title: &resolved_title,
                                    download_dir: &download_dir_for_log,
                                    temp_dir: &temp_dir_for_cleanup,
                                    format_string: &format_string,
                                    subtitles,
                                    ffmpeg_path: &ffmpeg_path,
                                },
                            )
                            .and_then(|command| command.spawn().map_err(|error| error.to_string()));
                            match fallback {
                                Ok((fallback_rx, fallback_child)) => {
                                    if !replace_active_child(&id_clone, fallback_child) {
                                        break 'download;
                                    }
                                    rx = fallback_rx;
                                    current_phase = "downloading".to_string();
                                    download_count = 0;
                                    let _ = app_clone.emit(
                                        "download-progress",
                                        DownloadProgress {
                                            id: id_clone.clone(),
                                            percentage: 0.0,
                                            speed: String::new(),
                                            eta: String::new(),
                                            size: String::new(),
                                            status: "downloading".to_string(),
                                            phase: current_phase.clone(),
                                        },
                                    );
                                    continue 'download;
                                }
                                Err(error) => {
                                    let message =
                                        format!("Local Cobalt could not start: {}", error);
                                    error_lines.push(message.clone());
                                    let _ = app_clone.emit(
                                        "download-log",
                                        serde_json::json!({
                                            "id": id_clone, "message": message, "is_error": true,
                                        }),
                                    );
                                }
                            }
                        }

                        let status = if payload.code == Some(0) {
                            "completed"
                        } else {
                            "error"
                        };
                        if status == "error" {
                            let mut recent_errors = error_lines
                                .iter()
                                .rev()
                                .take(25)
                                .cloned()
                                .collect::<Vec<_>>();
                            recent_errors.reverse();
                            let error_summary = recent_errors.join("\n");
                            match save_failed_download(
                                &download_dir_for_log,
                                &id_clone,
                                &resolved_title,
                                &url_clone,
                                &error_summary,
                            ) {
                                Ok(path) => {
                                    let _ = app_clone.emit(
                                    "download-log",
                                    serde_json::json!({
                                        "id": id_clone.clone(),
                                        "message": format!("[dlp-gui] Failure saved to {}", path.to_string_lossy()),
                                    }),
                                );
                                }
                                Err(error) => {
                                    let _ = app_clone.emit(
                                    "download-log",
                                    serde_json::json!({
                                        "id": id_clone.clone(),
                                        "message": format!("[dlp-gui] Could not save failure record: {}", error),
                                        "is_error": true,
                                    }),
                                );
                                }
                            }
                        }
                        let _ = app_clone.emit(
                            "download-status",
                            serde_json::json!({
                                "id": id_clone.clone(),
                                "status": status,
                            }),
                        );
                        break 'download;
                    }
                    _ => {}
                }
            }
            break;
        }

        if let Ok(mut downloads) = ACTIVE_DOWNLOADS.lock() {
            downloads.remove(&id_clone);
        }

        cleanup_download_temp_dir(&download_dir_for_log, &temp_dir_for_cleanup);
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_download(app: AppHandle, id: String) -> Result<(), String> {
    let child_opt = {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.remove(&id)
    };

    if let Some(child) = child_opt {
        stop_download_process(child);
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

fn stop_download_process(child: CommandChild) {
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

pub fn shutdown_downloads() {
    let children = ACTIVE_DOWNLOADS
        .lock()
        .map(|mut downloads| {
            downloads
                .drain()
                .map(|(_, child)| child)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for child in children {
        stop_download_process(child);
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_youtube_guest_session_errors() {
        assert!(is_youtube_auth_challenge(
            "ERROR: Sign in to confirm you're not a bot"
        ));
        assert!(is_youtube_auth_challenge(
            "Unable to download webpage: HTTP Error 429: Too Many Requests"
        ));
        assert!(!is_youtube_auth_challenge(
            "ERROR: requested format is not available"
        ));
    }

    #[test]
    fn failed_download_log_keeps_title_and_url() {
        let temp_dir = std::env::temp_dir().join(format!(
            "dlpgui-failure-log-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let title = "Learn The Ultimate Chess Opening || The Evans Gambit!";
        let url = "https://www.youtube.com/watch?v=CUQQ4dym5ZU";
        let path = save_failed_download(
            temp_dir.to_str().unwrap(),
            "test-id",
            title,
            url,
            "test failure",
        )
        .unwrap();
        let contents = std::fs::read_to_string(path).unwrap();
        let record: serde_json::Value = serde_json::from_str(contents.trim()).unwrap();

        assert_eq!(record["title"], title);
        assert_eq!(record["url"], url);
        assert_eq!(record["error"], "test failure");

        std::fs::remove_dir_all(temp_dir).unwrap();
    }
}
