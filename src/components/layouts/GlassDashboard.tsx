import type { ChangeEvent, MouseEventHandler, RefObject } from "react";
import { useEffect, useState } from "react";

import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Folder,
  FolderOpen,
  List,
  Loader2,
  Minus,
  Moon,
  Music,
  Settings,
  Settings2,
  Square,
  Sun,
  Video,
  X,
} from "lucide-react";

import {
  formatScheduledForLabel,
  getLeafPathLabel,
  getPhaseLabel,
  type SchedulePreset,
  type UrlType,
} from "../../lib/downloadUi";
import {
  BATCH_QUALITY_OPTIONS,
  formatQualityLabel,
  type DownloadItem,
  type PlaylistInfo,
} from "../../lib/types";
import { cn } from "../../lib/utils";

interface GlassDashboardProps {
  extensionActivity: string;
  savePath: string;
  url: string;
  urlType: UrlType;
  urlLines: string[];
  selectedQualityId: string;
  subtitlesEnabled: boolean;
  isAudioOnly: boolean;
  isDarkMode: boolean;
  isScheduling: boolean;
  scheduledTime: string;
  canSubmit: boolean;
  isProcessing: boolean;
  playlistInfo: PlaylistInfo | null;
  isFetchingPlaylist: boolean;
  formatsError: string;
  currentView: "active" | "history";
  activeDownloads: DownloadItem[];
  scheduledDownloads: DownloadItem[];
  history: DownloadItem[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUrlChange: (value: string) => void;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectQualityId: (qualityId: string) => void;
  onToggleSubtitles: () => void;
  onScheduledTimeChange: (value: string) => void;
  onSetPresetDate: (preset: SchedulePreset) => void;
  onPrimaryAction: () => void;
  onToggleScheduling: () => void;
  onChangeView: (view: "active" | "history") => void;
  onCancelDownload: (id: string) => void;
  onCancelScheduledDownload: (id: string) => void;
  onToggleDownloadLogs: (id: string) => void;
  onToggleHistoryLogs: (id: string, isOpen?: boolean) => void;
  onOpenFolder: (path: string) => void;
  onRemoveFromHistory: (id: string) => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
  onToggleDarkMode: () => void;
  onSelectFolder: () => void;
  onStartDrag: MouseEventHandler<HTMLDivElement>;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
}

const HISTORY_PAGE_CAPACITY = 8;

function paginateItems<T>(
  items: T[],
  getWeight: (item: T) => number,
  capacity: number,
) {
  const pages: T[][] = [];
  let currentPage: T[] = [];
  let remaining = capacity;

  items.forEach((item) => {
    const weight = Math.max(1, getWeight(item));

    if (currentPage.length > 0 && weight > remaining) {
      pages.push(currentPage);
      currentPage = [];
      remaining = capacity;
    }

    currentPage.push(item);
    remaining -= Math.min(weight, capacity);

    if (remaining <= 0) {
      pages.push(currentPage);
      currentPage = [];
      remaining = capacity;
    }
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

export function GlassDashboard({
  extensionActivity,
  savePath,
  url,
  urlType,
  selectedQualityId,
  subtitlesEnabled,
  isAudioOnly,
  isDarkMode,
  isScheduling,
  scheduledTime,
  canSubmit,
  isProcessing,
  playlistInfo,
  isFetchingPlaylist,
  formatsError,
  currentView,
  activeDownloads,
  scheduledDownloads,
  history,
  fileInputRef,
  onUrlChange,
  onFileImport,
  onSelectQualityId,
  onToggleSubtitles,
  onScheduledTimeChange,
  onSetPresetDate,
  onPrimaryAction,
  onToggleScheduling,
  onChangeView,
  onCancelDownload,
  onCancelScheduledDownload,
  onToggleDownloadLogs,
  onToggleHistoryLogs,
  onOpenFolder,
  onRemoveFromHistory,
  onClearHistory,
  onOpenSettings,
  onToggleDarkMode,
  onSelectFolder,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  onCloseWindow,
}: GlassDashboardProps) {
  const queueCount = activeDownloads.length + scheduledDownloads.length;
  const historyPages = paginateItems(history, () => 1, HISTORY_PAGE_CAPACITY);
  const historyPageCount = Math.max(1, historyPages.length);
  const [historyPage, setHistoryPage] = useState(1);
  const isLightMode = !isDarkMode;

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount));
  }, [historyPageCount]);

  const visibleHistory = historyPages[historyPage - 1] ?? [];

  return (
    <div
      className={cn(
        "relative h-[100dvh] overflow-hidden",
        isLightMode
          ? "bg-[#f6f1e8] text-stone-900"
          : "bg-[#09090b] text-zinc-50",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={onFileImport}
        className="hidden"
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isLightMode
            ? "bg-[radial-gradient(circle_at_top_left,rgba(194,145,91,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(132,169,140,0.18),transparent_36%)]"
            : "bg-[radial-gradient(circle_at_top_left,rgba(38,38,92,0.35),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(6,95,70,0.28),transparent_36%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 [background-size:72px_72px]",
          isLightMode
            ? "opacity-[0.04] [background-image:linear-gradient(rgba(68,64,60,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(68,64,60,0.12)_1px,transparent_1px)]"
            : "opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)]",
        )}
      />

      <UtilityChrome
        extensionActivity={extensionActivity}
        savePath={savePath}
        isDarkMode={isDarkMode}
        onOpenFolder={() => onOpenFolder(savePath)}
        onSelectFolder={onSelectFolder}
        onOpenSettings={onOpenSettings}
        onToggleDarkMode={onToggleDarkMode}
        onStartDrag={onStartDrag}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onCloseWindow}
      />

      <main className="relative z-10 mx-auto grid h-[100dvh] w-full max-w-[1400px] grid-cols-1 gap-8 overflow-hidden px-4 pb-8 pt-20 md:px-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-16 lg:px-12">
        <section className="flex flex-col lg:sticky lg:top-8 lg:h-fit">
          <div className="min-h-[92px] pb-5" />

          <div
            className={cn(
              "relative -top-[4.5rem] flex h-[600px] flex-col gap-5 rounded-[2.5rem] px-6 py-4 backdrop-blur-3xl sm:px-8 sm:py-6",
              isLightMode
                ? "border border-stone-300/80 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_24px_60px_-26px_rgba(120,101,79,0.34)]"
                : "border border-white/5 bg-zinc-900/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_40px_-15px_rgba(0,0,0,0.55)]",
            )}
          >
            <div className="relative">
              <label
                className={cn(
                  "mb-3 block text-[10px] font-bold uppercase tracking-[0.24em]",
                  isLightMode ? "text-stone-500" : "text-zinc-400",
                )}
              >
                Target source
              </label>
              <textarea
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                rows={3}
                placeholder="Paste URL or text list here..."
                className={cn(
                  "scrollbar-hidden w-full resize-none rounded-[1.4rem] p-4 pr-24 font-mono text-sm outline-none transition-colors",
                  isLightMode
                    ? "border border-stone-300/80 bg-[#fcfaf7] text-stone-800 placeholder:text-stone-400 focus:border-amber-700"
                    : "border border-zinc-800 bg-zinc-950/55 text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500",
                )}
              />
              {urlType && (
                <div
                  className={cn(
                    "absolute bottom-3 right-2 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-md",
                    isLightMode
                      ? "border border-stone-300/80 bg-white/85 text-stone-700"
                      : "border border-zinc-700/50 bg-zinc-800/80 text-zinc-200",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {urlType === "playlist" ? (
                      <List className="h-3 w-3 text-emerald-400" />
                    ) : urlType === "batch" ? (
                      <FileText className="h-3 w-3 text-sky-400" />
                    ) : (
                      <Video className="h-3 w-3 text-indigo-400" />
                    )}
                    {urlType}
                  </span>
                </div>
              )}
            </div>

            {urlType === "playlist" && playlistInfo && !isFetchingPlaylist && (
              <div
                className={cn(
                  "rounded-[1.5rem] p-4",
                  isLightMode
                    ? "border border-emerald-700/20 bg-emerald-50/90"
                    : "border border-emerald-500/15 bg-emerald-500/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "rounded-2xl p-3",
                      isLightMode
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-emerald-500/12 text-emerald-300",
                    )}
                  >
                    <List className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-[0.22em]",
                        isLightMode
                          ? "text-emerald-700/80"
                          : "text-emerald-400/80",
                      )}
                    >
                      Playlist detected
                    </div>
                    <h3
                      className={cn(
                        "mt-1 truncate text-base font-semibold tracking-tight",
                        isLightMode ? "text-stone-900" : "text-zinc-100",
                      )}
                    >
                      {playlistInfo.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-1 text-sm",
                        isLightMode ? "text-stone-600" : "text-zinc-400",
                      )}
                    >
                      {playlistInfo.channel} · {playlistInfo.video_count} items
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isFetchingPlaylist && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-[1.25rem] px-4 py-3 text-sm",
                  isLightMode
                    ? "border border-stone-300/80 bg-white/75 text-stone-600"
                    : "border border-zinc-800/80 bg-zinc-950/45 text-zinc-400",
                )}
              >
                <Loader2
                  className={cn(
                    "h-4 w-4 animate-spin",
                    isLightMode ? "text-stone-500" : "text-zinc-500",
                  )}
                />
                Fetching playlist metadata...
              </div>
            )}

            {formatsError && (
              <div
                className={cn(
                  "rounded-[1.25rem] px-4 py-3 text-sm",
                  isLightMode
                    ? "border border-red-300 bg-red-50 text-red-700"
                    : "border border-red-500/20 bg-red-500/10 text-red-300",
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formatsError}</span>
                </div>
              </div>
            )}

            <div>
              <label
                className={cn(
                  "mb-3 block text-[10px] font-bold uppercase tracking-[0.24em]",
                  isLightMode ? "text-stone-500" : "text-zinc-400",
                )}
              >
                Format extraction
              </label>
              <div className="grid grid-cols-4 gap-2">
                {BATCH_QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectQualityId(option.id)}
                    className={cn(
                      "rounded-2xl px-2 py-3 text-xs font-semibold tracking-wide transition-all duration-200 active:scale-[0.97]",
                      selectedQualityId === option.id
                        ? isLightMode
                          ? "bg-stone-900 text-stone-50 shadow-[0_16px_35px_-22px_rgba(68,64,60,0.55)]"
                          : "bg-zinc-100 text-zinc-950 shadow-[0_0_20px_-5px_rgba(255,255,255,0.28)]"
                        : isLightMode
                          ? "border border-stone-300/80 bg-white/70 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                          : "border border-zinc-800/50 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                    )}
                  >
                    {option.id === "audio" ? "Audio Only" : `${option.id}p`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={onToggleSubtitles}
                className={cn(
                  "group inline-flex self-start items-center gap-3 rounded-2xl border py-4 pl-4 pr-[28px] text-left transition-colors",
                  isAudioOnly
                    ? isLightMode
                      ? "cursor-not-allowed border-stone-300 bg-stone-100/80 text-stone-400"
                      : "cursor-not-allowed border-zinc-900 bg-zinc-950/35 text-zinc-600"
                    : isLightMode
                      ? "cursor-pointer border-stone-300/80 bg-white/75 text-stone-700 hover:border-stone-400"
                      : "cursor-pointer border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700",
                )}
                disabled={isAudioOnly}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-[0.45rem] transition-all duration-300",
                    subtitlesEnabled
                      ? isLightMode
                        ? "bg-stone-900 text-stone-50"
                        : "bg-zinc-100 text-zinc-950"
                      : isAudioOnly
                        ? isLightMode
                          ? "bg-stone-200 text-transparent"
                          : "bg-zinc-900 text-transparent"
                        : isLightMode
                          ? "bg-stone-200 text-transparent group-hover:bg-stone-300"
                          : "bg-zinc-800 text-transparent group-hover:bg-zinc-700",
                  )}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span
                  className={cn(
                    "-ml-1 whitespace-nowrap text-sm font-medium",
                    isLightMode ? "text-stone-700" : "text-zinc-300",
                  )}
                >
                  Embed subtitles
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "group -ml-[4px] inline-flex self-start items-center gap-3 rounded-2xl border py-4 pl-[14px] pr-[60px] text-left transition-colors",
                  isLightMode
                    ? "border-stone-300/80 bg-white/75 hover:border-stone-400"
                    : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-[0.45rem] transition-all duration-300",
                    isLightMode
                      ? "bg-stone-200 text-stone-600 group-hover:bg-stone-300 group-hover:text-stone-900"
                      : "bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
                <span
                  className={cn(
                    "-ml-1 whitespace-nowrap text-sm font-medium",
                    isLightMode ? "text-stone-700" : "text-zinc-300",
                  )}
                >
                  Upload .txt
                </span>
              </button>
            </div>

            <div className="min-h-[112px]">
              <div
                className={cn(
                  "space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4 transition-opacity duration-200",
                  isScheduling
                    ? "opacity-100"
                    : "pointer-events-none opacity-0",
                  isLightMode && "border-stone-300/80 bg-white/78",
                )}
              >
                <div className="flex gap-2">
                  {(["1h", "3h", "Tonight", "Tomorrow"] as const).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onSetPresetDate(preset)}
                        className={cn(
                          "flex-1 rounded-xl py-2 text-xs font-medium transition-colors",
                          isLightMode
                            ? "bg-stone-100 text-stone-700 hover:bg-stone-200"
                            : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700",
                        )}
                      >
                        {preset}
                      </button>
                    ),
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(event) =>
                    onScheduledTimeChange(event.target.value)
                  }
                  className={cn(
                    "w-full rounded-xl bg-transparent px-4 py-2 font-mono text-sm outline-none transition-colors",
                    isLightMode
                      ? "border border-stone-300 bg-[#fcfaf7] text-stone-800 focus:border-amber-700"
                      : "border border-zinc-700 text-zinc-200 focus:border-zinc-400",
                  )}
                />
              </div>
            </div>

            <div className="mt-auto space-y-3 pt-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={onPrimaryAction}
                  disabled={!canSubmit}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-2xl py-4 font-bold tracking-tight transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
                    isLightMode
                      ? "bg-stone-900 text-stone-50 shadow-[0_22px_40px_-28px_rgba(68,64,60,0.75)] hover:bg-stone-800"
                      : "bg-zinc-100 text-zinc-950 shadow-[0_0_40px_-15px_rgba(255,255,255,0.35)] hover:bg-white",
                  )}
                >
                  {isScheduling ? (
                    <Clock className="h-5 w-5" />
                  ) : isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5" strokeWidth={2.5} />
                  )}
                  {isScheduling ? "Queue Scheduled" : "Start Download"}
                </button>
                <button
                   type="button"
                   onClick={onToggleScheduling}
                   className={cn(
                     "rounded-2xl border p-4 transition-all duration-200 active:scale-[0.97]",
                     isScheduling
                       ? isLightMode
                         ? "border-stone-500 bg-stone-900 text-stone-50"
                         : "border-zinc-700 bg-zinc-800 text-zinc-100"
                       : isLightMode
                         ? "border-stone-300/80 bg-white/75 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                         : "border-zinc-800/80 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                   )}
                 >
                   <Calendar className="h-5 w-5" />
                 </button>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col">
          <div className="flex min-h-[92px] flex-col justify-end pb-5">
            <div
              className={cn(
                "relative -top-8 flex items-center justify-between border-b px-1",
                isLightMode ? "border-stone-300/80" : "border-zinc-800/60",
              )}
            >
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => onChangeView("active")}
                  className={cn(
                    "relative pb-4 text-lg font-semibold tracking-tight transition-colors",
                    currentView === "active"
                      ? isLightMode
                        ? "text-stone-900"
                        : "text-zinc-100"
                      : isLightMode
                        ? "text-stone-500 hover:text-stone-800"
                        : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  Active Downloads
                  {currentView === "active" && (
                    <span
                      className={cn(
                        "absolute bottom-[4px] left-0 right-0 h-[2px]",
                        isLightMode
                          ? "bg-amber-700 shadow-[0_0_10px_rgba(180,83,9,0.24)]"
                          : "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]",
                      )}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeView("history")}
                  className={cn(
                    "relative pb-4 text-lg font-semibold tracking-tight transition-colors",
                    currentView === "history"
                      ? isLightMode
                        ? "text-stone-900"
                        : "text-zinc-100"
                      : isLightMode
                        ? "text-stone-500 hover:text-stone-800"
                        : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  Process History
                  {currentView === "history" && (
                    <span
                      className={cn(
                        "absolute bottom-[4px] left-0 right-0 h-[2px]",
                        isLightMode
                          ? "bg-amber-700 shadow-[0_0_10px_rgba(180,83,9,0.24)]"
                          : "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]",
                      )}
                    />
                  )}
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2">
                {currentView === "history" && history.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[10px] font-sans font-extrabold uppercase tracking-[0.14em] transition-colors",
                      isLightMode
                        ? "border-stone-300 bg-white/85 text-stone-700 hover:border-stone-400 hover:text-stone-950"
                        : "border-zinc-800 bg-zinc-900/90 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100",
                    )}
                  >
                    Clear
                  </button>
                )}
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-sans font-extrabold uppercase tracking-[0.14em]",
                    isLightMode
                      ? "border-stone-300 bg-white/85 text-stone-700"
                      : "border-zinc-800 bg-zinc-900/90 text-zinc-300",
                  )}
                >
                  {currentView === "active"
                    ? `${queueCount} queued`
                    : `${history.length} logs`}
                </span>
                {currentView === "history" && historyPageCount > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        isLightMode
                          ? "border-stone-300 bg-white/85 text-stone-500 hover:border-stone-400 hover:text-stone-900"
                          : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                      )}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className={cn(
                        "min-w-[3rem] text-center text-[10px] font-sans font-extrabold uppercase tracking-[0.14em]",
                        isLightMode ? "text-stone-700" : "text-zinc-300",
                      )}
                    >
                      {historyPage}/{historyPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setHistoryPage((p) => Math.min(historyPageCount, p + 1))
                      }
                      disabled={historyPage === historyPageCount}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        isLightMode
                          ? "border-stone-300 bg-white/85 text-stone-500 hover:border-stone-400 hover:text-stone-900"
                          : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                      )}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative -top-[4.5rem] h-[660px] overflow-hidden">
            {currentView === "active" ? (
              activeDownloads.length === 0 &&
              scheduledDownloads.length === 0 ? (
                <div className="h-full overflow-hidden overscroll-none pr-1 pt-8">
                  <EmptyStateCard
                    className="h-[calc(100%-2rem)] min-h-[calc(560px-2rem)]"
                    icon={AlertCircle}
                    title="Queue is idle"
                    description="Provide a target URL to initiate processing."
                    isDarkMode={isDarkMode}
                  />
                </div>
              ) : (
                <div className="relative h-full pr-1 pt-8">
                  <div
                    className={cn(
                      "h-[calc(100%-2rem)] min-h-[calc(560px-2rem)] overflow-hidden rounded-[2rem] border",
                      isLightMode
                        ? "border-stone-300/80 bg-white/56 shadow-[0_24px_60px_-30px_rgba(120,101,79,0.22)]"
                        : "border-zinc-800/50 bg-zinc-900/20",
                    )}
                  >
                    <div className="glass-scroll h-full overflow-y-auto p-5">
                      {scheduledDownloads.length > 0 && (
                        <div className="flex flex-col gap-3">
                          <h3
                            className={cn(
                              "flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.22em]",
                              isLightMode ? "text-stone-500" : "text-zinc-500",
                            )}
                          >
                            <Calendar className="h-3 w-3" />
                            Scheduled dispatch
                          </h3>
                          {scheduledDownloads.map((item) => (
                            <ScheduledDownloadCard
                              key={item.id}
                              item={item}
                              onCancel={onCancelScheduledDownload}
                              isDarkMode={isDarkMode}
                            />
                          ))}
                        </div>
                      )}

                      {activeDownloads.length > 0 && (
                        <div
                          className={cn(
                            "flex flex-col gap-4",
                            scheduledDownloads.length > 0 && "mt-6",
                          )}
                        >
                          {activeDownloads.map((item) => (
                            <ActiveDownloadCard
                              key={item.id}
                              item={item}
                              onCancel={onCancelDownload}
                              onToggleLogs={onToggleDownloadLogs}
                              isDarkMode={isDarkMode}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : history.length === 0 ? (
              <div className="h-full overflow-hidden overscroll-none pr-1 pt-8">
                <EmptyStateCard
                  className="h-[calc(100%-2rem)] min-h-[calc(560px-2rem)]"
                  icon={FileText}
                  title="No history found"
                  description="Completed and failed processes will appear here."
                  isDarkMode={isDarkMode}
                />
              </div>
            ) : (
              <div className="relative h-full min-h-0 pr-1 pt-8">
                <div
                  className={cn(
                    "h-[calc(100%-2rem)] min-h-[calc(560px-2rem)] overflow-hidden rounded-[2rem] border",
                    isLightMode
                      ? "border-stone-300/80 bg-white/56 shadow-[0_24px_60px_-30px_rgba(120,101,79,0.22)]"
                      : "border-zinc-800/50 bg-zinc-900/20",
                  )}
                >
                  <div className="glass-scroll flex h-full min-h-0 flex-col overflow-y-auto">
                    {visibleHistory.map((item, index, items) => (
                      <HistoryDownloadCard
                        key={item.id}
                        item={item}
                        isLast={index === items.length - 1}
                        onToggleLogs={onToggleHistoryLogs}
                        onOpenFolder={onOpenFolder}
                        onRemove={onRemoveFromHistory}
                        isDarkMode={isDarkMode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function UtilityChrome({
  extensionActivity,
  savePath,
  isDarkMode,
  onOpenFolder,
  onSelectFolder,
  onOpenSettings,
  onToggleDarkMode,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  extensionActivity: string;
  savePath: string;
  isDarkMode: boolean;
  onOpenFolder: () => void;
  onSelectFolder: () => void;
  onOpenSettings: () => void;
  onToggleDarkMode: () => void;
  onStartDrag: MouseEventHandler<HTMLDivElement>;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  const isLightMode = !isDarkMode;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center px-4 md:px-6">
      <div
        className="pointer-events-auto flex h-full flex-1 items-center pl-6 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
        onMouseDown={onStartDrag}
        onDoubleClick={onToggleMaximize}
      >
        <div className="pointer-events-none flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-[0.95rem]",
              isLightMode
                ? "bg-gradient-to-br from-stone-900 to-stone-700 text-stone-50 shadow-[0_20px_36px_-20px_rgba(120,101,79,0.5)]"
                : "bg-gradient-to-br from-zinc-100 to-zinc-300 text-zinc-950 shadow-[0_16px_40px_-18px_rgba(255,255,255,0.45)]",
            )}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                "text-base font-semibold tracking-[-0.04em]",
                isLightMode ? "text-stone-900" : "text-zinc-100",
              )}
            >
              yt-dlp
            </span>
            <span
              className={cn(
                "text-xs tracking-tight",
                isLightMode ? "text-stone-500" : "text-zinc-500",
              )}
            >
              High-performance download orchestration.
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {extensionActivity && (
          <div
            className={cn(
              "hidden max-w-[300px] truncate rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] xl:block",
              isLightMode
                ? "border-stone-300 bg-white/80 text-stone-500"
                : "border-zinc-800 bg-zinc-900/80 text-zinc-500",
            )}
          >
            {extensionActivity}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleDarkMode}
          className={cn(
            "rounded-full border p-2 transition-colors",
            isLightMode
              ? "border-stone-300 bg-white/80 text-stone-600 hover:border-stone-400 hover:text-stone-900"
              : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
          )}
          title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenFolder}
          disabled={!savePath}
          className={cn(
            "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed lg:flex",
            isLightMode
              ? "border-stone-300 bg-white/80 text-stone-600 hover:border-stone-400 hover:text-stone-900 disabled:text-stone-400"
              : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:text-zinc-600",
          )}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">
            {getLeafPathLabel(savePath)}
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectFolder}
          className={cn(
            "rounded-full border p-2 transition-colors",
            isLightMode
              ? "border-stone-300 bg-white/80 text-stone-600 hover:border-stone-400 hover:text-stone-900"
              : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
          )}
          title="Choose folder"
        >
          <Folder className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className={cn(
            "rounded-full border p-2 transition-colors",
            isLightMode
              ? "border-stone-300 bg-white/80 text-stone-600 hover:border-stone-400 hover:text-stone-900"
              : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
          )}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <div
          className={cn(
            "flex overflow-hidden rounded-full border",
            isLightMode
              ? "border-stone-300 bg-white/90"
              : "border-zinc-800 bg-zinc-900/90",
          )}
        >
          <button
            type="button"
            onClick={onMinimize}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors",
              isLightMode
                ? "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
            )}
            title="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            className={cn(
              "flex h-9 w-9 items-center justify-center transition-colors",
              isLightMode
                ? "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
            )}
            title="Maximize"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center text-zinc-500 transition-colors hover:bg-red-500/80 hover:text-white"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyStateCard({
  className,
  icon: Icon,
  title,
  description,
  isDarkMode,
}: {
  className?: string;
  icon: typeof AlertCircle;
  title: string;
  description: string;
  isDarkMode: boolean;
}) {
  const isLightMode = !isDarkMode;
  return (
    <div
      className={cn(
        "flex h-full min-h-[560px] flex-col items-center justify-start overflow-hidden rounded-[2.5rem] px-6 pt-48 text-center",
        isLightMode
          ? "border border-dashed border-stone-300 bg-white/55 shadow-[inset_0_0_0_1px_rgba(214,211,209,0.65)]"
          : "border border-dashed border-zinc-700/80 bg-zinc-900/10 shadow-[inset_0_0_0_1px_rgba(63,63,70,0.35)]",
        className,
      )}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "mb-4 flex h-12 w-12 items-center justify-center rounded-full border",
            isLightMode
              ? "border-stone-300 bg-white/90 text-stone-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
              : "border-zinc-800 bg-zinc-900/80 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <p
          className={cn(
            "font-medium tracking-tight",
            isLightMode ? "text-stone-700" : "text-zinc-400",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "mt-1 text-sm",
            isLightMode ? "text-stone-500" : "text-zinc-600",
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  phase,
  isDarkMode,
}: {
  phase: string;
  isDarkMode: boolean;
}) {
  const configs: Record<
    string,
    { color: string; icon: typeof Clock; pulse?: boolean }
  > = {
    PENDING: {
      color: isDarkMode
        ? "border-zinc-700/50 bg-zinc-800/50 text-zinc-400"
        : "border-stone-300 bg-stone-100 text-stone-600",
      icon: Clock,
    },
    VIDEO: {
      color: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
      icon: Video,
      pulse: true,
    },
    AUDIO: {
      color: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      icon: Music,
      pulse: true,
    },
    MERGING: {
      color: "border-amber-500/20 bg-amber-500/10 text-amber-400",
      icon: Settings2,
      pulse: true,
    },
    PROCESSING: {
      color: "border-amber-500/20 bg-amber-500/10 text-amber-400",
      icon: Settings2,
      pulse: true,
    },
    COMPLETED: {
      color: isDarkMode
        ? "border-zinc-300 bg-zinc-100 text-zinc-950"
        : "border-stone-900 bg-stone-900 text-stone-50",
      icon: CheckCircle2,
    },
    ERROR: { color: "border-red-500/20 bg-red-500/10 text-red-400", icon: X },
    CANCELLED: {
      color: isDarkMode
        ? "border-zinc-700 bg-zinc-800 text-zinc-500"
        : "border-stone-300 bg-stone-100 text-stone-500",
      icon: X,
    },
    SCHEDULED: {
      color: isDarkMode
        ? "border-zinc-700/50 bg-zinc-800/50 text-zinc-400"
        : "border-stone-300 bg-stone-100 text-stone-600",
      icon: Calendar,
    },
  };
  const config = configs[phase] || configs.PENDING;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]",
        config.color,
      )}
    >
      <span className={config.pulse ? "animate-pulse" : ""}>
        <Icon className="h-3 w-3" />
      </span>
      {phase}
    </span>
  );
}

function MultiPhaseProgressBar({
  progress,
  phase,
  isDarkMode,
}: {
  progress: number;
  phase: string;
  isDarkMode: boolean;
}) {
  const activeColor =
    phase === "VIDEO"
      ? "bg-indigo-500"
      : phase === "AUDIO"
        ? "bg-emerald-500"
        : phase === "MERGING" || phase === "PROCESSING"
          ? "bg-amber-500"
          : "bg-zinc-600";

  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full border",
        isDarkMode
          ? "border-zinc-800/80 bg-zinc-950"
          : "border-stone-300 bg-stone-100",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-[50%] z-10 w-[2px]",
          isDarkMode ? "bg-[#09090b]" : "bg-[#f6f1e8]",
        )}
      />
      <div
        className={cn(
          "absolute inset-y-0 left-[95%] z-10 w-[2px]",
          isDarkMode ? "bg-[#09090b]" : "bg-[#f6f1e8]",
        )}
      />
      <div
        className={cn(
          "h-full transition-[width] duration-200 ease-out",
          activeColor,
        )}
        style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
      />
    </div>
  );
}

function ActiveDownloadCard({
  item,
  onCancel,
  onToggleLogs,
  isDarkMode,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
  onToggleLogs: (id: string) => void;
  isDarkMode: boolean;
}) {
  const phaseLabel = getPhaseLabel(item);
  const isLightMode = !isDarkMode;

  return (
    <div
      className={cn(
        "rounded-[2rem] border p-6 backdrop-blur-md transition-colors",
        isLightMode
          ? "border-stone-300/80 bg-white/80 shadow-[0_24px_50px_-32px_rgba(120,101,79,0.3)] hover:bg-white/92"
          : "border-zinc-800/60 bg-zinc-900/30 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.5)] hover:bg-zinc-900/45",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4
            className={cn(
              "truncate text-lg font-medium tracking-tight",
              isLightMode ? "text-stone-900" : "text-zinc-100",
            )}
          >
            {item.title}
          </h4>
          <p
            className={cn(
              "mt-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]",
              isLightMode ? "text-stone-500" : "text-zinc-500",
            )}
          >
            <span className={isLightMode ? "text-stone-600" : "text-zinc-400"}>
              {item.format
                ? formatQualityLabel(item.format, Boolean(item.subtitles))
                : "Queued"}
            </span>
            <span className="opacity-50">•</span>
            <span>{item.status}</span>
            {item.subtitles && (
              <>
                <span className="opacity-50">•</span>
                <span className="text-emerald-500/70">+subs</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge phase={phaseLabel} isDarkMode={isDarkMode} />
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400",
              isLightMode
                ? "border-stone-300 bg-stone-100 text-stone-500"
                : "border-zinc-700/50 bg-zinc-800/80 text-zinc-400",
            )}
            title="Cancel download"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <MultiPhaseProgressBar
          progress={item.progress}
          phase={phaseLabel}
          isDarkMode={isDarkMode}
        />
      </div>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center justify-between gap-3 text-xs",
          isLightMode ? "text-stone-500" : "text-zinc-500",
        )}
      >
        <div className="flex items-center gap-5 font-mono">
          <span
            className={cn(
              "font-medium",
              isLightMode ? "text-stone-700" : "text-zinc-300",
            )}
          >
            {item.progress.toFixed(1)}%
          </span>
          <span>{item.speed}</span>
          <span>{item.eta}</span>
          <span>{item.size}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggleLogs(item.id)}
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
            isLightMode
              ? "text-stone-500 hover:text-stone-900"
              : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {item.isLogsOpen ? "Hide logs" : "Show logs"}
        </button>
      </div>

      {item.isLogsOpen && (
        <div
          className={cn(
            "mt-4 whitespace-pre-wrap rounded-[1.2rem] border p-4 font-mono text-[11px] leading-relaxed",
            isLightMode
              ? "border-stone-300 bg-[#fcfaf7] text-stone-600"
              : "border-zinc-800/80 bg-zinc-950/70 text-zinc-400",
          )}
        >
          {item.logs?.length ? item.logs.join("\n") : "No logs yet."}
        </div>
      )}
    </div>
  );
}

function ScheduledDownloadCard({
  item,
  onCancel,
  isDarkMode,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
  isDarkMode: boolean;
}) {
  const isLightMode = !isDarkMode;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl border p-4",
        isLightMode
          ? "border-stone-300 bg-white/72"
          : "border-zinc-800/40 bg-zinc-900/20",
      )}
    >
      <div className="border-l-2 border-sky-500/50 pl-3">
        <h4
          className={cn(
            "max-w-[340px] truncate text-sm font-medium",
            isLightMode ? "text-stone-800" : "text-zinc-300",
          )}
        >
          {item.title}
        </h4>
        <div
          className={cn(
            "mt-1 flex gap-3 font-mono text-[10px] uppercase tracking-[0.18em]",
            isLightMode ? "text-stone-500" : "text-zinc-500",
          )}
        >
          <span>Dispatch: {formatScheduledForLabel(item.scheduledFor)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCancel(item.id)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-red-400/10 hover:text-red-400",
          isLightMode ? "text-stone-500" : "text-zinc-500",
        )}
        title="Cancel scheduled download"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function HistoryDownloadCard({
  item,
  isLast,
  onToggleLogs,
  onOpenFolder,
  onRemove,
  isDarkMode,
}: {
  item: DownloadItem;
  isLast: boolean;
  onToggleLogs: (id: string, isOpen?: boolean) => void;
  onOpenFolder: (path: string) => void;
  onRemove: (id: string) => void;
  isDarkMode: boolean;
}) {
  const isSuccess = item.status === "completed";
  const isError = item.status === "error";
  const isLightMode = !isDarkMode;
  const accentClass = isSuccess
    ? "bg-emerald-500"
    : isError
      ? "bg-red-500"
      : "bg-amber-500";

  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden",
        isLightMode ? "hover:bg-stone-100/80" : "hover:bg-zinc-800/30",
        !isLast &&
          (isLightMode
            ? "border-b border-stone-300/80"
            : "border-b border-zinc-800/50"),
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] opacity-70",
          accentClass,
        )}
      />

      <button
        type="button"
        onClick={() => onToggleLogs(item.id)}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <div className="min-w-0">
          <h4
            className={cn(
              "truncate text-sm font-medium",
              isLightMode ? "text-stone-800" : "text-zinc-300",
            )}
          >
            {item.title}
          </h4>
          <div
            className={cn(
              "mt-1.5 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.18em]",
              isLightMode ? "text-stone-500" : "text-zinc-600",
            )}
          >
            <span>
              {item.completedAt
                ? new Date(item.completedAt).toLocaleTimeString()
                : "--:--"}
            </span>
            <span>{item.size}</span>
            <span
              className={cn(
                isSuccess
                  ? "text-emerald-500/70"
                  : isError
                    ? "text-red-500/70"
                    : "text-amber-500/70",
              )}
            >
              {item.status}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.id);
            }}
            className={cn(
              "rounded-xl border p-2 text-zinc-400 opacity-0 transition-all hover:bg-red-400/10 group-hover:opacity-100",
              isLightMode
                ? "border-stone-300 bg-white text-stone-500 hover:text-red-500"
                : "border-zinc-700/50 bg-zinc-800 text-zinc-400 hover:text-red-300",
            )}
            title="Remove from history"
          >
            <X className="h-4 w-4" />
          </button>
          {isSuccess && item.downloadPath && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenFolder(item.downloadPath!);
              }}
              className={cn(
                "rounded-xl border p-2 opacity-0 transition-all group-hover:opacity-100",
                isLightMode
                  ? "border-stone-300 bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  : "border-zinc-700/50 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
              )}
              title="Open destination"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isLightMode ? "text-stone-400" : "text-zinc-600",
              item.isLogsOpen && "rotate-180",
            )}
          />
        </div>
      </button>

      {item.isLogsOpen && (
        <div className="-mt-2 px-5 pb-10">
          <div
            className={cn(
              "rounded-[1.2rem] border p-4 font-mono text-[11px] leading-relaxed",
              isLightMode
                ? "border-stone-300 bg-[#fcfaf7] text-stone-600"
                : "border-zinc-800/80 bg-zinc-950/70 text-zinc-500",
            )}
          >
            {item.logs?.length ? (
              item.logs.map((log, index) => (
                <div key={`${item.id}-log-${index}`}>{log}</div>
              ))
            ) : (
              <>
                <div>[yt-dlp] Extracting URL: {item.url}</div>
                <div>[download] Destination: {item.title}</div>
                <div>
                  {isSuccess
                    ? "Finished processing successfully."
                    : "Process terminated."}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
