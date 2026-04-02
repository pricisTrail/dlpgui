use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ExtensionDownloadRequest {
    pub request_id: String,
    pub url: String,
    pub title: Option<String>,
    pub source: Option<String>,
    pub page_url: Option<String>,
    pub format_string: Option<String>,
    pub quality_label: Option<String>,
    pub subtitles: Option<bool>,
}

#[derive(Clone, Serialize, Debug)]
pub struct ExtensionBridgeInfo {
    pub endpoint: String,
    pub host: String,
    pub port: u16,
    pub ready: bool,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub percentage: f32,
    pub speed: String,
    pub eta: String,
    pub size: String,
    pub status: String,
    pub phase: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct QualityOption {
    pub quality: String,
    pub height: i32,
    pub video_size: u64,
    pub audio_size: u64,
    pub total_size: u64,
    pub total_size_formatted: String,
    pub format_string: String,
    pub has_combined_audio: bool,
    pub available: bool,
}

#[derive(Clone, Serialize, Debug)]
pub struct FormatsResponse {
    pub qualities: Vec<QualityOption>,
    pub best_audio_size: u64,
    pub best_audio_format_id: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct PlaylistVideo {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
}

#[derive(Clone, Serialize, Debug)]
pub struct PlaylistInfo {
    pub title: String,
    pub video_count: usize,
    pub channel: String,
    pub description: String,
    pub entries: Vec<PlaylistVideo>,
}

#[derive(Clone, Serialize, Debug)]
pub struct YtDlpVersionInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
}
