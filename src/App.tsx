import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { AppHeader } from "./components/AppHeader";
import { ComposerSection } from "./components/ComposerSection";
import { DownloadsSection } from "./components/DownloadsSection";
import { ScheduleModal } from "./components/ScheduleModal";
import { SettingsModal } from "./components/SettingsModal";
import { useWindowControls } from "./hooks/useWindowControls";
import { useYtdlpUpdater } from "./hooks/useYtdlpUpdater";
import {
  BATCH_QUALITY_OPTIONS,
  DEFAULT_BATCH_FORMAT_ID,
  DEFAULT_FORMAT_STRING,
  MAX_LOG_LINES_PER_DOWNLOAD,
  MIN_PROGRESS_DELTA,
  PROGRESS_UPDATE_INTERVAL_MS,
  type BatchQualityOption,
  type DownloadItem,
  type ExtensionBridgeInfo,
  type ExtensionDownloadRequest,
  type LogPayload,
  type PlaylistInfo,
  type ProgressPayload,
  type StatusPayload,
  type TitlePayload,
} from "./lib/types";

export default function App() {
  const { minimizeWindow, toggleMaximizeWindow, closeWindow, startWindowDrag } = useWindowControls();
  const {
    ytdlpVersion,
    ytdlpLatestVersion,
    isCheckingUpdate,
    isUpdating,
    updateError,
    autoUpdateYtdlp,
    setAutoUpdateYtdlp,
    checkYtdlpUpdate,
    updateYtdlp,
  } = useYtdlpUpdater();
  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("");
  const [withSubtitles, setWithSubtitles] = useState(false);
  const [formatsError, setFormatsError] = useState("");
  const [lastFetchedUrl, setLastFetchedUrl] = useState("");
  const [useAria2c, setUseAria2c] = useState<boolean>(() => {
    const saved = localStorage.getItem("useAria2c");
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
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);
  const [extensionBridgeInfo, setExtensionBridgeInfo] = useState<ExtensionBridgeInfo | null>(null);
  const [extensionActivity, setExtensionActivity] = useState("");
  const [downloadsPage, setDownloadsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressUpdateTimesRef = useRef<Record<string, number>>({});
  const extensionDefaultsRef = useRef({
    savePath: "",
    formatString: DEFAULT_FORMAT_STRING,
    subtitles: false,
    useAria2c: true,
  });
  const handledExtensionRequestsRef = useRef<Set<string>>(new Set());
  const isPlaylistUrl = (urlString: string) => {
    try {
      const parsed = new URL(urlString);
      return parsed.pathname === "/playlist" && parsed.searchParams.has("list");
    } catch {
      return false;
    }
  };
  const getSelectedBatchQuality = (): BatchQualityOption => {
    return (
      BATCH_QUALITY_OPTIONS.find((option) => option.id === batchQualityId) ||
      BATCH_QUALITY_OPTIONS.find((option) => option.id === DEFAULT_BATCH_FORMAT_ID) ||
      BATCH_QUALITY_OPTIONS[0]
    );
  };
  const selectedBatchQuality = getSelectedBatchQuality();
  const isBatchAudioOnly = selectedBatchQuality.format === "ba/b";
  const handleBatchQualityChange = (qualityId: string) => {
    setBatchQualityId(qualityId);
    const quality = BATCH_QUALITY_OPTIONS.find((option) => option.id === qualityId);
    if (quality?.format === "ba/b") {
      setBatchWithSubtitles(false);
    }
  };

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl);
    if (nextUrl !== lastFetchedUrl) {
      setSelectedFormat("");
      setWithSubtitles(false);
      setFormatsError("");
      setIsPlaylist(false);
      setPlaylistInfo(null);
    }
  };

  const resetSingleUrlComposer = () => {
    setUrl("");
    setSelectedFormat("");
    setWithSubtitles(false);
    setLastFetchedUrl("");
    setIsPlaylist(false);
    setPlaylistInfo(null);
    setFormatsError("");
  };

  const loadExtensionBridgeInfo = async () => {
    try {
      const info = await invoke<ExtensionBridgeInfo>("get_extension_bridge_info");
      setExtensionBridgeInfo(info);
    } catch (error) {
      console.error("Failed to load extension bridge info:", error);
      setExtensionBridgeInfo({
        endpoint: "http://127.0.0.1:46321",
        host: "127.0.0.1",
        port: 46321,
        ready: false,
        error: String(error),
      });
    }
  };

  const startSingleDownload = async ({
    downloadUrl,
    downloadTitle,
    formatString,
    subtitles,
    downloadDirPath,
    useAria2c: shouldUseAria2c,
  }: {
    downloadUrl: string;
    downloadTitle?: string;
    formatString: string;
    subtitles: boolean;
    downloadDirPath: string;
    useAria2c: boolean;
  }) => {
    const id = Math.random().toString(36).substring(7);
    const newDownload: DownloadItem = {
      id,
      url: downloadUrl,
      title: downloadTitle || downloadUrl.split("/").pop() || "Video",
      status: "pending",
      progress: 0,
      speed: "0 KB/s",
      eta: "N/A",
      size: "Unknown",
      logs: [],
      isLogsOpen: false,
    };

    setDownloads((previous) => [newDownload, ...previous]);

    try {
      await invoke("start_download", {
        id,
        url: downloadUrl,
        downloadDir: downloadDirPath,
        formatString,
        subtitles,
        useAria2c: shouldUseAria2c,
      });
    } catch (error) {
      console.error("Failed to start download:", error);
      setDownloads((previous) =>
        previous.map((item) => (item.id === id ? { ...item, status: "error" } : item)),
      );
      throw error;
    }
  };

  const processExtensionDownloadRequest = async (request: ExtensionDownloadRequest) => {
    if (!request?.request_id || handledExtensionRequestsRef.current.has(request.request_id)) {
      return;
    }

    handledExtensionRequestsRef.current.add(request.request_id);

    const defaults = extensionDefaultsRef.current;
    if (!defaults.savePath) {
      setExtensionActivity("Chrome request received before the download folder was ready.");
      return;
    }

    const sourceLabel = request.source ? ` from ${request.source}` : "";
    const qualityLabel = request.quality_label ? ` | ${request.quality_label}` : "";
    setExtensionActivity(`Queued${sourceLabel}${qualityLabel}: ${request.title || request.url}`);

    try {
      await startSingleDownload({
        downloadUrl: request.url,
        downloadTitle: request.title,
        formatString: request.format_string || defaults.formatString,
        subtitles: request.subtitles ?? defaults.subtitles,
        downloadDirPath: defaults.savePath,
        useAria2c: defaults.useAria2c,
      });
    } catch {
      setExtensionActivity(`Chrome handoff failed: ${request.title || request.url}`);
    }
  };

  const toggleDownloadLogs = (id: string) => {
    setDownloads((previous) =>
      previous.map((item) => (item.id === id ? { ...item, isLogsOpen: !item.isLogsOpen } : item)),
    );
  };

  const toggleHistoryLogs = (id: string, isOpen?: boolean) => {
    setHistory((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, isLogsOpen: isOpen ?? !item.isLogsOpen } : item,
      ),
    );
  };

  const cancelScheduledDownload = (id: string) => {
    setDownloads((previous) => previous.filter((item) => item.id !== id));
  };

  useEffect(() => {
    extensionDefaultsRef.current = {
      savePath,
      formatString: selectedFormat || DEFAULT_FORMAT_STRING,
      subtitles: withSubtitles,
      useAria2c,
    };
  }, [savePath, selectedFormat, useAria2c, withSubtitles]);

  useEffect(() => {
    if (!extensionActivity) return;

    const timer = window.setTimeout(() => {
      setExtensionActivity("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [extensionActivity]);

  useEffect(() => {
    const savedPath = localStorage.getItem("downloadPath");
    const savedHistory = localStorage.getItem("downloadHistory");

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error("Failed to parse history:", error);
      }
    }

    const initialize = async () => {
      const initialPath = savedPath || (await downloadDir());
      setSavePath(initialPath);
      extensionDefaultsRef.current = {
        ...extensionDefaultsRef.current,
        savePath: initialPath,
      };

      await loadExtensionBridgeInfo();

      try {
        const pendingRequests =
          await invoke<ExtensionDownloadRequest[]>("take_extension_download_requests");
        for (const request of pendingRequests) {
          void processExtensionDownloadRequest(request);
        }
      } catch (error) {
        console.error("Failed to load pending extension requests:", error);
      }
    };

    void initialize();

    const unlistenProgress = listen<ProgressPayload>("download-progress", (event) => {
      const now = Date.now();
      const lastUpdate = progressUpdateTimesRef.current[event.payload.id] ?? 0;
      const isFinalStage = event.payload.percentage >= 99;
      if (!isFinalStage && now - lastUpdate < PROGRESS_UPDATE_INTERVAL_MS) return;

      progressUpdateTimesRef.current[event.payload.id] = now;

      setDownloads((previous) => {
        let changed = false;
        const next: DownloadItem[] = previous.map((item): DownloadItem => {
          if (item.id !== event.payload.id) return item;

          const progressChanged =
            Math.abs(item.progress - event.payload.percentage) >= MIN_PROGRESS_DELTA;
          const speedChanged = item.speed !== event.payload.speed;
          const etaChanged = item.eta !== event.payload.eta;
          const sizeChanged = item.size !== event.payload.size;
          const phaseChanged = item.phase !== event.payload.phase;
          const statusChanged = item.status !== "downloading";

          if (
            !progressChanged &&
            !speedChanged &&
            !etaChanged &&
            !sizeChanged &&
            !phaseChanged &&
            !statusChanged
          ) {
            return item;
          }

          changed = true;
          return {
            ...item,
            progress: event.payload.percentage,
            speed: event.payload.speed,
            eta: event.payload.eta,
            size: event.payload.size,
            status: "downloading",
            phase: event.payload.phase,
          };
        });

        return changed ? next : previous;
      });
    });

    const unlistenLogs = listen<LogPayload>("download-log", (event) => {
      const message = event.payload.message?.trim();
      if (!message) return;

      setDownloads((previous) =>
        previous.map((item) => {
          if (item.id !== event.payload.id) return item;

          const currentLogs = item.logs || [];
          if (currentLogs[currentLogs.length - 1] === message) {
            return item;
          }

          const nextLogs = [...currentLogs, message];
          const logs =
            nextLogs.length > MAX_LOG_LINES_PER_DOWNLOAD
              ? nextLogs.slice(-MAX_LOG_LINES_PER_DOWNLOAD)
              : nextLogs;

          return { ...item, logs };
        }),
      );
    });

    const unlistenTitle = listen<TitlePayload>("download-title", (event) => {
      setDownloads((previous) =>
        previous.map((item) =>
          item.id === event.payload.id ? { ...item, title: event.payload.title } : item,
        ),
      );
    });

    const unlistenStatus = listen<StatusPayload>("download-status", (event) => {
      delete progressUpdateTimesRef.current[event.payload.id];
      setDownloads((previous) =>
        previous.map((item) =>
          item.id === event.payload.id
            ? {
                ...item,
                status: event.payload.status,
                progress: event.payload.status === "completed" ? 100 : item.progress,
                isLogsOpen: event.payload.status === "error" ? true : item.isLogsOpen,
              }
            : item,
        ),
      );
    });

    const unlistenExtensionRequests = listen<ExtensionDownloadRequest>(
      "extension-download-request",
      (event) => {
        void processExtensionDownloadRequest(event.payload);
      },
    );

    return () => {
      unlistenProgress.then((unlisten) => unlisten());
      unlistenLogs.then((unlisten) => unlisten());
      unlistenTitle.then((unlisten) => unlisten());
      unlistenStatus.then((unlisten) => unlisten());
      unlistenExtensionRequests.then((unlisten) => unlisten());
    };
  }, []);

  const selectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: savePath,
    });

    if (selected && typeof selected === "string") {
      setSavePath(selected);
      extensionDefaultsRef.current = {
        ...extensionDefaultsRef.current,
        savePath: selected,
      };
      localStorage.setItem("downloadPath", selected);
    }
  };

  useEffect(() => {
    localStorage.setItem("useAria2c", JSON.stringify(useAria2c));
  }, [useAria2c]);

  useEffect(() => {
    if (!url || isBatchMode || url === lastFetchedUrl || isFetchingPlaylist) {
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchFormats(url);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [url, lastFetchedUrl, isBatchMode, isFetchingPlaylist]);

  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem("downloadHistory", JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    const completed = downloads.filter(
      (download) =>
        download.status === "completed" ||
        download.status === "error" ||
        download.status === "cancelled",
    );

    if (completed.length === 0) {
      return;
    }

    const updatedCompleted = completed.map((download) => ({
      ...download,
      completedAt: download.completedAt || new Date().toISOString(),
      downloadPath: savePath,
    }));

    setHistory((previous) => {
      const existingIds = new Set(previous.map((item) => item.id));
      const newItems = updatedCompleted.filter((item) => !existingIds.has(item.id));
      return [...newItems, ...previous].slice(0, 100);
    });

    setDownloads((previous) =>
      previous.filter(
        (download) =>
          download.status !== "completed" &&
          download.status !== "error" &&
          download.status !== "cancelled",
      ),
    );
  }, [downloads, savePath]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("downloadHistory");
  };

  const removeFromHistory = (id: string) => {
    setHistory((previous) => previous.filter((item) => item.id !== id));
  };

  const openFolder = (path: string) => {
    invoke("open_folder", { path }).catch((error) => {
      console.error("Failed to open folder:", error);
    });
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && (line.startsWith("http://") || line.startsWith("https://")));

    if (lines.length > 0) {
      setBatchUrls(lines);
      setIsBatchMode(true);
      setSelectedFormat("");
      setWithSubtitles(false);
      setFormatsError("");
      setIsPlaylist(false);
      setPlaylistInfo(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startBatchDownload = async () => {
    if (batchUrls.length === 0) return;

    setIsProcessing(true);
    const batchQuality = getSelectedBatchQuality();
    const formatToUse = batchQuality.format;
    const subtitlesToUse = formatToUse === "ba/b" ? false : batchWithSubtitles;

    for (const batchUrl of batchUrls) {
      const id = Math.random().toString(36).substring(7);
      const newDownload: DownloadItem = {
        id,
        url: batchUrl,
        title: batchUrl.split("/").pop() || "Video",
        status: "pending",
        progress: 0,
        speed: "0 KB/s",
        eta: "N/A",
        size: "Unknown",
        logs: [],
        isLogsOpen: false,
        format: formatToUse,
        subtitles: subtitlesToUse,
      };

      setDownloads((previous) => [newDownload, ...previous]);

      try {
        await invoke("start_download", {
          id,
          url: batchUrl,
          downloadDir: savePath,
          formatString: formatToUse,
          subtitles: subtitlesToUse,
          useAria2c,
        });
      } catch (error) {
        console.error("Failed to start download:", error);
        setDownloads((previous) =>
          previous.map((item) => (item.id === id ? { ...item, status: "error" } : item)),
        );
      }
    }

    setBatchUrls([]);
    setIsBatchMode(false);
    setIsProcessing(false);
  };

  const scheduleDownload = () => {
    if (!url && batchUrls.length === 0) return;

    const batchQuality = getSelectedBatchQuality();
    const urlsToSchedule = isBatchMode ? batchUrls : [url];
    const formatToUse = isBatchMode ? batchQuality.format : selectedFormat || DEFAULT_FORMAT_STRING;
    const subtitlesToUse = isBatchMode
      ? batchQuality.format === "ba/b"
        ? false
        : batchWithSubtitles
      : withSubtitles;

    setDownloads((previous) => [
      ...urlsToSchedule.map((scheduledUrl) => ({
        id: Math.random().toString(36).substring(7),
        url: scheduledUrl,
        title: scheduledUrl.split("/").pop() || "Scheduled Video",
        status: "scheduled" as const,
        progress: 0,
        speed: "0 KB/s",
        eta: "N/A",
        size: "Unknown",
        logs: [],
        isLogsOpen: false,
        format: formatToUse,
        subtitles: subtitlesToUse,
        scheduledFor: scheduledTime,
      })),
      ...previous,
    ]);

    resetSingleUrlComposer();
    setBatchUrls([]);
    setIsBatchMode(false);
    setIsScheduleModalOpen(false);
    setScheduledTime("");
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      const dueDownloads: DownloadItem[] = [];

      setDownloads((previous) => {
        let hasChanges = false;
        const next = previous.map((item) => {
          if (item.status !== "scheduled" || !item.scheduledFor) {
            return item;
          }

          const scheduledDate = new Date(item.scheduledFor);
          if (now < scheduledDate) {
            return item;
          }

          hasChanges = true;
          const pendingItem = { ...item, status: "pending" as const };
          dueDownloads.push(pendingItem);
          return pendingItem;
        });

        return hasChanges ? next : previous;
      });

      dueDownloads.forEach((item) => {
        invoke("start_download", {
          id: item.id,
          url: item.url,
          downloadDir: savePath,
          formatString: item.format || DEFAULT_FORMAT_STRING,
          subtitles: item.subtitles ?? withSubtitles,
          useAria2c,
        }).catch((error) => {
          console.error("Failed to start scheduled download:", error);
        });
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, [savePath, useAria2c, withSubtitles]);

  const fetchFormats = async (videoUrl: string) => {
    if (!videoUrl || videoUrl === lastFetchedUrl || isBatchMode) return;

    if (isPlaylistUrl(videoUrl)) {
      setIsPlaylist(true);
      setIsFetchingPlaylist(true);
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

    setIsPlaylist(false);
    setPlaylistInfo(null);
    setSelectedFormat("");
    setWithSubtitles(false);
    setFormatsError("");
    setLastFetchedUrl(videoUrl);
  };

  useEffect(() => {
    if (isSettingsOpen) {
      void loadExtensionBridgeInfo();
    }
  }, [isSettingsOpen]);

  const cancelDownload = async (downloadId: string) => {
    try {
      await invoke("cancel_download", { id: downloadId });
    } catch (error) {
      console.error("Failed to cancel download:", error);
      setDownloads((previous) => previous.filter((download) => download.id !== downloadId));
    }
  };

  const addDownload = async () => {
    if (!url || !selectedFormat) return;

    const formatToUse = selectedFormat;
    setIsProcessing(true);

    if (isPlaylist && playlistInfo && playlistInfo.entries.length > 0) {
      const newDownloads: DownloadItem[] = playlistInfo.entries.map((video) => ({
        id: Math.random().toString(36).substring(7),
        url: video.url,
        title: video.title,
        status: "pending",
        progress: 0,
        speed: "0 KB/s",
        eta: "N/A",
        size: "Unknown",
        logs: [],
        isLogsOpen: false,
      }));

      setDownloads((previous) => [...newDownloads, ...previous]);
      resetSingleUrlComposer();

      for (const download of newDownloads) {
        try {
          await invoke("start_download", {
            id: download.id,
            url: download.url,
            downloadDir: savePath,
            formatString: formatToUse,
            subtitles: withSubtitles,
            useAria2c,
          });
        } catch (error) {
          console.error("Failed to start download:", error);
          setDownloads((previous) =>
            previous.map((item) =>
              item.id === download.id ? { ...item, status: "error" } : item,
            ),
          );
        }
      }

      setIsProcessing(false);
      return;
    }

    const manualUrl = url;
    resetSingleUrlComposer();

    try {
      await startSingleDownload({
        downloadUrl: manualUrl,
        formatString: formatToUse,
        subtitles: withSubtitles,
        downloadDirPath: savePath,
        useAria2c,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const refreshExtensionBridge = async () => {
    await loadExtensionBridgeInfo();
  };

  const applyScheduledQuickTime = (hours: number) => {
    const date = new Date();
    if (hours === -1) {
      date.setHours(22, 0, 0, 0);
      if (date <= new Date()) {
        date.setDate(date.getDate() + 1);
      }
    } else {
      date.setHours(date.getHours() + hours);
    }
    setScheduledTime(date.toISOString().slice(0, 16));
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-950 text-slate-200">
      <AppHeader
        extensionActivity={extensionActivity}
        savePath={savePath}
        onOpenFolder={openFolder}
        onSelectFolder={selectFolder}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onStartDrag={startWindowDrag}
        onToggleMaximize={toggleMaximizeWindow}
        onMinimize={minimizeWindow}
        onClose={closeWindow}
      />

      <main className="mx-auto flex-1 w-full max-w-5xl space-y-8 p-6">
        <ComposerSection
          fileInputRef={fileInputRef}
          url={url}
          lastFetchedUrl={lastFetchedUrl}
          selectedFormat={selectedFormat}
          withSubtitles={withSubtitles}
          formatsError={formatsError}
          isFetchingFormats={false}
          isFetchingPlaylist={isFetchingPlaylist}
          isPlaylist={isPlaylist}
          playlistInfo={playlistInfo}
          isBatchMode={isBatchMode}
          batchUrls={batchUrls}
          batchQualityId={batchQualityId}
          batchWithSubtitles={batchWithSubtitles}
          isBatchAudioOnly={isBatchAudioOnly}
          isProcessing={isProcessing}
          onFileImport={handleFileImport}
          onUrlChange={handleUrlChange}
          onOpenSchedule={() => setIsScheduleModalOpen(true)}
          onSubmit={addDownload}
          onExitBatchMode={() => {
            setBatchUrls([]);
            setIsBatchMode(false);
          }}
          onBatchQualityChange={handleBatchQualityChange}
          onBatchSubtitlesChange={setBatchWithSubtitles}
          onStartBatchDownload={startBatchDownload}
          onSelectFormat={(format, includeSubtitles) => {
            setSelectedFormat(format);
            setWithSubtitles(includeSubtitles);
          }}
        />

        <DownloadsSection
          downloads={downloads}
          history={history}
          showHistory={showHistory}
          downloadsPage={downloadsPage}
          historyPage={historyPage}
          onShowActive={() => {
            setShowHistory(false);
            setDownloadsPage(1);
          }}
          onShowHistory={() => {
            setShowHistory(true);
            setHistoryPage(1);
          }}
          onChangeDownloadsPage={setDownloadsPage}
          onChangeHistoryPage={setHistoryPage}
          onClearHistory={() => {
            clearHistory();
            setHistoryPage(1);
          }}
          onCancelScheduledDownload={cancelScheduledDownload}
          onCancelDownload={cancelDownload}
          onToggleDownloadLogs={toggleDownloadLogs}
          onToggleHistoryLogs={toggleHistoryLogs}
          onRemoveFromHistory={removeFromHistory}
          onOpenFolder={openFolder}
        />
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/30 p-4 text-center text-[10px] text-slate-600">
        Powered by yt-dlp, Tauri, Bun, and Rust
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        useAria2c={useAria2c}
        autoUpdateYtdlp={autoUpdateYtdlp}
        ytdlpVersion={ytdlpVersion}
        ytdlpLatestVersion={ytdlpLatestVersion}
        isCheckingUpdate={isCheckingUpdate}
        isUpdating={isUpdating}
        updateError={updateError}
        extensionBridgeInfo={extensionBridgeInfo}
        onClose={() => setIsSettingsOpen(false)}
        onToggleAria2c={() => setUseAria2c((value) => !value)}
        onCheckUpdate={checkYtdlpUpdate}
        onUpdateYtdlp={updateYtdlp}
        onToggleAutoUpdate={() => setAutoUpdateYtdlp((value) => !value)}
        onRefreshExtensionBridge={refreshExtensionBridge}
      />

      <ScheduleModal
        isOpen={isScheduleModalOpen}
        isBatchMode={isBatchMode}
        batchUrls={batchUrls}
        url={url}
        batchQualityId={batchQualityId}
        batchWithSubtitles={batchWithSubtitles}
        isBatchAudioOnly={isBatchAudioOnly}
        selectedFormat={selectedFormat}
        defaultFormat={DEFAULT_FORMAT_STRING}
        scheduledTime={scheduledTime}
        onClose={() => setIsScheduleModalOpen(false)}
        onSchedule={scheduleDownload}
        onBatchQualityChange={handleBatchQualityChange}
        onBatchSubtitlesChange={setBatchWithSubtitles}
        onSingleFormatChange={setSelectedFormat}
        onScheduledTimeChange={setScheduledTime}
        onApplyQuickTime={applyScheduledQuickTime}
      />
    </div>
  );
}
