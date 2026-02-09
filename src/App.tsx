import { useState, useEffect, useRef } from "react";
import { Download, Link as LinkIcon, Settings, Folder, FileVideo, CheckCircle2, AlertCircle, Loader2, RefreshCw, HardDrive, Music, X, FolderOpen, Trash2, Clock, History, FileText, Calendar, List, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { downloadDir } from "@tauri-apps/api/path";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Pagination Component
function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  totalItems,
  itemsPerPage
}: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}) {
  if (totalPages <= 1) return null;
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-800 mt-3">
      <span className="text-xs text-slate-500">
        Showing {startItem}-{endItem} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            currentPage === 1 
              ? "text-slate-600 cursor-not-allowed" 
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              "w-7 h-7 text-xs rounded-lg transition-colors",
              page === currentPage
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
            )}
          >
            {page}
          </button>
        ))}
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            currentPage === totalPages 
              ? "text-slate-600 cursor-not-allowed" 
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'downloading' | 'completed' | 'error' | 'scheduled' | 'cancelled';
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
  phase?: string; // 'video' | 'audio' | 'merging' | 'processing'
  scheduledFor?: string; // ISO date string for scheduled downloads
}

interface ProgressPayload {
  id: string;
  percentage: number;
  speed: string;
  eta: string;
  size: string;
  status: string;
  phase?: string;
}

interface LogPayload {
  id: string;
  message: string;
  is_error?: boolean;
}

interface TitlePayload {
  id: string;
  title: string;
}

interface StatusPayload {
  id: string;
  status: 'completed' | 'error' | 'cancelled';
}

interface QualityOption {
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

interface PlaylistVideo {
  id: string;
  title: string;
  url: string;
  duration?: number;
}

interface PlaylistInfo {
  title: string;
  video_count: number;
  channel: string;
  description: string;
  entries: PlaylistVideo[];
}

interface BatchQualityOption {
  id: string;
  label: string;
  format: string;
}

const MAX_LOG_LINES_PER_DOWNLOAD = 300;
const PROGRESS_UPDATE_INTERVAL_MS = 150;
const MIN_PROGRESS_DELTA = 0.25;
const DEFAULT_BATCH_FORMAT_ID = "1080";
const BATCH_QUALITY_OPTIONS: BatchQualityOption[] = [
  { id: "2160", label: "2160p (4K)", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
  { id: "1440", label: "1440p (2K)", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
  { id: "1080", label: "1080p (FHD)", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
  { id: "720", label: "720p (HD)", format: "bv*[height<=720]+ba/b[height<=720]/best" },
  { id: "480", label: "480p", format: "bv*[height<=480]+ba/b[height<=480]/best" },
  { id: "360", label: "360p", format: "bv*[height<=360]+ba/b[height<=360]/best" },
  { id: "240", label: "240p", format: "bv*[height<=240]+ba/b[height<=240]/best" },
  { id: "audio", label: "Audio Only (Best)", format: "ba/b" },
];

export default function App() {
  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savePath, setSavePath] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [withSubtitles, setWithSubtitles] = useState(false);
  const [_formats, setFormats] = useState<QualityOption[]>([]);
  const [isFetchingFormats, _setIsFetchingFormats] = useState(false);
  const [formatsError, setFormatsError] = useState<string>("");
  const [lastFetchedUrl, setLastFetchedUrl] = useState<string>("");
  const [useAria2c, setUseAria2c] = useState(() => {
    const saved = localStorage.getItem('useAria2c');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [batchUrls, setBatchUrls] = useState<string[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQualityId, setBatchQualityId] = useState(DEFAULT_BATCH_FORMAT_ID);
  const [batchWithSubtitles, setBatchWithSubtitles] = useState(false);
  const defaultFormat = "bv*[height<=1080]+ba/b[height<=1080]/best";
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressUpdateTimesRef = useRef<Record<string, number>>({});
  
  // yt-dlp update state
  const [ytdlpVersion, setYtdlpVersion] = useState<string>("");
  const [ytdlpLatestVersion, setYtdlpLatestVersion] = useState<string>("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>("");
  const [autoUpdateYtdlp, setAutoUpdateYtdlp] = useState(() => {
    const saved = localStorage.getItem('autoUpdateYtdlp');
    return saved !== null ? JSON.parse(saved) : false;
  });
  
  // Pagination state
  const [downloadsPage, setDownloadsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Helper function to detect if URL is a playlist (not a video with playlist reference)
  const isPlaylistUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      // True playlist URLs have /playlist path with list parameter
      // e.g., https://www.youtube.com/playlist?list=PLxxxxxx
      if (urlObj.pathname === '/playlist' && urlObj.searchParams.has('list')) {
        return true;
      }
      // Video URLs with &list= are NOT playlists - they're videos within a playlist
      // e.g., https://www.youtube.com/watch?v=xxxxx&list=PLxxxxxx
      return false;
    } catch {
      return false;
    }
  };

  const getSelectedBatchQuality = (): BatchQualityOption => {
    return BATCH_QUALITY_OPTIONS.find(option => option.id === batchQualityId)
      || BATCH_QUALITY_OPTIONS.find(option => option.id === DEFAULT_BATCH_FORMAT_ID)
      || BATCH_QUALITY_OPTIONS[0];
  };
  const selectedBatchQuality = getSelectedBatchQuality();
  const isBatchAudioOnly = selectedBatchQuality.format === "ba/b";

  const handleBatchQualityChange = (qualityId: string) => {
    setBatchQualityId(qualityId);
    const quality = BATCH_QUALITY_OPTIONS.find(option => option.id === qualityId);
    if (quality?.format === "ba/b") {
      setBatchWithSubtitles(false);
    }
  };

  // Load persistent data on mount
  useEffect(() => {
    const savedPath = localStorage.getItem('downloadPath');
    const savedHistory = localStorage.getItem('downloadHistory');
    
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history:', e);
      }
    }

    const initPath = async () => {
      if (savedPath) {
        setSavePath(savedPath);
      } else {
        const dir = await downloadDir();
        setSavePath(dir);
      }
    };
    initPath();

    const unlistenProgress = listen<ProgressPayload>("download-progress", (event) => {
      const now = Date.now();
      const lastUpdate = progressUpdateTimesRef.current[event.payload.id] ?? 0;
      const isFinalStage = event.payload.percentage >= 99;
      if (!isFinalStage && now - lastUpdate < PROGRESS_UPDATE_INTERVAL_MS) return;

      progressUpdateTimesRef.current[event.payload.id] = now;

      setDownloads((prev) => {
        let changed = false;
        const next: DownloadItem[] = prev.map((item): DownloadItem => {
          if (item.id !== event.payload.id) return item;

          const progressChanged = Math.abs(item.progress - event.payload.percentage) >= MIN_PROGRESS_DELTA;
          const speedChanged = item.speed !== event.payload.speed;
          const etaChanged = item.eta !== event.payload.eta;
          const sizeChanged = item.size !== event.payload.size;
          const phaseChanged = item.phase !== event.payload.phase;
          const statusChanged = item.status !== 'downloading';

          if (!progressChanged && !speedChanged && !etaChanged && !sizeChanged && !phaseChanged && !statusChanged) {
            return item;
          }

          changed = true;
          return {
            ...item,
            progress: event.payload.percentage,
            speed: event.payload.speed,
            eta: event.payload.eta,
            size: event.payload.size,
            status: 'downloading',
            phase: event.payload.phase,
          };
        });
        return changed ? next : prev;
      });
    });

    const unlistenLogs = listen<LogPayload>("download-log", (event) => {
      const message = event.payload.message?.trim();
      if (!message) return;

      setDownloads((prev) => 
        prev.map((item) => 
          item.id === event.payload.id 
            ? (() => {
                const currentLogs = item.logs || [];
                if (currentLogs[currentLogs.length - 1] === message) {
                  return item;
                }

                const nextLogs = [...currentLogs, message];
                const logs = nextLogs.length > MAX_LOG_LINES_PER_DOWNLOAD
                  ? nextLogs.slice(-MAX_LOG_LINES_PER_DOWNLOAD)
                  : nextLogs;

                return { ...item, logs };
              })()
            : item
        )
      );
    });
    
    const unlistenTitle = listen<TitlePayload>("download-title", (event) => {
      setDownloads((prev) => 
        prev.map((item) => 
          item.id === event.payload.id 
            ? { ...item, title: event.payload.title }
            : item
        )
      );
    });

    const unlistenStatus = listen<StatusPayload>("download-status", (event) => {
      delete progressUpdateTimesRef.current[event.payload.id];
      setDownloads((prev) =>
        prev.map((item) =>
          item.id === event.payload.id
            ? { 
                ...item, 
                status: event.payload.status, 
                progress: event.payload.status === 'completed' ? 100 : item.progress,
                isLogsOpen: event.payload.status === 'error' ? true : item.isLogsOpen
              }
            : item
        )
      );
    });

    return () => {
      unlistenProgress.then((u) => u());
      unlistenStatus.then((u) => u());
      unlistenLogs.then((u) => u());
      unlistenTitle.then((u) => u());
    };
  }, []);

  const selectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: savePath,
    });
    if (selected && typeof selected === 'string') {
      setSavePath(selected);
      localStorage.setItem('downloadPath', selected);
    }
  };

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('useAria2c', JSON.stringify(useAria2c));
  }, [useAria2c]);

  useEffect(() => {
    localStorage.setItem('autoUpdateYtdlp', JSON.stringify(autoUpdateYtdlp));
  }, [autoUpdateYtdlp]);

  // Auto-fetch formats when URL is pasted (with debounce)
  useEffect(() => {
    if (!url || isBatchMode) return;
    if (url === lastFetchedUrl) return; // Already fetched
    if (isFetchingFormats || isFetchingPlaylist) return; // Already fetching
    
    // Check if URL looks valid (starts with http)
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    
    const timer = setTimeout(() => {
      fetchFormats(url);
    }, 800); // 800ms debounce
    
    return () => clearTimeout(timer);
  }, [url, lastFetchedUrl, isBatchMode, isFetchingFormats, isFetchingPlaylist]);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('downloadHistory', JSON.stringify(history));
    }
  }, [history]);

  // Move completed/error/cancelled downloads to history
  useEffect(() => {
    const completed = downloads.filter(d => d.status === 'completed' || d.status === 'error' || d.status === 'cancelled');
    if (completed.length > 0) {
      const updatedCompleted = completed.map(d => ({
        ...d,
        completedAt: d.completedAt || new Date().toISOString(),
        downloadPath: savePath
      }));
      setHistory(prev => {
        const existingIds = new Set(prev.map(h => h.id));
        const newItems = updatedCompleted.filter(d => !existingIds.has(d.id));
        return [...newItems, ...prev].slice(0, 100); // Keep last 100 items
      });
      // Remove completed/cancelled from active downloads
      setDownloads(prev => prev.filter(d => d.status !== 'completed' && d.status !== 'error' && d.status !== 'cancelled'));
    }
  }, [downloads, savePath]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('downloadHistory');
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  const openFolder = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  };

  // Handle TXT file import
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line && (line.startsWith('http://') || line.startsWith('https://')));
    
    if (lines.length > 0) {
      setBatchUrls(lines);
      setIsBatchMode(true);
      setFormats([]); // Disable format fetching for batch
      setSelectedFormat("");
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Start batch downloads
  const startBatchDownload = async () => {
    if (batchUrls.length === 0) return;
    
    setIsProcessing(true);
    const batchQuality = getSelectedBatchQuality();
    const formatToUse = batchQuality.format;
    const subtitlesToUse = batchQuality.format === "ba/b" ? false : batchWithSubtitles;

    for (const batchUrl of batchUrls) {
      const id = Math.random().toString(36).substring(7);
      
      const newDownload: DownloadItem = {
        id,
        url: batchUrl,
        title: batchUrl.split('/').pop() || "Video",
        status: 'pending',
        progress: 0,
        speed: "0 KB/s",
        eta: "N/A",
        size: "Unknown",
        logs: [],
        isLogsOpen: false,
        format: formatToUse,
        subtitles: subtitlesToUse
      };

      setDownloads(prev => [newDownload, ...prev]);

      try {
        await invoke("start_download", {
          id,
          url: batchUrl,
          downloadDir: savePath,
          formatString: formatToUse,
          subtitles: subtitlesToUse,
          useAria2c: useAria2c,
        });
      } catch (error) {
        console.error("Failed to start download:", error);
        setDownloads((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: 'error' } : item
          )
        );
      }
    }

    setBatchUrls([]);
    setIsBatchMode(false);
    setIsProcessing(false);
  };

  // Schedule download
  const scheduleDownload = () => {
    if (!url && batchUrls.length === 0) return;
    
    const batchQuality = getSelectedBatchQuality();
    const urlsToSchedule = isBatchMode ? batchUrls : [url];
    const formatToUse = isBatchMode ? batchQuality.format : (selectedFormat || defaultFormat);
    const subtitlesToUse = isBatchMode ? (batchQuality.format === "ba/b" ? false : batchWithSubtitles) : withSubtitles;

    for (const scheduleUrl of urlsToSchedule) {
      const id = Math.random().toString(36).substring(7);
      
      const newDownload: DownloadItem = {
        id,
        url: scheduleUrl,
        title: scheduleUrl.split('/').pop() || "Scheduled Video",
        status: 'scheduled',
        progress: 0,
        speed: "0 KB/s",
        eta: "N/A",
        size: "Unknown",
        logs: [],
        isLogsOpen: false,
        format: formatToUse,
        subtitles: subtitlesToUse,
        scheduledFor: scheduledTime
      };

      setDownloads(prev => [newDownload, ...prev]);
    }

    // Clear inputs
    setUrl("");
    setBatchUrls([]);
    setIsBatchMode(false);
    setIsScheduleModalOpen(false);
    setScheduledTime("");
  };

  // Check and start scheduled downloads
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      
      setDownloads(prev => {
        const updated = [...prev];
        let hasChanges = false;

        updated.forEach(async (item, index) => {
          if (item.status === 'scheduled' && item.scheduledFor) {
            const scheduledDate = new Date(item.scheduledFor);
            if (now >= scheduledDate) {
              hasChanges = true;
              updated[index] = { ...item, status: 'pending' };
              
              // Start the download
              try {
                await invoke("start_download", {
                  id: item.id,
                  url: item.url,
                  downloadDir: savePath,
                  formatString: item.format || defaultFormat,
                  subtitles: item.subtitles ?? withSubtitles,
                  useAria2c: useAria2c,
                });
              } catch (error) {
                console.error("Failed to start scheduled download:", error);
              }
            }
          }
        });

        return hasChanges ? updated : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [savePath, withSubtitles, useAria2c, defaultFormat]);

  const fetchFormats = async (videoUrl: string) => {
    if (!videoUrl || videoUrl === lastFetchedUrl || isBatchMode) return;
    
    // Check if URL is a playlist
    if (isPlaylistUrl(videoUrl)) {
      setIsPlaylist(true);
      setIsFetchingPlaylist(true);
      setFormats([]);
      setSelectedFormat("");
      setWithSubtitles(false);
      setFormatsError("");
      
      try {
        const info = await invoke<PlaylistInfo>("fetch_playlist_info", { url: videoUrl });
        setPlaylistInfo(info);
        setLastFetchedUrl(videoUrl);
      } catch (error) {
        console.error("Failed to fetch playlist info:", error);
        setFormatsError(String(error));
        setPlaylistInfo(null);
      } finally {
        setIsFetchingPlaylist(false);
      }
      return;
    }
    
    // Regular video URL - use quick preset formats instead of fetching
    // This is much faster than calling yt-dlp -J
    setIsPlaylist(false);
    setPlaylistInfo(null);
    setFormats([]);
    setSelectedFormat("");
    setWithSubtitles(false);
    setFormatsError("");
    setLastFetchedUrl(videoUrl);
    
    // Use predefined quality options - no need to fetch from yt-dlp
    // yt-dlp will automatically select the best available format within constraints
  };

  const checkYtdlpUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError("");
    try {
      const result = await invoke<{
        current_version: string;
        latest_version: string;
        update_available: boolean;
      }>("check_ytdlp_update");
      setYtdlpVersion(result.current_version);
      setYtdlpLatestVersion(result.latest_version);
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateError(String(error));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const updateYtdlp = async () => {
    setIsUpdating(true);
    setUpdateError("");
    try {
      const newVersion = await invoke<string>("update_ytdlp");
      setYtdlpVersion(newVersion);
      setYtdlpLatestVersion(newVersion);
    } catch (error) {
      console.error("Failed to update yt-dlp:", error);
      setUpdateError(String(error));
    } finally {
      setIsUpdating(false);
    }
  };

  // Auto-update yt-dlp on app startup if enabled
  useEffect(() => {
    const autoUpdate = async () => {
      if (!autoUpdateYtdlp) return;
      
      try {
        // First check for updates
        const result = await invoke<{
          current_version: string;
          latest_version: string;
          update_available: boolean;
        }>("check_ytdlp_update");
        
        setYtdlpVersion(result.current_version);
        setYtdlpLatestVersion(result.latest_version);
        
        // If update available, automatically update
        if (result.update_available) {
          console.log(`Auto-updating yt-dlp from ${result.current_version} to ${result.latest_version}`);
          const newVersion = await invoke<string>("update_ytdlp");
          setYtdlpVersion(newVersion);
          setYtdlpLatestVersion(newVersion);
        }
      } catch (error) {
        console.error("Auto-update failed:", error);
      }
    };
    
    autoUpdate();
  }, []); // Only run once on mount

  const cancelDownload = async (downloadId: string) => {
    try {
      await invoke("cancel_download", { id: downloadId });
    } catch (error) {
      console.error("Failed to cancel download:", error);
      // Still remove from UI even if backend fails
      setDownloads(prev => prev.filter(d => d.id !== downloadId));
    }
  };

  const addDownload = async () => {
    if (!url || !selectedFormat) return;
    
    // Use selected format (required)
    const formatToUse = selectedFormat;
    
    // Debug: log what format is being used
    console.log("Starting download with format:", formatToUse);
    console.log("Selected format was:", selectedFormat);
    console.log("With subtitles:", withSubtitles);
    console.log("Is playlist:", isPlaylist);
    
    setIsProcessing(true);

    // Handle playlist downloads - create separate download for each video
    if (isPlaylist && playlistInfo && playlistInfo.entries.length > 0) {
      const newDownloads: DownloadItem[] = [];
      
      for (const video of playlistInfo.entries) {
        const id = Math.random().toString(36).substring(7);
        
        const newDownload: DownloadItem = {
          id,
          url: video.url,
          title: video.title,
          status: 'pending',
          progress: 0,
          speed: "0 KB/s",
          eta: "N/A",
          size: "Unknown",
          logs: [],
          isLogsOpen: false
        };
        
        newDownloads.push(newDownload);
      }
      
      // Add all downloads to state
      setDownloads(prev => [...newDownloads, ...prev]);
      
      // Clear inputs
      setUrl("");
      setFormats([]);
      setSelectedFormat("");
      setWithSubtitles(false);
      setLastFetchedUrl("");
      setIsPlaylist(false);
      setPlaylistInfo(null);
      
      // Start downloads sequentially to avoid overwhelming the system
      for (const download of newDownloads) {
        try {
          await invoke("start_download", {
            id: download.id,
            url: download.url,
            downloadDir: savePath,
            formatString: formatToUse,
            subtitles: withSubtitles,
            useAria2c: useAria2c,
          });
        } catch (error) {
          console.error("Failed to start download:", error);
          setDownloads((prev) =>
            prev.map((item) =>
              item.id === download.id ? { ...item, status: 'error' } : item
            )
          );
        }
      }
      
      setIsProcessing(false);
      return;
    }
    
    // Single video download
    const id = Math.random().toString(36).substring(7);
    
    const newDownload: DownloadItem = {
      id,
      url,
      title: url.split('/').pop() || "Video",
      status: 'pending',
      progress: 0,
      speed: "0 KB/s",
      eta: "N/A",
      size: "Unknown",
      logs: [],
      isLogsOpen: false
    };

    setDownloads([newDownload, ...downloads]);
    setUrl("");
    setFormats([]);
    setSelectedFormat("");
    setWithSubtitles(false);
    setLastFetchedUrl("");
    setIsPlaylist(false);
    setPlaylistInfo(null);

    try {
      await invoke("start_download", {
        id,
        url,
        downloadDir: savePath,
        formatString: formatToUse,
        subtitles: withSubtitles,
        useAria2c: useAria2c,
      });
    } catch (error) {
      console.error("Failed to start download:", error);
      setDownloads((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: 'error' } : item
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col w-full">
      {/* Header */}
      <header className="p-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Download className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">yt-dlp GUI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
              <Folder className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-300 max-w-[200px] truncate">{savePath}</span>
              <button 
                onClick={() => openFolder(savePath)}
                className="ml-1 p-1 hover:bg-slate-700 rounded transition-colors"
                title="Open folder"
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button 
                onClick={selectFolder}
                className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded transition-colors"
              >
                Change
              </button>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              <Settings className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-8">
        {/* Input Section */}
        <section className="space-y-4">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".txt"
            onChange={handleFileImport}
            className="hidden"
          />

          {!isBatchMode ? (
            /* Single URL Input */
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <LinkIcon className="w-5 h-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Paste video or playlist URL here..."
                value={url}
                onChange={(e) => {
                  const newUrl = e.target.value;
                  setUrl(newUrl);
                  // Reset states when URL changes
                  if (newUrl !== lastFetchedUrl) {
                    setFormats([]);
                    setSelectedFormat("");
                    setWithSubtitles(false);
                    setFormatsError("");
                    setIsPlaylist(false);
                    setPlaylistInfo(null);
                  }
                }}
                onKeyDown={(e) => e.key === 'Enter' && selectedFormat && addDownload()}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-4 pl-12 pr-[340px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-lg"
              />
              <div className="absolute right-2 top-2 bottom-2 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                  title="Import URLs from TXT file"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsScheduleModalOpen(true)}
                  disabled={!url || !selectedFormat}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                  title="Schedule download"
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  onClick={addDownload}
                  disabled={!url || !selectedFormat || isProcessing}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-lg font-medium transition-colors flex items-center gap-2"
                  title={!selectedFormat ? "Select a format first" : "Download"}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download
                </button>
              </div>
            </div>
          ) : (
            /* Batch Mode UI */
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <List className="w-5 h-5 text-indigo-400" />
                  <span className="font-medium">Batch Download Mode</span>
                  <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                    {batchUrls.length} URLs
                  </span>
                </div>
                <button
                  onClick={() => {
                    setBatchUrls([]);
                    setIsBatchMode(false);
                  }}
                  className="text-slate-400 hover:text-slate-300 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* URL Preview */}
              <div className="bg-slate-800/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                {batchUrls.slice(0, 5).map((bUrl, i) => (
                  <div key={i} className="text-xs text-slate-400 truncate py-0.5">
                    {i + 1}. {bUrl}
                  </div>
                ))}
                {batchUrls.length > 5 && (
                  <div className="text-xs text-slate-500 mt-1">
                    ... and {batchUrls.length - 5} more
                  </div>
                )}
              </div>

              {/* Default Format Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Default Quality:</span>
                  <select
                    value={batchQualityId}
                    onChange={(e) => handleBatchQualityChange(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    {BATCH_QUALITY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">Subtitles:</span>
                  <select
                    value={batchWithSubtitles ? "with" : "without"}
                    onChange={(e) => setBatchWithSubtitles(e.target.value === "with")}
                    disabled={isBatchAudioOnly}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                  >
                    <option value="without">No subtitles</option>
                    <option value="with">With subtitles</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule All
                </button>
                <button
                  onClick={startBatchDownload}
                  disabled={isProcessing}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Start All ({batchUrls.length})
                </button>
              </div>
            </div>
          )}

          {/* Playlist Loading */}
          {isFetchingPlaylist && (
            <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching playlist info...
            </div>
          )}

          {/* Playlist Info Display */}
          {isPlaylist && playlistInfo && !isFetchingPlaylist && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/30 rounded-xl p-4 space-y-4">
              <div className="flex items-start gap-4">
                <div className="bg-violet-500/20 p-3 rounded-lg">
                  <List className="w-6 h-6 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-200 truncate">{playlistInfo.title}</h3>
                  <p className="text-sm text-slate-400">{playlistInfo.channel}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="bg-violet-500/20 text-violet-400 px-3 py-1 rounded-full text-sm font-medium">
                      {playlistInfo.video_count} videos
                    </span>
                    <span className="text-slate-500 text-sm">Playlist detected</span>
                  </div>
                </div>
              </div>
              
              {/* Quality Selection for Playlist */}
              <div className="space-y-3 pt-2 border-t border-slate-700/50">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <HardDrive className="w-4 h-4" />
                  <span>Select quality for all videos:</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[
                    { quality: "2160p", label: "4K", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
                    { quality: "1440p", label: "2K", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
                    { quality: "1080p", label: "FHD", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
                    { quality: "720p", label: "HD", format: "bv*[height<=720]+ba/b[height<=720]/best" },
                    { quality: "480p", label: "SD", format: "bv*[height<=480]+ba/b[height<=480]/best" },
                    { quality: "360p", label: "", format: "bv*[height<=360]+ba/b[height<=360]/best" },
                    { quality: "Audio", label: "Only", format: "ba/b" },
                  ].map((option) => (
                    <button
                      key={option.quality}
                      onClick={() => {
                        setSelectedFormat(option.format);
                        setWithSubtitles(false);
                      }}
                      className={cn(
                        "p-3 rounded-lg border text-center transition-all duration-200",
                        selectedFormat === option.format
                          ? "bg-violet-500/20 border-violet-500 text-violet-300"
                          : "bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300"
                      )}
                    >
                      <div className="font-semibold text-sm">{option.quality}</div>
                      {option.label && <div className="text-[10px] opacity-75">{option.label}</div>}
                    </button>
                  ))}
                </div>
                
                {/* Subtitles Option for Playlist */}
                {selectedFormat && selectedFormat !== "ba/b" && (
                  <div className="flex items-center gap-3 pt-2">
                    <button 
                      onClick={() => setWithSubtitles(!withSubtitles)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200",
                        withSubtitles 
                          ? "bg-violet-500/20 border-violet-500 text-violet-300" 
                          : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                        withSubtitles ? "bg-violet-500 border-violet-500" : "border-slate-600"
                      )}>
                        {withSubtitles && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      Include Subtitles
                    </button>
                    <span className="text-xs text-slate-500">
                      Embed subtitles in all videos
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Format Selection Grid */}
          {isFetchingFormats && (
            <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching available formats...
            </div>
          )}
          
          {formatsError && (
            <div className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {formatsError}
            </div>
          )}

          {/* Quick Quality Selection for Videos */}
          {!isPlaylist && !isBatchMode && url && lastFetchedUrl && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <HardDrive className="w-4 h-4" />
                <span>Select quality:</span>
              </div>
              
              {/* Quality Options */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[
                  { quality: "2160p", label: "4K", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
                  { quality: "1440p", label: "2K", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
                  { quality: "1080p", label: "FHD", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
                  { quality: "720p", label: "HD", format: "bv*[height<=720]+ba/b[height<=720]/best" },
                  { quality: "480p", label: "SD", format: "bv*[height<=480]+ba/b[height<=480]/best" },
                  { quality: "360p", label: "", format: "bv*[height<=360]+ba/b[height<=360]/best" },
                  { quality: "240p", label: "", format: "bv*[height<=240]+ba/b[height<=240]/best" },
                  { quality: "Audio", label: "Only", format: "ba/b" },
                ].map((option) => (
                  <button
                    key={option.quality}
                    onClick={() => {
                      setSelectedFormat(option.format);
                      setWithSubtitles(false);
                    }}
                    className={cn(
                      "p-3 rounded-lg border text-center transition-all duration-200",
                      selectedFormat === option.format && !withSubtitles
                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                        : "bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300"
                    )}
                  >
                    <div className="font-semibold text-sm">{option.quality}</div>
                    {option.label && <div className="text-[10px] opacity-75">{option.label}</div>}
                  </button>
                ))}
              </div>

              {/* With Subtitles Options */}
              {selectedFormat && selectedFormat !== "ba/b" && (
                <>
                  <div className="flex items-center gap-2 text-sm text-slate-400 mt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Or with subtitles:</span>
                  </div>
                  
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {[
                      { quality: "2160p", label: "4K", format: "bv*[height<=2160]+ba/b[height<=2160]/best" },
                      { quality: "1440p", label: "2K", format: "bv*[height<=1440]+ba/b[height<=1440]/best" },
                      { quality: "1080p", label: "FHD", format: "bv*[height<=1080]+ba/b[height<=1080]/best" },
                      { quality: "720p", label: "HD", format: "bv*[height<=720]+ba/b[height<=720]/best" },
                      { quality: "480p", label: "SD", format: "bv*[height<=480]+ba/b[height<=480]/best" },
                      { quality: "360p", label: "", format: "bv*[height<=360]+ba/b[height<=360]/best" },
                      { quality: "240p", label: "", format: "bv*[height<=240]+ba/b[height<=240]/best" },
                    ].map((option) => (
                      <button
                        key={`${option.quality}-sub`}
                        onClick={() => {
                          setSelectedFormat(option.format);
                          setWithSubtitles(true);
                        }}
                        className={cn(
                          "p-3 rounded-lg border text-center transition-all duration-200",
                          selectedFormat === option.format && withSubtitles
                            ? "bg-violet-500/20 border-violet-500 text-violet-300"
                            : "bg-slate-900 border-slate-700 hover:border-slate-600 text-slate-300"
                        )}
                      >
                        <div className="font-semibold text-sm">{option.quality}</div>
                        <div className="text-[10px] text-violet-400">+ subs</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* No URL entered hint */}
          {!url && !isBatchMode && (
            <div className="text-sm text-slate-500 text-center py-2">
              Paste a video or playlist URL above to get started
            </div>
          )}

          {/* Selected format indicator */}
          {selectedFormat && url && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>Selected:</span>
              <code className="bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                {selectedFormat === "ba/b" ? "🎵 Audio Only" : 
                  (selectedFormat.includes("2160") ? "2160p (4K)" :
                   selectedFormat.includes("1440") ? "1440p (2K)" :
                   selectedFormat.includes("1080") ? "1080p (FHD)" :
                   selectedFormat.includes("720") ? "720p (HD)" :
                   selectedFormat.includes("480") ? "480p" :
                   selectedFormat.includes("360") ? "360p" :
                   selectedFormat.includes("240") ? "240p" : selectedFormat)}
                {withSubtitles && " + subtitles"}
              </code>
            </div>
          )}
        </section>

        {/* Downloads List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setShowHistory(false); setDownloadsPage(1); }}
                className={cn(
                  "text-sm font-semibold uppercase tracking-wider transition-colors",
                  !showHistory ? "text-indigo-400" : "text-slate-500 hover:text-slate-400"
                )}
              >
                Active Downloads
              </button>
              <button
                onClick={() => { setShowHistory(true); setHistoryPage(1); }}
                className={cn(
                  "text-sm font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5",
                  showHistory ? "text-indigo-400" : "text-slate-500 hover:text-slate-400"
                )}
              >
                <History className="w-4 h-4" />
                History
              </button>
            </div>
            <div className="flex items-center gap-2">
              {showHistory && history.length > 0 && (
                <button
                  onClick={() => { clearHistory(); setHistoryPage(1); }}
                  className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </button>
              )}
              <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">
                {showHistory ? history.length : downloads.filter(d => d.status === 'pending' || d.status === 'downloading' || d.status === 'scheduled').length} items
              </span>
            </div>
          </div>

          {!showHistory ? (
            /* Active Downloads */
            <div className="space-y-3">
              {/* Scheduled Downloads - Always pinned to top */}
              {downloads.filter(d => d.status === 'scheduled').length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <Calendar className="w-3 h-3" />
                    <span className="uppercase tracking-wider font-medium">Scheduled ({downloads.filter(d => d.status === 'scheduled').length})</span>
                  </div>
                  {downloads.filter(d => d.status === 'scheduled').map((item) => (
                    <div key={item.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 hover:border-amber-500/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-500/10 p-2 rounded-lg">
                          <Calendar className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate">{item.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <Clock className="w-3 h-3" />
                            <span>
                              {item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setDownloads(prev => prev.filter(d => d.id !== item.id))}
                          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Cancel scheduled download"
                        >
                          <X className="w-4 h-4 text-slate-400 hover:text-rose-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active/Pending Downloads with pagination */}
              {(() => {
                const activeDownloads = downloads.filter(d => d.status === 'pending' || d.status === 'downloading');
                const totalPages = Math.ceil(activeDownloads.length / ITEMS_PER_PAGE);
                const paginatedDownloads = activeDownloads.slice(
                  (downloadsPage - 1) * ITEMS_PER_PAGE,
                  downloadsPage * ITEMS_PER_PAGE
                );
                
                if (activeDownloads.length === 0 && downloads.filter(d => d.status === 'scheduled').length === 0) {
                  return (
                    <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl">
                      <FileVideo className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                      <p className="text-slate-500">No active downloads. Paste a URL to start.</p>
                    </div>
                  );
                }
                
                if (activeDownloads.length === 0) return null;
                
                return (
                  <>
                    {activeDownloads.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-indigo-400 mb-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="uppercase tracking-wider font-medium">Active ({activeDownloads.length})</span>
                      </div>
                    )}
                    {paginatedDownloads.map((item) => (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="bg-slate-800 p-3 rounded-lg">
                        {item.phase === 'audio' ? (
                          <Music className="w-6 h-6 text-emerald-400" />
                        ) : item.phase === 'merging' || item.phase === 'processing' ? (
                          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                        ) : (
                          <FileVideo className="w-6 h-6 text-indigo-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-medium truncate pr-4">{item.title}</h3>
                          <div className="flex items-center gap-2">
                            {item.phase && item.status === 'downloading' && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase",
                                item.phase === 'video' && "bg-indigo-500/20 text-indigo-400",
                                item.phase === 'audio' && "bg-emerald-500/20 text-emerald-400",
                                item.phase === 'merging' && "bg-amber-500/20 text-amber-400",
                                item.phase === 'processing' && "bg-purple-500/20 text-purple-400",
                              )}>
                                {item.phase}
                              </span>
                            )}
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium",
                              item.status === 'downloading' && "bg-indigo-500/10 text-indigo-400",
                              item.status === 'pending' && "bg-slate-800 text-slate-400",
                            )}>
                              {item.status.toUpperCase()}
                            </span>
                            <button
                              onClick={() => cancelDownload(item.id)}
                              className="p-1 hover:bg-rose-500/20 rounded transition-colors group"
                              title="Cancel download"
                            >
                              <X className="w-4 h-4 text-slate-500 group-hover:text-rose-400" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-3 relative">
                          {/* Video portion (0-50%) */}
                          <div 
                            className={cn(
                              "absolute h-full transition-all duration-300",
                              item.phase === 'video' ? "bg-indigo-500" : "bg-indigo-600"
                            )}
                            style={{ width: `${Math.min(item.progress, 50)}%` }}
                          />
                          {/* Audio portion (50-95%) */}
                          {item.progress > 50 && (
                            <div 
                              className="absolute h-full bg-emerald-500 transition-all duration-300"
                              style={{ left: '50%', width: `${Math.min(item.progress - 50, 45)}%` }}
                            />
                          )}
                          {/* Merging/Processing portion (95-100%) */}
                          {item.progress > 95 && (
                            <div 
                              className="absolute h-full bg-amber-500 transition-all duration-300"
                              style={{ left: '95%', width: `${Math.min(item.progress - 95, 5)}%` }}
                            />
                          )}
                          {/* Phase indicator marks */}
                          <div className="absolute h-full w-px bg-slate-700" style={{ left: '50%' }} />
                          <div className="absolute h-full w-px bg-slate-700" style={{ left: '95%' }} />
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center gap-4">
                            <span className="font-mono">{Math.round(item.progress)}%</span>
                            {item.speed && item.speed !== '...' && <span>{item.speed}</span>}
                            {item.size && <span>{item.size}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            {item.eta && item.eta !== '...' && <span>ETA: {item.eta}</span>}
                            <button 
                              onClick={() => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, isLogsOpen: !d.isLogsOpen } : d))}
                              className="text-indigo-400 hover:text-indigo-300 underline"
                            >
                              {item.isLogsOpen ? "Hide Logs" : "Show Logs"}
                            </button>
                          </div>
                        </div>
                        
                        {item.isLogsOpen && (
                          <div className="mt-3 p-3 bg-black/50 rounded-lg font-mono text-[10px] text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {item.logs?.join('\n') || "No logs yet..."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                    
                    {/* Pagination for active downloads */}
                    <Pagination
                      currentPage={downloadsPage}
                      totalPages={totalPages}
                      onPageChange={setDownloadsPage}
                      totalItems={activeDownloads.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                    />
                  </>
                );
              })()}
            </div>
          ) : (
            /* History with pagination */
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-2xl">
                  <History className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500">No download history yet.</p>
                </div>
              ) : (
                (() => {
                  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE);
                  const paginatedHistory = history.slice(
                    (historyPage - 1) * ITEMS_PER_PAGE,
                    historyPage * ITEMS_PER_PAGE
                  );
                  
                  return (
                    <>
                      {paginatedHistory.map((item) => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "bg-slate-900 border rounded-lg p-3 hover:border-slate-600 transition-colors group",
                      item.status === 'completed' ? "border-slate-800" : 
                      item.status === 'cancelled' ? "border-amber-500/30" : "border-rose-500/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        item.status === 'completed' ? "bg-emerald-500/10" : 
                        item.status === 'cancelled' ? "bg-amber-500/10" : "bg-rose-500/10"
                      )}>
                        {item.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : item.status === 'cancelled' ? (
                          <X className="w-5 h-5 text-amber-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-rose-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{item.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Unknown'}</span>
                          {item.status === 'cancelled' && (
                            <>
                              <span>•</span>
                              <span className="text-amber-500">Cancelled</span>
                            </>
                          )}
                          {item.size && item.size !== 'Unknown' && (
                            <>
                              <span>•</span>
                              <span>{item.size}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.logs && item.logs.length > 0 && (
                          <button
                            onClick={() => setHistory(prev => prev.map(h => h.id === item.id ? { ...h, isLogsOpen: !h.isLogsOpen } : h))}
                            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                            title="View logs"
                          >
                            <FileText className="w-4 h-4 text-slate-400 hover:text-indigo-400" />
                          </button>
                        )}
                        {item.status === 'completed' && item.downloadPath && (
                          <button
                            onClick={() => openFolder(item.downloadPath!)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Open folder"
                          >
                            <FolderOpen className="w-4 h-4 text-slate-400 hover:text-indigo-400" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFromHistory(item.id)}
                          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Remove from history"
                        >
                          <X className="w-4 h-4 text-slate-400 hover:text-rose-400" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Logs section for history items */}
                    {item.isLogsOpen && item.logs && item.logs.length > 0 && (
                      <div className="mt-3 p-3 bg-black/50 rounded-lg font-mono text-[10px] text-slate-400 max-h-48 overflow-y-auto whitespace-pre-wrap border border-slate-700">
                        <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                          <span>{item.logs.length} log entries</span>
                          <button 
                            onClick={() => setHistory(prev => prev.map(h => h.id === item.id ? { ...h, isLogsOpen: false } : h))}
                            className="text-slate-500 hover:text-slate-400"
                          >
                            Close
                          </button>
                        </div>
                        {item.logs.map((log, i) => (
                          <div key={i} className={cn(
                            "py-0.5",
                            log.toLowerCase().includes('error') || log.toLowerCase().includes('warning') 
                              ? "text-amber-400" 
                              : "text-slate-400"
                          )}>
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                      
                      {/* Pagination for history */}
                      <Pagination
                        currentPage={historyPage}
                        totalPages={totalHistoryPages}
                        onPageChange={setHistoryPage}
                        totalItems={history.length}
                        itemsPerPage={ITEMS_PER_PAGE}
                      />
                    </>
                  );
                })()
              )}
            </div>
          )}
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="p-4 border-t border-slate-800 bg-slate-900/30 text-[10px] text-slate-600 text-center">
        Powered by yt-dlp & Tauri • Built with Bun & Rust
      </footer>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Settings
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* aria2c Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex-1">
                  <div className="font-medium text-sm">Use aria2c Downloader</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Faster downloads with 16 parallel connections. Requires aria2c installed.
                  </div>
                </div>
                <button
                  onClick={() => setUseAria2c(!useAria2c)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    useAria2c ? "bg-indigo-600" : "bg-slate-700"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    useAria2c ? "translate-x-7" : "translate-x-1"
                  )} />
                </button>
              </div>
              
              {/* aria2c Info */}
              {useAria2c && (
                <div className="text-xs text-slate-500 bg-slate-800/30 rounded-lg p-3 border border-slate-800">
                  <div className="font-medium text-slate-400 mb-1">aria2c settings applied:</div>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>16 connections per server (-x16)</li>
                    <li>16-way file splitting (-s16)</li>
                    <li>1MB minimum split size (-k1M)</li>
                    <li>Fast file allocation mode</li>
                  </ul>
                </div>
              )}
              
              {/* yt-dlp Update Section */}
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm">yt-dlp Version</div>
                  <button
                    onClick={checkYtdlpUpdate}
                    disabled={isCheckingUpdate}
                    className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    {isCheckingUpdate ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        Check for updates
                      </span>
                    )}
                  </button>
                </div>
                
                {ytdlpVersion && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Current:</span>
                      <span className="text-slate-300 font-mono">{ytdlpVersion}</span>
                    </div>
                    {ytdlpLatestVersion && ytdlpLatestVersion !== ytdlpVersion && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Latest:</span>
                          <span className="text-emerald-400 font-mono">{ytdlpLatestVersion}</span>
                        </div>
                        <button
                          onClick={updateYtdlp}
                          disabled={isUpdating}
                          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {isUpdating ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              Update to {ytdlpLatestVersion}
                            </>
                          )}
                        </button>
                      </>
                    )}
                    {ytdlpLatestVersion && ytdlpLatestVersion === ytdlpVersion && (
                      <div className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Up to date
                      </div>
                    )}
                  </div>
                )}
                
                {updateError && (
                  <div className="mt-2 text-xs text-rose-400 bg-rose-500/10 rounded p-2">
                    {updateError}
                  </div>
                )}
                
                {/* Auto-update toggle */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                  <div className="flex-1">
                    <div className="text-xs text-slate-400">Auto-update on startup</div>
                  </div>
                  <button
                    onClick={() => setAutoUpdateYtdlp(!autoUpdateYtdlp)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative",
                      autoUpdateYtdlp ? "bg-indigo-600" : "bg-slate-700"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      autoUpdateYtdlp ? "translate-x-5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                Schedule Download
              </h2>
              <button 
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* URL(s) Info */}
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <div className="text-xs text-slate-500 mb-1">
                  {isBatchMode ? `Scheduling ${batchUrls.length} URLs` : 'Scheduling URL'}
                </div>
                <div className="text-sm text-slate-300 truncate">
                  {isBatchMode ? `${batchUrls[0]} ${batchUrls.length > 1 ? `(+${batchUrls.length - 1} more)` : ''}` : url}
                </div>
              </div>

              {/* Format Selection */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Quality</label>
                <select
                  value={isBatchMode ? batchQualityId : (selectedFormat || defaultFormat)}
                  onChange={(e) => isBatchMode ? handleBatchQualityChange(e.target.value) : setSelectedFormat(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {isBatchMode ? (
                    BATCH_QUALITY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))
                  ) : (
                    <>
                      <option value="bv*[height<=2160]+ba/b[height<=2160]/best">2160p (4K)</option>
                      <option value="bv*[height<=1440]+ba/b[height<=1440]/best">1440p (2K)</option>
                      <option value="bv*[height<=1080]+ba/b[height<=1080]/best">1080p (FHD)</option>
                      <option value="bv*[height<=720]+ba/b[height<=720]/best">720p (HD)</option>
                      <option value="bv*[height<=480]+ba/b[height<=480]/best">480p</option>
                      <option value="ba/b">Audio Only (Best)</option>
                    </>
                  )}
                </select>
              </div>

              {isBatchMode && (
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Subtitles</label>
                  <select
                    value={batchWithSubtitles ? "with" : "without"}
                    onChange={(e) => setBatchWithSubtitles(e.target.value === "with")}
                    disabled={isBatchAudioOnly}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                  >
                    <option value="without">No subtitles</option>
                    <option value="with">With subtitles</option>
                  </select>
                </div>
              )}

              {/* Date & Time Picker */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Schedule For</label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              {/* Quick Schedule Options */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: 'In 1 hour', hours: 1 },
                  { label: 'In 3 hours', hours: 3 },
                  { label: 'Tonight (10 PM)', hours: -1 },
                  { label: 'Tomorrow', hours: 24 },
                ].map((option) => (
                  <button
                    key={option.label}
                    onClick={() => {
                      const date = new Date();
                      if (option.hours === -1) {
                        // Tonight at 10 PM
                        date.setHours(22, 0, 0, 0);
                        if (date <= new Date()) {
                          date.setDate(date.getDate() + 1);
                        }
                      } else {
                        date.setHours(date.getHours() + option.hours);
                      }
                      setScheduledTime(date.toISOString().slice(0, 16));
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 px-2 py-1 rounded transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-2">
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={scheduleDownload}
                disabled={!scheduledTime}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
