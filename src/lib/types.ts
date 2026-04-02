export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: "pending" | "downloading" | "completed" | "error" | "scheduled" | "cancelled";
  progress: number;
  speed: string;
  eta: string;
  size: string;
  logs: string[];
  isLogsOpen?: boolean;
  downloadPath?: string;
  completedAt?: string;
  format?: string;
  subtitles?: boolean;
  phase?: string;
  scheduledFor?: string;
}

export interface ProgressPayload {
  id: string;
  percentage: number;
  speed: string;
  eta: string;
  size: string;
  status: string;
  phase?: string;
}

export interface LogPayload {
  id: string;
  message: string;
  is_error?: boolean;
}

export interface TitlePayload {
  id: string;
  title: string;
}

export interface StatusPayload {
  id: string;
  status: "completed" | "error" | "cancelled";
}

export interface QualityOption {
  quality: string;
  height: number;
  video_size: number;
  audio_size: number;
  total_size: number;
  total_size_formatted: string;
  format_string: string;
  has_combined_audio: boolean;
  available: boolean;
}

export interface PlaylistVideo {
  id: string;
  title: string;
  url: string;
  duration?: number;
}

export interface PlaylistInfo {
  title: string;
  video_count: number;
  channel: string;
  description: string;
  entries: PlaylistVideo[];
}

export interface BatchQualityOption {
  id: string;
  label: string;
  format: string;
}

export interface QualityPreset {
  quality: string;
  label: string;
  format: string;
}

export interface ExtensionDownloadRequest {
  request_id: string;
  url: string;
  title?: string;
  source?: string;
  page_url?: string;
  format_string?: string;
  quality_label?: string;
  subtitles?: boolean;
}

export interface ExtensionBridgeInfo {
  endpoint: string;
  host: string;
  port: number;
  ready: boolean;
  error?: string | null;
}

export const MAX_LOG_LINES_PER_DOWNLOAD = 300;
export const PROGRESS_UPDATE_INTERVAL_MS = 150;
export const MIN_PROGRESS_DELTA = 0.25;
export const ITEMS_PER_PAGE = 5;
export const DEFAULT_BATCH_FORMAT_ID = "1080";
export const DEFAULT_FORMAT_STRING = "bv*[height<=1080]+ba/b[height<=1080]/best";

export const BATCH_QUALITY_OPTIONS: BatchQualityOption[] = [
  { id: "2160", label: "2160p (4K)", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
  { id: "1440", label: "1440p (2K)", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
  { id: "1080", label: "1080p (FHD)", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
  { id: "720", label: "720p (HD)", format: "bv*[height<=720]+ba/b[height<=720]/best" },
  { id: "480", label: "480p", format: "bv*[height<=480]+ba/b[height<=480]/best" },
  { id: "360", label: "360p", format: "bv*[height<=360]+ba/b[height<=360]/best" },
  { id: "240", label: "240p", format: "bv*[height<=240]+ba/b[height<=240]/best" },
  { id: "audio", label: "Audio Only (Best)", format: "ba/b" },
];

export const QUALITY_PRESETS: QualityPreset[] = [
  { quality: "2160p", label: "4K", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
  { quality: "1440p", label: "2K", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
  { quality: "1080p", label: "FHD", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
  { quality: "720p", label: "HD", format: "bv*[height<=720]+ba/b[height<=720]/best" },
  { quality: "480p", label: "SD", format: "bv*[height<=480]+ba/b[height<=480]/best" },
  { quality: "360p", label: "", format: "bv*[height<=360]+ba/b[height<=360]/best" },
  { quality: "240p", label: "", format: "bv*[height<=240]+ba/b[height<=240]/best" },
  { quality: "Audio", label: "Only", format: "ba/b" },
];

export const QUALITY_PRESETS_NO_AUDIO = QUALITY_PRESETS.filter((preset) => preset.format !== "ba/b");
export const PLAYLIST_QUALITY_PRESETS = QUALITY_PRESETS.filter((preset) => preset.quality !== "240p");

export function formatQualityLabel(format: string, withSubs: boolean): string {
  if (format === "ba/b") return "Audio Only";

  const match = format.match(/height<=(\d+)/);
  const resolution = match ? `${match[1]}p` : format;
  const labels: Record<string, string> = {
    "2160p": "4K",
    "1440p": "2K",
    "1080p": "FHD",
    "720p": "HD",
    "480p": "SD",
  };
  const tag = labels[resolution] ? ` (${labels[resolution]})` : "";

  return `${resolution}${tag}${withSubs ? " + subtitles" : ""}`;
}
