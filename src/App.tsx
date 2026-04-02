import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

import { GlassDashboard } from "./components/layouts/GlassDashboard";
import { NotionDashboard } from "./components/layouts/NotionDashboard";
import { SettingsModal, type InterfacePreset } from "./components/SettingsModal";
import { useWindowControls } from "./hooks/useWindowControls";
import { useYtdlpUpdater } from "./hooks/useYtdlpUpdater";
import {
  formatExtensionStatus,
  getFormatFromQualityId,
  getQualityIdFromFormat,
  getQueuedTitle,
  getUrlLines,
  isPlaylistUrl,
  toLocalDateTimeValue,
  type UrlType,
} from "./lib/downloadUi";
import {
  BATCH_QUALITY_OPTIONS,
  DEFAULT_BATCH_FORMAT_ID,
  DEFAULT_FORMAT_STRING,
  ITEMS_PER_PAGE,
  MAX_LOG_LINES_PER_DOWNLOAD,
  MIN_PROGRESS_DELTA,
  PROGRESS_UPDATE_INTERVAL_MS,
  type DownloadItem,
  type ExtensionBridgeInfo,
  type ExtensionDownloadRequest,
  type LogPayload,
  type PlaylistInfo,
  type ProgressPayload,
  type StatusPayload,
  type TitlePayload,
} from "./lib/types";

type LayoutPreset = "glass" | "notion";

export default function App() {
  const { minimizeWindow, toggleMaximizeWindow, closeWindow, startWindowDrag } =
    useWindowControls();
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressUpdateTimesRef = useRef<Record<string, number>>({});
  const extensionDefaultsRef = useRef({
    savePath: "",
    formatString: DEFAULT_FORMAT_STRING,
    subtitles: false,
    useAria2c: true,
  });
  const handledExtensionRequestsRef = useRef<Set<string>>(new Set());

  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [selectedFormat, setSelectedFormat] = useState(DEFAULT_FORMAT_STRING);
  const [withSubtitles, setWithSubtitles] = useState(false);
  const [formatsError, setFormatsError] = useState("");
  const [lastFetchedUrl, setLastFetchedUrl] = useState("");
  const [useAria2c, setUseAria2c] = useState<boolean>(() => {
    const saved = localStorage.getItem("useAria2c");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [batchQualityId, setBatchQualityId] = useState(DEFAULT_BATCH_FORMAT_ID);
  const [batchWithSubtitles, setBatchWithSubtitles] = useState(false);
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState<PlaylistInfo | null>(null);
  const [isFetchingPlaylist, setIsFetchingPlaylist] = useState(false);
  const [extensionBridgeInfo, setExtensionBridgeInfo] = useState<ExtensionBridgeInfo | null>(null);
  const [extensionActivity, setExtensionActivity] = useState("");
  const [currentView, setCurrentView] = useState<"active" | "history">("active");
  const [activePage, setActivePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("uiDarkMode");
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  const uiPreset: LayoutPreset = "notion";
  const trimmedUrl = url.trim();
  const urlLines = getUrlLines(url);
  const playlistDetected = isPlaylistUrl(trimmedUrl) || isPlaylist;
  const urlType: UrlType = !trimmedUrl
    ? null
    : urlLines.length > 1
      ? "batch"
      : playlistDetected
        ? "playlist"
        : "single";
  const isBatchMode = urlType === "batch";
  const selectedBatchQuality =
    BATCH_QUALITY_OPTIONS.find((option) => option.id === batchQualityId) ||
    BATCH_QUALITY_OPTIONS.find((option) => option.id === DEFAULT_BATCH_FORMAT_ID) ||
    BATCH_QUALITY_OPTIONS[0];
  const selectedQualityId = isBatchMode
    ? batchQualityId
    : getQualityIdFromFormat(selectedFormat);
  const isAudioOnly =
    (isBatchMode ? selectedBatchQuality.format : selectedFormat) === "ba/b";
  const subtitlesEnabled = isBatchMode ? batchWithSubtitles : withSubtitles;
  const activeDownloads = downloads.filter(
    (download) => download.status === "pending" || download.status === "downloading",
  );
  const scheduledDownloads = downloads.filter((download) => download.status === "scheduled");
  const queuedDownloads = [...activeDownloads, ...scheduledDownloads];
  const activeTotalPages = Math.max(1, Math.ceil(queuedDownloads.length / ITEMS_PER_PAGE));
  const historyTotalPages = Math.max(1, Math.ceil(history.length / ITEMS_PER_PAGE));
  const activeItems = queuedDownloads.slice(
    (activePage - 1) * ITEMS_PER_PAGE,
    activePage * ITEMS_PER_PAGE,
  );
  const historyItems = history.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE,
  );
  const hasTargetInput = urlLines.length > 0;
  const isBusy = isProcessing || isFetchingPlaylist;
  const shouldWaitForPlaylistMeta =
    urlType === "playlist" && !playlistInfo && !formatsError && trimmedUrl !== lastFetchedUrl;
  const canSubmit =
    hasTargetInput &&
    !isBusy &&
    !shouldWaitForPlaylistMeta &&
    (!isScheduling || Boolean(scheduledTime));
  const extensionStatusLabel = formatExtensionStatus(
    extensionBridgeInfo?.ready,
    extensionBridgeInfo?.port,
  );
  const versionLabel = ytdlpVersion ? `v${ytdlpVersion}` : "local build";

  const interfacePresets = useMemo<InterfacePreset[]>(
    () => [
      {
        id: "glass",
        name: "Glass dashboard",
        description: "Dark split-pane orchestration view from the first redesign.",
        status: "saved",
      },
      {
        id: "notion",
        name: "Workspace list",
        description: "Editorial queue view based on the second UI direction.",
        status: "active",
      },
    ],
    [],
  );

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

  const clearComposer = () => {
    setUrl("");
    setLastFetchedUrl("");
    setIsPlaylist(false);
    setPlaylistInfo(null);
    setFormatsError("");
    setIsScheduling(false);
    setScheduledTime("");
  };

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl);
    if (nextUrl !== lastFetchedUrl) {
      setFormatsError("");
      setIsPlaylist(false);
      setPlaylistInfo(null);
    }
  };

  const handleSingleQualityChange = (qualityId: string) => {
    const nextFormat = getFormatFromQualityId(qualityId);
    setSelectedFormat(nextFormat);
    if (nextFormat === "ba/b") {
      setWithSubtitles(false);
    }
  };

  const handleBatchQualityChange = (qualityId: string) => {
    setBatchQualityId(qualityId);
    if (getFormatFromQualityId(qualityId) === "ba/b") {
      setBatchWithSubtitles(false);
    }
  };

  const handleSelectQualityId = (qualityId: string) => {
    if (isBatchMode) {
      handleBatchQualityChange(qualityId);
      return;
    }
    handleSingleQualityChange(qualityId);
  };

  const handleToggleSubtitles = () => {
    if (isAudioOnly) return;
    if (isBatchMode) {
      setBatchWithSubtitles((value) => !value);
      return;
    }
    setWithSubtitles((value) => !value);
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
      title: downloadTitle || getQueuedTitle(downloadUrl, "Queued video"),
      status: "pending",
      progress: 0,
      speed: "0 KB/s",
      eta: "N/A",
      size: "Unknown",
      logs: [],
      isLogsOpen: false,
      format: formatString,
      subtitles,
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
    setCurrentView("active");

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
    localStorage.setItem("uiDarkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

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
    const timer = window.setTimeout(() => setExtensionActivity(""), 5000);
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
        const next = previous.map((item) => {
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
            status: "downloading" as const,
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

  useEffect(() => {
    localStorage.setItem("useAria2c", JSON.stringify(useAria2c));
  }, [useAria2c]);

  useEffect(() => {
    if (!trimmedUrl || urlType !== "playlist" || trimmedUrl === lastFetchedUrl || isFetchingPlaylist) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchFormats(trimmedUrl);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [trimmedUrl, urlType, lastFetchedUrl, isFetchingPlaylist]);

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

    if (completed.length === 0) return;

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

  useEffect(() => {
    if (activePage > activeTotalPages) {
      setActivePage(activeTotalPages);
    }
  }, [activePage, activeTotalPages]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (isSettingsOpen) {
      void loadExtensionBridgeInfo();
    }
  }, [isSettingsOpen]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("downloadHistory");
    setHistoryPage(1);
  };

  const removeFromHistory = (id: string) => {
    setHistory((previous) => previous.filter((item) => item.id !== id));
  };

  const openFolder = (path: string) => {
    if (!path) return;
    invoke("open_folder", { path }).catch((error) => {
      console.error("Failed to open folder:", error);
    });
  };

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

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && (line.startsWith("http://") || line.startsWith("https://")));

    if (lines.length > 0) {
      setUrl(lines.join("\n"));
      setFormatsError("");
      setIsPlaylist(false);
      setPlaylistInfo(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startBatchDownload = async () => {
    if (urlLines.length === 0) return;

    setIsProcessing(true);
    const formatToUse = selectedBatchQuality.format;
    const subtitlesToUse = formatToUse === "ba/b" ? false : batchWithSubtitles;
    const pendingBatchItems = urlLines.map((batchUrl, index) => ({
      id: Math.random().toString(36).substring(7),
      url: batchUrl,
      title: `Batch item ${index + 1}`,
      status: "pending" as const,
      progress: 0,
      speed: "0 KB/s",
      eta: "N/A",
      size: "Unknown",
      logs: [],
      isLogsOpen: false,
      format: formatToUse,
      subtitles: subtitlesToUse,
    }));

    setDownloads((previous) => [...pendingBatchItems, ...previous]);
    clearComposer();
    setCurrentView("active");
    setActivePage(1);

    for (const item of pendingBatchItems) {
      try {
        await invoke("start_download", {
          id: item.id,
          url: item.url,
          downloadDir: savePath,
          formatString: formatToUse,
          subtitles: subtitlesToUse,
          useAria2c,
        });
      } catch (error) {
        console.error("Failed to start download:", error);
        setDownloads((previous) =>
          previous.map((download) =>
            download.id === item.id ? { ...download, status: "error" } : download,
          ),
        );
      }
    }

    setIsProcessing(false);
  };

  const queueScheduledDownloads = () => {
    if (!scheduledTime || urlLines.length === 0) return;

    const scheduleUrls =
      urlType === "playlist" && playlistInfo
        ? playlistInfo.entries.map((entry) => ({ url: entry.url, title: entry.title }))
        : urlLines.map((entry, index) => ({
            url: entry,
            title:
              urlType === "batch"
                ? `Batch item ${index + 1}`
                : getQueuedTitle(entry, "Scheduled item"),
          }));
    const formatToUse =
      urlType === "batch" ? selectedBatchQuality.format : selectedFormat || DEFAULT_FORMAT_STRING;
    const subtitlesToUse =
      formatToUse === "ba/b"
        ? false
        : urlType === "batch"
          ? batchWithSubtitles
          : withSubtitles;

    setDownloads((previous) => [
      ...scheduleUrls.map((item) => ({
        id: Math.random().toString(36).substring(7),
        url: item.url,
        title: item.title,
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

    clearComposer();
    setCurrentView("active");
    setActivePage(1);
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

          if (now < new Date(item.scheduledFor)) {
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
    if (!videoUrl || videoUrl === lastFetchedUrl || urlType !== "playlist") return;

    setIsPlaylist(true);
    setIsFetchingPlaylist(true);
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
  };

  const cancelDownload = async (downloadId: string) => {
    try {
      await invoke("cancel_download", { id: downloadId });
    } catch (error) {
      console.error("Failed to cancel download:", error);
      setDownloads((previous) => previous.filter((download) => download.id !== downloadId));
    }
  };

  const startSingleOrPlaylistDownload = async () => {
    if (!trimmedUrl || !selectedFormat) return;

    const formatToUse = selectedFormat;
    const subtitlesToUse = formatToUse === "ba/b" ? false : withSubtitles;
    setIsProcessing(true);
    setCurrentView("active");
    setActivePage(1);

    if (urlType === "playlist" && playlistInfo && playlistInfo.entries.length > 0) {
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
        format: formatToUse,
        subtitles: subtitlesToUse,
      }));

      setDownloads((previous) => [...newDownloads, ...previous]);
      clearComposer();

      for (const download of newDownloads) {
        try {
          await invoke("start_download", {
            id: download.id,
            url: download.url,
            downloadDir: savePath,
            formatString: formatToUse,
            subtitles: subtitlesToUse,
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

    const manualUrl = trimmedUrl;
    clearComposer();

    try {
      await startSingleDownload({
        downloadUrl: manualUrl,
        formatString: formatToUse,
        subtitles: subtitlesToUse,
        downloadDirPath: savePath,
        useAria2c,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const setPresetDate = (preset: "1h" | "3h" | "Tonight" | "Tomorrow") => {
    const now = new Date();
    const target = new Date();

    if (preset === "1h") target.setHours(now.getHours() + 1);
    if (preset === "3h") target.setHours(now.getHours() + 3);
    if (preset === "Tonight") {
      target.setHours(22, 0, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
    }
    if (preset === "Tomorrow") {
      target.setDate(now.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    }

    setScheduledTime(toLocalDateTimeValue(target));
  };

  const handlePrimaryAction = () => {
    if (!canSubmit) return;
    if (isScheduling) {
      queueScheduledDownloads();
      return;
    }
    if (isBatchMode) {
      void startBatchDownload();
      return;
    }
    void startSingleOrPlaylistDownload();
  };

  const handleSelectFolder = () => {
    void selectFolder();
  };

  const handleCancelDownload = (id: string) => {
    void cancelDownload(id);
  };

  const sharedLayoutProps = {
    extensionActivity,
    savePath,
    url,
    urlType,
    urlLines,
    selectedQualityId,
    subtitlesEnabled,
    isAudioOnly,
    isScheduling,
    scheduledTime,
    canSubmit,
    isProcessing,
    playlistInfo,
    isFetchingPlaylist,
    formatsError,
    currentView,
    onUrlChange: handleUrlChange,
    onSelectQualityId: handleSelectQualityId,
    onToggleSubtitles: handleToggleSubtitles,
    onScheduledTimeChange: setScheduledTime,
    onSetPresetDate: setPresetDate,
    onPrimaryAction: handlePrimaryAction,
    onToggleScheduling: () => setIsScheduling((value) => !value),
    onChangeView: (view: "active" | "history") => setCurrentView(view),
    onOpenFolder: openFolder,
    onOpenSettings: () => setIsSettingsOpen(true),
    onSelectFolder: handleSelectFolder,
    onStartDrag: startWindowDrag,
    onMinimize: () => {
      void minimizeWindow();
    },
    onToggleMaximize: () => {
      void toggleMaximizeWindow();
    },
    onCloseWindow: () => {
      void closeWindow();
    },
  };

  return (
    <div className={isDarkMode ? "dark" : ""}>
      {uiPreset === "notion" ? (
        <NotionDashboard
          {...sharedLayoutProps}
          isDarkMode={isDarkMode}
          versionLabel={versionLabel}
          extensionStatusLabel={extensionStatusLabel}
          activeCount={queuedDownloads.length}
          activeItems={activeItems}
          historyItems={historyItems}
          activePagination={{
            currentPage: activePage,
            totalPages: activeTotalPages,
            totalItems: queuedDownloads.length,
            pageItemsCount: activeItems.length,
            itemsPerPage: ITEMS_PER_PAGE,
            onPageChange: setActivePage,
          }}
          historyPagination={{
            currentPage: historyPage,
            totalPages: historyTotalPages,
            totalItems: history.length,
            pageItemsCount: historyItems.length,
            itemsPerPage: ITEMS_PER_PAGE,
            onPageChange: setHistoryPage,
          }}
          fileInputRef={fileInputRef}
          onFileImport={handleFileImport}
          onToggleDarkMode={() => setIsDarkMode((value) => !value)}
          onCancelDownload={handleCancelDownload}
          onToggleHistoryLogs={toggleHistoryLogs}
        />
      ) : (
        <GlassDashboard
          {...sharedLayoutProps}
          activeDownloads={activeDownloads}
          scheduledDownloads={scheduledDownloads}
          history={history}
          onCancelDownload={handleCancelDownload}
          onCancelScheduledDownload={cancelScheduledDownload}
          onToggleDownloadLogs={toggleDownloadLogs}
          onToggleHistoryLogs={toggleHistoryLogs}
          onRemoveFromHistory={removeFromHistory}
          onClearHistory={clearHistory}
        />
      )}

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
        interfacePresets={interfacePresets}
        onClose={() => setIsSettingsOpen(false)}
        onToggleAria2c={() => setUseAria2c((value) => !value)}
        onCheckUpdate={checkYtdlpUpdate}
        onUpdateYtdlp={updateYtdlp}
        onToggleAutoUpdate={() => setAutoUpdateYtdlp((value) => !value)}
        onRefreshExtensionBridge={() => {
          void loadExtensionBridgeInfo();
        }}
      />
    </div>
  );
}
