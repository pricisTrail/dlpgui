use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde::Serialize;
use regex::Regex;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri_plugin_shell::process::CommandChild;
use std::path::PathBuf;

// Global storage for active download processes
lazy_static::lazy_static! {
    static ref ACTIVE_DOWNLOADS: Arc<Mutex<HashMap<String, CommandChild>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    percentage: f32,
    speed: String,
    eta: String,
    size: String,
    status: String,
    phase: String,  // "video", "audio", "merging", "processing"
}

#[derive(Clone, Serialize, Debug)]
struct QualityOption {
    quality: String,           // e.g., "720p", "1080p"
    height: i32,
    video_size: u64,           // size of video format
    audio_size: u64,           // size of best audio (0 if combined)
    total_size: u64,           // total estimated size
    total_size_formatted: String,
    format_string: String,     // yt-dlp format string to use
    has_combined_audio: bool,  // true if video already includes audio
    available: bool,
}

#[derive(Clone, Serialize, Debug)]
struct FormatsResponse {
    qualities: Vec<QualityOption>,
    best_audio_size: u64,
    best_audio_format_id: String,
}

#[derive(Clone, Serialize, Debug)]
struct PlaylistVideo {
    id: String,
    title: String,
    url: String,
    duration: Option<f64>,
}

#[derive(Clone, Serialize, Debug)]
struct PlaylistInfo {
    title: String,
    video_count: usize,
    channel: String,
    description: String,
    entries: Vec<PlaylistVideo>,
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
async fn fetch_formats(
    app: AppHandle,
    url: String,
) -> Result<FormatsResponse, String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    
    // Use -J to get JSON output with all format info
    // JS runtime + remote-components required for YouTube signature solving
    // skip=dash forces HLS formats which bypass SABR restrictions
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
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    let formats = json["formats"].as_array()
        .ok_or("No formats found")?;
    
    // Get video duration in seconds for size estimation
    let duration = json["duration"].as_f64().unwrap_or(0.0);
    
    println!("DEBUG: Video duration = {} seconds", duration);
    
    // Helper function to estimate size from bitrate and duration
    // bitrate is in kbps, duration in seconds, returns bytes
    // We use a 0.18 factor because:
    // - YouTube reports PEAK bitrate, not average bitrate
    // - HLS/m3u8 streams have highly variable bitrates
    // - Actual files are typically 15-20% of what peak bitrate suggests
    let estimate_size = |bitrate: f64, dur: f64| -> u64 {
        if bitrate > 0.0 && dur > 0.0 {
            // bitrate (kbps) * duration (s) / 8 = kilobytes, * 1024 = bytes
            // Apply 0.18 factor because YouTube reports peak, not average bitrate
            let estimated = ((bitrate * dur / 8.0) * 1024.0 * 0.18) as u64;
            println!("DEBUG: estimate_size(bitrate={}, duration={}) = {} bytes ({:.2} MB)", 
                     bitrate, dur, estimated, estimated as f64 / 1024.0 / 1024.0);
            estimated
        } else {
            0
        }
    };
    
    // Find best audio format
    let mut best_audio_size: u64 = 0;
    let mut best_audio_format_id = String::new();
    let mut best_audio_bitrate: f64 = 0.0;
    let mut best_audio_is_estimated = false;
    
    for format in formats {
        let vcodec = format["vcodec"].as_str().unwrap_or("none");
        let acodec = format["acodec"].as_str().unwrap_or("none");
        
        // Audio-only format
        if (vcodec == "none" || vcodec.is_empty()) && acodec != "none" && !acodec.is_empty() {
            let abr = format["abr"].as_f64().unwrap_or(0.0);
            let tbr = format["tbr"].as_f64().unwrap_or(0.0);
            let audio_br = if abr > 0.0 { abr } else { tbr };
            
            // Check if we have direct filesize or need to estimate
            let direct_size = format["filesize"].as_u64()
                .or_else(|| format["filesize_approx"].as_u64());
            let (size, is_estimated) = if let Some(s) = direct_size {
                (s, false)
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
    
    // Target resolutions
    let target_heights = vec![144, 240, 360, 480, 720, 1080, 1440];
    let mut qualities: Vec<QualityOption> = Vec::new();
    
    for target_height in target_heights {
        // Find the best video format at this height
        let mut best_video_for_height: Option<&serde_json::Value> = None;
        let mut best_vbr: f64 = 0.0;
        
        for format in formats {
            let height = format["height"].as_i64().unwrap_or(0) as i32;
            let vcodec = format["vcodec"].as_str().unwrap_or("none");
            
            // Must be video format at this height
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
            
            // Get video bitrate for size estimation
            let vbr = video_format["vbr"].as_f64().unwrap_or(0.0);
            let tbr = video_format["tbr"].as_f64().unwrap_or(0.0);
            let video_bitrate = if vbr > 0.0 { vbr } else { tbr };
            
            // Check if we have direct filesize or need to estimate
            let direct_size = video_format["filesize"].as_u64()
                .or_else(|| video_format["filesize_approx"].as_u64());
            let (video_size, video_is_estimated) = if let Some(s) = direct_size {
                (s, false)
            } else {
                (estimate_size(video_bitrate, duration), true)
            };
            
            let (audio_size, total_size, format_string, is_estimated) = if has_audio {
                // Video already has audio - still merge with best audio to ensure quality
                // Using parentheses to group video+audio selection
                let fmt_str = format!("(bv*[height={}]+ba)/b[height={}]/b[height<={}]", target_height, target_height, target_height);
                (0, video_size, fmt_str, video_is_estimated)
            } else {
                // Need to add best audio
                let total = video_size + best_audio_size;
                let fmt_str = if !best_audio_format_id.is_empty() {
                    format!("({}+{})/best", format_id, best_audio_format_id)
                } else {
                    format!("(bv*[height<={}]+ba)/b[height<={}]", target_height, target_height)
                };
                // If either video or audio size is estimated, mark total as estimated
                (best_audio_size, total, fmt_str, video_is_estimated || best_audio_is_estimated)
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
            // Format not available - use format with best audio fallback
            qualities.push(QualityOption {
                quality: format!("{}p", target_height),
                height: target_height,
                video_size: 0,
                audio_size: 0,
                total_size: 0,
                total_size_formatted: "N/A".to_string(),
                format_string: format!("(bv*[height<={}]+ba)/b[height<={}]/best", target_height, target_height),
                has_combined_audio: false,
                available: false,
            });
        }
    }
    
    // Sort by height descending
    qualities.sort_by(|a, b| b.height.cmp(&a.height));
    
    Ok(FormatsResponse {
        qualities,
        best_audio_size,
        best_audio_format_id,
    })
}

#[tauri::command]
async fn fetch_playlist_info(
    app: AppHandle,
    url: String,
) -> Result<PlaylistInfo, String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    
    // Use --flat-playlist to quickly get playlist info without downloading video details
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
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Get playlist details
    let title = json["title"].as_str().unwrap_or("Unknown Playlist").to_string();
    let channel = json["channel"].as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("Unknown Channel").to_string();
    let description = json["description"].as_str().unwrap_or("").to_string();
    
    // Extract video entries
    let entries: Vec<PlaylistVideo> = json["entries"].as_array()
        .map(|arr| {
            arr.iter().filter_map(|entry| {
                let id = entry["id"].as_str()?.to_string();
                let video_title = entry["title"].as_str().unwrap_or("Unknown Video").to_string();
                let video_url = entry["url"].as_str()
                    .map(|u| u.to_string())
                    .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));
                let duration = entry["duration"].as_f64();
                Some(PlaylistVideo {
                    id,
                    title: video_title,
                    url: video_url,
                    duration,
                })
            }).collect()
        })
        .unwrap_or_default();
    
    let video_count = entries.len();
    
    Ok(PlaylistInfo {
        title,
        video_count,
        channel,
        description,
        entries,
    })
}

#[tauri::command]
async fn start_download(
    app: AppHandle,
    id: String,
    url: String,
    download_dir: String,
    format_string: String,
    subtitles: bool,
    use_aria2c: bool,
) -> Result<(), String> {
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    
    // Get the ffmpeg sidecar path
    let ffmpeg_path = {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
        
        let target = tauri::utils::platform::target_triple().map_err(|e| e.to_string())?;
        let ffmpeg_exe_with_target = format!("ffmpeg-{}.exe", target);
        let ffmpeg_exe_simple = "ffmpeg.exe";
        
        println!("[DEBUG] Looking for ffmpeg");
        println!("[DEBUG] Exe directory: {:?}", exe_dir);
        
        // Try multiple possible locations and names
        // In production builds, Tauri strips the target triple from sidecar names
        let possible_paths = vec![
            // 1. Production build - same directory, simple name (Tauri strips target triple)
            exe_dir.join(ffmpeg_exe_simple),
            // 2. Production build - same directory, with target triple
            exe_dir.join(&ffmpeg_exe_with_target),
            // 3. Look in binaries subfolder next to exe
            exe_dir.join("binaries").join(ffmpeg_exe_simple),
            exe_dir.join("binaries").join(&ffmpeg_exe_with_target),
            // 4. Dev mode - binaries folder from cwd (with target triple)
            std::path::PathBuf::from("binaries").join(&ffmpeg_exe_with_target),
            // 5. Dev mode - src-tauri/binaries (with target triple)
            std::path::PathBuf::from("src-tauri/binaries").join(&ffmpeg_exe_with_target),
        ];
        
        let mut found_path: Option<String> = None;
        for path in &possible_paths {
            println!("[DEBUG] Checking ffmpeg path: {:?} (exists: {})", path, path.exists());
            if path.exists() {
                found_path = Some(path.canonicalize()
                    .unwrap_or_else(|_| path.to_path_buf())
                    .to_string_lossy()
                    .to_string());
                break;
            }
        }
        
        match found_path {
            Some(p) => p,
            None => {
                // Last resort: just use the expected production path
                // This will cause yt-dlp to warn but at least we tried
                println!("[WARN] ffmpeg not found in any expected location!");
                exe_dir.join(ffmpeg_exe_simple).to_string_lossy().to_string()
            }
        }
    };
    
    println!("[DEBUG] FFmpeg path: {}", ffmpeg_path);
    println!("[DEBUG] Starting download for ID: {}", id);
    println!("[DEBUG] URL: {}", url);
    println!("[DEBUG] Format: {}", format_string);
    println!("[DEBUG] Use aria2c: {}", use_aria2c);
    
    let output_template = "%(title)s.%(ext)s".to_string();
    let home_path = format!("home:{}", download_dir);
    let temp_dir = PathBuf::from(&download_dir).join("_dlpgui_temp");
    if let Err(err) = std::fs::create_dir_all(&temp_dir) {
        println!("[WARN] Failed to create yt-dlp temp directory {:?}: {}", temp_dir, err);
    }
    let temp_path = format!("temp:{}", temp_dir.to_string_lossy());
    
    // Build args based on whether aria2c is enabled
    // aria2c cannot download HLS streams, so:
    // - aria2c enabled: use DASH formats (skip=hls) - faster but may get 403 on some videos
    // - aria2c disabled: use HLS formats (skip=dash) - slower but bypasses SABR restrictions
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
        "--merge-output-format".to_string(),
        "mp4".to_string(),
        "--no-keep-fragments".to_string(),
        "-P".to_string(),
        home_path,
        "-P".to_string(),
        temp_path,
        "-o".to_string(),
        output_template,
    ];

    // Add extractor args based on download method
    if use_aria2c {
        // Use DASH formats with aria2c for faster downloads
        args.push("--extractor-args".to_string());
        args.push("youtube:skip=hls".to_string());
        args.push("--downloader".to_string());
        args.push("aria2c".to_string());
        args.push("--downloader-args".to_string());
        args.push("aria2c:-x16 -s16 -k1M --file-allocation=none --check-certificate=false".to_string());
    } else {
        // Use HLS formats which bypass SABR restrictions
        args.push("--extractor-args".to_string());
        args.push("youtube:skip=dash".to_string());
    }

    // Parse target resolution from format string and add -S for proper sorting
    // Format strings like "bv*[height<=720]+ba/b[height<=720]/best" need -S res:720
    let height_re = Regex::new(r"height<=(\d+)").unwrap();
    if let Some(caps) = height_re.captures(&format_string) {
        let height = &caps[1];
        args.push("-S".to_string());
        args.push(format!("res:{}", height));
        // Use simplified format that works better with -S sorting
        args.push("-f".to_string());
        args.push("bv+ba/b".to_string());
    } else if format_string == "ba/b" {
        // Audio only
        args.push("-f".to_string());
        args.push(format_string.clone());
    } else {
        // Fallback to provided format string
        args.push("-f".to_string());
        args.push(format_string.clone());
    }

    if subtitles {
        args.push("--write-subs".to_string());
        args.push("--write-auto-sub".to_string());
        args.push("--embed-subs".to_string());
        args.push("--sub-langs".to_string());
        // Limit subtitle downloads to English variants to avoid fetching dozens of auto-translated tracks.
        args.push("en.*,en,-live_chat".to_string());
    }
    
    args.push("-N".to_string());
    args.push("4".to_string());

    args.push(url);
    
    println!("[DEBUG] yt-dlp args: {:?}", args);

    // Spawn the sidecar process
    let (mut rx, child) = sidecar_command
        .args(args)
        .spawn()
        .map_err(|e| {
            println!("[ERROR] Failed to spawn yt-dlp: {}", e);
            e.to_string()
        })?;

    println!("[DEBUG] yt-dlp process spawned successfully");

    // Store the child process for potential cancellation
    {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.insert(id.clone(), child);
        println!("[DEBUG] Stored download process in ACTIVE_DOWNLOADS");
    }

    let app_clone = app.clone();
    let id_clone = id.clone();

    // Spawn the event handler in a separate task
    tokio::spawn(async move {
        println!("[DEBUG] Event handler task started for ID: {}", id_clone);
        
        let mut current_phase = "downloading".to_string();
        let mut download_count = 0;
        
        // Regex patterns for parsing yt-dlp output
        let re_progress = Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)\s+at\s+([\d.]+\s*[kKMGT]?i?B/s)\s+ETA\s+([\d:]+)").unwrap();
        let re_progress_unknown = Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)\s+at\s+(\S+)\s+ETA\s+(\S+)").unwrap();
        let re_aria2c_progress = Regex::new(r"\[#\w+\s+[\d.]+[kKMGT]?i?B/([\d.]+[kKMGT]?i?B)\((\d+)%\).*DL:([\d.]+[kKMGT]?i?B).*ETA:(\w+)").unwrap();
        let re_progress_simple = Regex::new(r"\[download\]\s+(\d+\.?\d*)%\s+of\s+(~?[\d.]+\s*[kKMGT]?i?B)").unwrap();
        let re_format_info = Regex::new(r"\[info\].*?:\s*Downloading.*?(video|audio)").unwrap();
        let re_merging = Regex::new(r"\[Merger\]|\[ffmpeg\].*Merging").unwrap();
        let re_postprocess = Regex::new(r"\[(ExtractAudio|EmbedSubtitle|EmbedThumbnail|Metadata|FixupM3u8|FixupM4a)\]").unwrap();
        let re_destination = Regex::new(r"\[download\]\s+Destination:\s+(.+)").unwrap();
        let re_already_downloaded = Regex::new(r"has already been downloaded").unwrap();
        
        let mut event_count = 0;
        
        // Process events from the child process
        while let Some(event) = rx.recv().await {
            event_count += 1;
            
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    let line_str = line_str.trim().to_string();
                    if line_str.is_empty() {
                        continue;
                    }
                    let is_progress_line = re_progress.is_match(&line_str)
                        || re_progress_unknown.is_match(&line_str)
                        || re_aria2c_progress.is_match(&line_str)
                        || re_progress_simple.is_match(&line_str);

                    // Detect download phase changes
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
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: 99.0,
                            size: "".to_string(),
                            speed: "".to_string(),
                            eta: "".to_string(),
                            status: "downloading".to_string(),
                            phase: "merging".to_string(),
                        });
                    }
                    
                    if re_postprocess.is_match(&line_str) {
                        current_phase = "processing".to_string();
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: 99.5,
                            size: "".to_string(),
                            speed: "".to_string(),
                            eta: "".to_string(),
                            status: "downloading".to_string(),
                            phase: "processing".to_string(),
                        });
                    }

                    // Parse progress from various formats
                    if let Some(caps) = re_progress.captures(&line_str) {
                        let raw_percent = caps[1].parse::<f32>().unwrap_or(0.0);
                        let adjusted_percent = if download_count > 1 {
                            50.0 + (raw_percent * 0.45)
                        } else if download_count == 1 {
                            raw_percent * 0.5
                        } else {
                            raw_percent
                        };
                        
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: adjusted_percent,
                            size: caps[2].to_string().trim().to_string(),
                            speed: caps[3].to_string().trim().to_string(),
                            eta: caps[4].to_string().trim().to_string(),
                            status: "downloading".to_string(),
                            phase: current_phase.clone(),
                        });
                    } else if let Some(caps) = re_progress_unknown.captures(&line_str) {
                        let raw_percent = caps[1].parse::<f32>().unwrap_or(0.0);
                        let adjusted_percent = if download_count > 1 {
                            50.0 + (raw_percent * 0.45)
                        } else if download_count == 1 {
                            raw_percent * 0.5
                        } else {
                            raw_percent
                        };
                        
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: adjusted_percent,
                            size: caps[2].to_string().trim().to_string(),
                            speed: caps[3].to_string().trim().to_string(),
                            eta: caps[4].to_string().trim().to_string(),
                            status: "downloading".to_string(),
                            phase: current_phase.clone(),
                        });
                    } else if let Some(caps) = re_aria2c_progress.captures(&line_str) {
                        let raw_percent = caps[2].parse::<f32>().unwrap_or(0.0);
                        let adjusted_percent = if download_count > 1 {
                            50.0 + (raw_percent * 0.45)
                        } else if download_count == 1 {
                            raw_percent * 0.5
                        } else {
                            raw_percent
                        };
                        
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: adjusted_percent,
                            size: caps[1].to_string(),
                            speed: caps[3].to_string(),
                            eta: caps[4].to_string(),
                            status: "downloading".to_string(),
                            phase: current_phase.clone(),
                        });
                    } else if let Some(caps) = re_progress_simple.captures(&line_str) {
                        let raw_percent = caps[1].parse::<f32>().unwrap_or(0.0);
                        let adjusted_percent = if download_count > 1 {
                            50.0 + (raw_percent * 0.45)
                        } else if download_count == 1 {
                            raw_percent * 0.5
                        } else {
                            raw_percent
                        };
                        
                        let _ = app_clone.emit("download-progress", DownloadProgress {
                            id: id_clone.clone(),
                            percentage: adjusted_percent,
                            size: caps[2].to_string().trim().to_string(),
                            speed: "...".to_string(),
                            eta: "...".to_string(),
                            status: "downloading".to_string(),
                            phase: current_phase.clone(),
                        });
                    } else if let Some(caps) = re_destination.captures(&line_str) {
                        let full_path = caps[1].trim();
                        let filename = full_path.split(|c| c == '/' || c == '\\').last().unwrap_or(full_path);
                        
                        let _ = app_clone.emit("download-title", serde_json::json!({
                            "id": id_clone.clone(),
                            "title": filename
                        }));
                    } else if re_already_downloaded.is_match(&line_str) {
                        if let Some(start) = line_str.find("[download] ") {
                            let rest = &line_str[start + 11..];
                            if let Some(end) = rest.find(" has already") {
                                let full_path = &rest[..end];
                                let filename = full_path.split(|c| c == '/' || c == '\\').last().unwrap_or(full_path);
                                let _ = app_clone.emit("download-title", serde_json::json!({
                                    "id": id_clone.clone(),
                                    "title": filename
                                }));
                            }
                        }
                    }

                    // Emit only important log lines to avoid overwhelming the frontend.
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
                        println!("[yt-dlp stdout #{}]: {}", event_count, line_str);
                        let _ = app_clone.emit("download-log", serde_json::json!({
                            "id": id_clone.clone(),
                            "message": line_str
                        }));
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    let line_str = line_str.trim().to_string();
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
                        println!("[yt-dlp stderr #{}]: {}", event_count, line_str);
                        let _ = app_clone.emit("download-log", serde_json::json!({
                            "id": id_clone.clone(),
                            "message": line_str,
                            "is_error": true
                        }));
                    }
                }
                CommandEvent::Terminated(payload) => {
                    println!("[DEBUG] Process terminated for ID: {} with code: {:?}", id_clone, payload.code);
                    let status = if payload.code == Some(0) { "completed" } else { "error" };
                    let _ = app_clone.emit("download-status", serde_json::json!({
                        "id": id_clone.clone(),
                        "status": status
                    }));
                    break;
                }
                _ => {
                    println!("[DEBUG] Other event received: {:?}", event_count);
                }
            }
        }
        
        println!("[DEBUG] Event loop ended for ID: {}, processed {} events", id_clone, event_count);
        
        // Cleanup: remove from active downloads
        if let Ok(mut downloads) = ACTIVE_DOWNLOADS.lock() {
            downloads.remove(&id_clone);
            println!("[DEBUG] Removed download from ACTIVE_DOWNLOADS");
        }
    });

    Ok(())
}

#[tauri::command]
async fn cancel_download(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    println!("[DEBUG] Cancel requested for ID: {}", id);
    
    // Try to kill the process
    let child_opt = {
        let mut downloads = ACTIVE_DOWNLOADS.lock().map_err(|e| e.to_string())?;
        downloads.remove(&id)
    };
    
    if let Some(child) = child_opt {
        // Get the process ID before killing
        let pid = child.pid();
        println!("[DEBUG] Killing process tree for ID: {}, PID: {}", id, pid);
        
        // On Windows, use taskkill to kill the entire process tree
        // The /T flag kills the process tree, /F forces termination
        #[cfg(target_os = "windows")]
        {
            let output = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
            
            match output {
                Ok(result) => {
                    if result.status.success() {
                        println!("[DEBUG] Successfully killed process tree for PID: {}", pid);
                    } else {
                        let stderr = String::from_utf8_lossy(&result.stderr);
                        println!("[ERROR] taskkill failed: {}", stderr);
                        // Fallback to regular kill
                        if let Err(e) = child.kill() {
                            println!("[ERROR] Fallback kill also failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    println!("[ERROR] Failed to execute taskkill: {}", e);
                    // Fallback to regular kill
                    if let Err(e) = child.kill() {
                        println!("[ERROR] Fallback kill also failed: {}", e);
                    }
                }
            }
        }
        
        // On non-Windows, just use the regular kill
        #[cfg(not(target_os = "windows"))]
        {
            if let Err(e) = child.kill() {
                println!("[ERROR] Failed to kill process: {}", e);
            }
        }
    } else {
        println!("[DEBUG] No active process found for ID: {}", id);
    }
    
    // Emit cancelled status
    let _ = app.emit("download-status", serde_json::json!({
        "id": id,
        "status": "cancelled"
    }));
    
    Ok(())
}

#[derive(Clone, Serialize, Debug)]
struct YtDlpVersionInfo {
    current_version: String,
    latest_version: String,
    update_available: bool,
}

/// Get the path to the bundled yt-dlp executable
fn get_ytdlp_path() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
    
    let target = tauri::utils::platform::target_triple().map_err(|e| e.to_string())?;
    let ytdlp_exe = format!("yt-dlp-{}.exe", target);
    
    let ytdlp_full_path = exe_dir.join(&ytdlp_exe);
    
    if ytdlp_full_path.exists() {
        Ok(ytdlp_full_path)
    } else {
        // Dev mode - check binaries folder
        let dev_path = std::path::PathBuf::from("src-tauri/binaries").join(&ytdlp_exe);
        if dev_path.exists() {
            Ok(dev_path.canonicalize().map_err(|e| e.to_string())?)
        } else {
            let alt_dev_path = std::path::PathBuf::from("binaries").join(&ytdlp_exe);
            if alt_dev_path.exists() {
                Ok(alt_dev_path.canonicalize().map_err(|e| e.to_string())?)
            } else {
                Err(format!("yt-dlp not found at {:?}", ytdlp_full_path))
            }
        }
    }
}

#[tauri::command]
async fn check_ytdlp_update(app: AppHandle) -> Result<YtDlpVersionInfo, String> {
    // Get current version from bundled yt-dlp
    let sidecar_command = app.shell().sidecar("yt-dlp").map_err(|e| e.to_string())?;
    
    let output = sidecar_command
        .args(vec!["--version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    
    let current_version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    // Fetch latest stable version from GitHub API
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
    
    let update_available = current_version != latest_version;
    
    Ok(YtDlpVersionInfo {
        current_version,
        latest_version,
        update_available,
    })
}

#[tauri::command]
async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    // Get the path where yt-dlp should be saved
    let ytdlp_path = get_ytdlp_path()?;
    
    println!("[DEBUG] Updating yt-dlp at: {:?}", ytdlp_path);
    
    // Download latest stable release from GitHub
    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    
    let client = reqwest::Client::new();
    let response = client
        .get(download_url)
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
    
    // Write to a temporary file first
    let temp_path = ytdlp_path.with_extension("exe.new");
    std::fs::write(&temp_path, &bytes)
        .map_err(|e| format!("Failed to write yt-dlp: {}", e))?;
    
    // Replace the old file with the new one
    // On Windows, we might need to rename the old file first if it's in use
    let backup_path = ytdlp_path.with_extension("exe.old");
    
    // Remove old backup if exists
    let _ = std::fs::remove_file(&backup_path);
    
    // Rename current to backup
    if ytdlp_path.exists() {
        std::fs::rename(&ytdlp_path, &backup_path)
            .map_err(|e| format!("Failed to backup old yt-dlp: {}", e))?;
    }
    
    // Rename new to current
    std::fs::rename(&temp_path, &ytdlp_path)
        .map_err(|e| format!("Failed to install new yt-dlp: {}", e))?;
    
    // Remove backup
    let _ = std::fs::remove_file(&backup_path);
    
    // Verify the new version
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![start_download, fetch_formats, fetch_playlist_info, cancel_download, check_ytdlp_update, update_ytdlp])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
