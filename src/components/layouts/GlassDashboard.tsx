import { useEffect, useState, type MouseEventHandler } from "react";

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
  Music,
  Settings,
  Settings2,
  Square,
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
  onUrlChange: (value: string) => void;
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
  onSelectFolder: () => void;
  onStartDrag: MouseEventHandler<HTMLDivElement>;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
}

const QUEUE_PAGE_CAPACITY = 4;
const HISTORY_PAGE_CAPACITY = 8;

type QueueViewItem =
  | { kind: "scheduled"; item: DownloadItem }
  | { kind: "active"; item: DownloadItem };

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
  activeDownloads,
  scheduledDownloads,
  history,
  onUrlChange,
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
  onSelectFolder,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  onCloseWindow,
}: GlassDashboardProps) {
  const queueCount = activeDownloads.length + scheduledDownloads.length;
  const queueItems: QueueViewItem[] = [
    ...scheduledDownloads.map((item) => ({ kind: "scheduled" as const, item })),
    ...activeDownloads.map((item) => ({ kind: "active" as const, item })),
  ];
  const queuePages = paginateItems(
    queueItems,
    (entry) => (entry.kind === "scheduled" ? 1 : entry.item.isLogsOpen ? 4 : 2),
    QUEUE_PAGE_CAPACITY,
  );
  const historyPages = paginateItems(
    history,
    (item) => (item.isLogsOpen ? 4 : 1),
    HISTORY_PAGE_CAPACITY,
  );
  const queuePageCount = Math.max(1, queuePages.length);
  const historyPageCount = Math.max(1, historyPages.length);
  const [queuePage, setQueuePage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setQueuePage((page) => Math.min(page, queuePageCount));
  }, [queuePageCount]);

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount));
  }, [historyPageCount]);

  const visibleQueueItems = queuePages[queuePage - 1] ?? [];
  const visibleScheduledDownloads = visibleQueueItems
    .filter((entry) => entry.kind === "scheduled")
    .map((entry) => entry.item);
  const visibleActiveDownloads = visibleQueueItems
    .filter((entry) => entry.kind === "active")
    .map((entry) => entry.item);
  const visibleHistory = historyPages[historyPage - 1] ?? [];

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#09090b] text-zinc-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(38,38,92,0.35),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(6,95,70,0.28),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:72px_72px]" />

      <UtilityChrome
        extensionActivity={extensionActivity}
        savePath={savePath}
        onOpenFolder={() => onOpenFolder(savePath)}
        onSelectFolder={onSelectFolder}
        onOpenSettings={onOpenSettings}
        onStartDrag={onStartDrag}
        onMinimize={onMinimize}
        onToggleMaximize={onToggleMaximize}
        onClose={onCloseWindow}
      />

      <main className="relative z-10 mx-auto grid h-[100dvh] w-full max-w-[1400px] grid-cols-1 gap-8 overflow-hidden px-4 pb-8 pt-20 md:px-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-16 lg:px-12">
        <section className="flex flex-col lg:sticky lg:top-8 lg:h-fit">
          <div className="min-h-[92px] pb-5" />

          <div className="relative -top-[4.5rem] flex h-[560px] flex-col gap-5 rounded-[2.5rem] border border-white/5 bg-zinc-900/40 px-6 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_40px_-15px_rgba(0,0,0,0.55)] backdrop-blur-3xl sm:px-8 sm:py-6">
            <div className="relative">
              <label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
                Target source
              </label>
              <textarea
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                rows={3}
                placeholder="Paste URL or text list here..."
                className="w-full resize-none rounded-[1.4rem] border border-zinc-800 bg-zinc-950/55 p-4 pr-24 font-mono text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-500"
              />
              {urlType && (
                <div className="absolute bottom-3 right-3 rounded-lg border border-zinc-700/50 bg-zinc-800/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200 backdrop-blur-md">
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

            {urlType === "batch" && (
              <div className="rounded-[1.4rem] border border-zinc-800 bg-zinc-950/45 p-4">
                <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                  Detected {urlLines.length} targets
                </div>
                <div className="space-y-1 font-mono text-xs text-zinc-400/80">
                  {urlLines.slice(0, 3).map((line, index) => (
                    <div key={`${line}-${index}`} className="truncate">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {urlType === "playlist" && playlistInfo && !isFetchingPlaylist && (
              <div className="rounded-[1.5rem] border border-emerald-500/15 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-emerald-500/12 p-3 text-emerald-300">
                    <List className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400/80">
                      Playlist detected
                    </div>
                    <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-zinc-100">
                      {playlistInfo.title}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      {playlistInfo.channel} · {playlistInfo.video_count} items
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isFetchingPlaylist && (
              <div className="flex items-center gap-2 rounded-[1.25rem] border border-zinc-800/80 bg-zinc-950/45 px-4 py-3 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                Fetching playlist metadata...
              </div>
            )}

            {formatsError && (
              <div className="rounded-[1.25rem] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formatsError}</span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-3 block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
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
                        ? "bg-zinc-100 text-zinc-950 shadow-[0_0_20px_-5px_rgba(255,255,255,0.28)]"
                        : "border border-zinc-800/50 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                    )}
                  >
                    {option.id === "audio" ? "Audio Only" : `${option.id}p`}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleSubtitles}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                isAudioOnly
                  ? "cursor-not-allowed border-zinc-900 bg-zinc-950/35 text-zinc-600"
                  : "cursor-pointer border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700",
              )}
              disabled={isAudioOnly}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-[0.45rem] transition-all duration-300",
                  subtitlesEnabled
                    ? "bg-zinc-100 text-zinc-950"
                    : isAudioOnly
                      ? "bg-zinc-900 text-transparent"
                      : "bg-zinc-800 text-transparent group-hover:bg-zinc-700",
                )}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm font-medium text-zinc-300">
                Embed subtitles (+subs)
              </span>
            </button>

            {isScheduling && (
              <div className="space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4">
                <div className="flex gap-2">
                  {(["1h", "3h", "Tonight", "Tomorrow"] as const).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onSetPresetDate(preset)}
                        className="flex-1 rounded-xl bg-zinc-800/50 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
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
                  className="w-full rounded-xl border border-zinc-700 bg-transparent px-4 py-2 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-zinc-400"
                />
              </div>
            )}

            <div className="mt-auto space-y-3 pt-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={onPrimaryAction}
                  disabled={!canSubmit}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-4 font-bold tracking-tight text-zinc-950 shadow-[0_0_40px_-15px_rgba(255,255,255,0.35)] transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
                      ? "border-zinc-700 bg-zinc-800 text-zinc-100"
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
            <div className="relative -top-8 flex items-center justify-between border-b border-zinc-800/60 px-1">
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => onChangeView("active")}
                  className={cn(
                    "relative pb-4 text-lg font-semibold tracking-tight transition-colors",
                    currentView === "active"
                      ? "text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  Active Downloads
                  {currentView === "active" && (
                    <span className="absolute bottom-[4px] left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeView("history")}
                  className={cn(
                    "relative pb-4 text-lg font-semibold tracking-tight transition-colors",
                    currentView === "history"
                      ? "text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  Process History
                  {currentView === "history" && (
                    <span className="absolute bottom-[4px] left-0 right-0 h-[2px] bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                  )}
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2">
                {currentView === "history" && history.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                )}
                <span className="rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                  {currentView === "active"
                    ? `${queueCount} queued`
                    : `${history.length} logs`}
                </span>
                {(() => {
                  const page = currentView === "active" ? queuePage : historyPage;
                  const totalPages = currentView === "active" ? queuePageCount : historyPageCount;
                  return totalPages > 1 ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          currentView === "active"
                            ? setQueuePage((p) => Math.max(1, p - 1))
                            : setHistoryPage((p) => Math.max(1, p - 1))
                        }
                        disabled={page === 1}
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[3rem] text-center text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                        {page}/{totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          currentView === "active"
                            ? setQueuePage((p) => Math.min(queuePageCount, p + 1))
                            : setHistoryPage((p) => Math.min(historyPageCount, p + 1))
                        }
                        disabled={page === totalPages}
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          <div className="relative -top-[4.5rem] h-[620px] overflow-hidden">
            {currentView === "active" ? (
              activeDownloads.length === 0 &&
                scheduledDownloads.length === 0 ? (
                <div className="h-full overflow-hidden overscroll-none pr-1 pt-8">
                  <EmptyStateCard
                    className="h-[calc(100%-2rem)] min-h-[calc(560px-2rem)]"
                    icon={AlertCircle}
                    title="Queue is idle"
                    description="Provide a target URL to initiate processing."
                  />
                </div>
              ) : (
                <div className="relative h-full pr-1 pt-8">
                  <div className="h-full overflow-y-auto pb-28">
                    <div className="min-h-full overflow-hidden rounded-[2rem] border border-zinc-800/50 bg-zinc-900/20 p-5">
                      {visibleScheduledDownloads.length > 0 && (
                        <div className="flex flex-col gap-3">
                          <h3 className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                            <Calendar className="h-3 w-3" />
                            Scheduled dispatch
                          </h3>
                          {visibleScheduledDownloads.map((item) => (
                            <ScheduledDownloadCard
                              key={item.id}
                              item={item}
                              onCancel={onCancelScheduledDownload}
                            />
                          ))}
                        </div>
                      )}

                      {visibleActiveDownloads.length > 0 && (
                        <div
                          className={cn(
                            "flex flex-col gap-4",
                            visibleScheduledDownloads.length > 0 && "mt-6",
                          )}
                        >
                          {visibleActiveDownloads.map((item) => (
                            <ActiveDownloadCard
                              key={item.id}
                              item={item}
                              onCancel={onCancelDownload}
                              onToggleLogs={onToggleDownloadLogs}
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
                />
              </div>
            ) : (
              <div className="relative h-full pr-1 pt-8">
                <div className="h-full overflow-y-auto pb-4">
                  <div className="flex h-[calc(100%-16px)] flex-col overflow-hidden rounded-[2rem] border border-zinc-800/50 bg-zinc-900/20">
                    {visibleHistory.map((item, index, items) => (
                      <HistoryDownloadCard
                        key={item.id}
                        item={item}
                        isLast={index === items.length - 1}
                        onToggleLogs={onToggleHistoryLogs}
                        onOpenFolder={onOpenFolder}
                        onRemove={onRemoveFromHistory}
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
  onOpenFolder,
  onSelectFolder,
  onOpenSettings,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  onClose,
}: {
  extensionActivity: string;
  savePath: string;
  onOpenFolder: () => void;
  onSelectFolder: () => void;
  onOpenSettings: () => void;
  onStartDrag: MouseEventHandler<HTMLDivElement>;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center px-4 md:px-6">
      <div
        className="pointer-events-auto flex h-full flex-1 items-center pl-6 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
        onMouseDown={onStartDrag}
        onDoubleClick={onToggleMaximize}
      >
        <div className="pointer-events-none flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[0.95rem] bg-gradient-to-br from-zinc-100 to-zinc-300 text-zinc-950 shadow-[0_16px_40px_-18px_rgba(255,255,255,0.45)]">
            <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-[-0.04em] text-zinc-100">
              yt-dlp
            </span>
            <span className="text-xs tracking-tight text-zinc-500">
              High-performance download orchestration.
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {extensionActivity && (
          <div className="hidden max-w-[300px] truncate rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 xl:block">
            {extensionActivity}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenFolder}
          disabled={!savePath}
          className="hidden items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600 lg:flex"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">
            {getLeafPathLabel(savePath)}
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectFolder}
          className="rounded-full border border-zinc-800 bg-zinc-900/80 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          title="Choose folder"
        >
          <Folder className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-full border border-zinc-800 bg-zinc-900/80 p-2 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <div className="flex overflow-hidden rounded-full border border-zinc-800 bg-zinc-900/90">
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-9 w-9 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            title="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            className="flex h-9 w-9 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
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
}: {
  className?: string;
  icon: typeof AlertCircle;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[560px] flex-col items-center justify-start rounded-[2.5rem] border border-dashed border-zinc-700/80 bg-zinc-900/10 px-6 pt-48 text-center shadow-[inset_0_0_0_1px_rgba(63,63,70,0.35)]",
        className,
      )}
    >
      <div className="flex flex-col items-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <Icon className="h-5 w-5" />
        </div>
        <p className="font-medium tracking-tight text-zinc-400">{title}</p>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
    </div>
  );
}



function StatusBadge({ phase }: { phase: string }) {
  const configs: Record<
    string,
    { color: string; icon: typeof Clock; pulse?: boolean }
  > = {
    PENDING: {
      color: "border-zinc-700/50 bg-zinc-800/50 text-zinc-400",
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
      color: "border-zinc-300 bg-zinc-100 text-zinc-950",
      icon: CheckCircle2,
    },
    ERROR: { color: "border-red-500/20 bg-red-500/10 text-red-400", icon: X },
    CANCELLED: { color: "border-zinc-700 bg-zinc-800 text-zinc-500", icon: X },
    SCHEDULED: {
      color: "border-zinc-700/50 bg-zinc-800/50 text-zinc-400",
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
}: {
  progress: number;
  phase: string;
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
    <div className="relative h-2 w-full overflow-hidden rounded-full border border-zinc-800/80 bg-zinc-950">
      <div className="absolute inset-y-0 left-[50%] z-10 w-[2px] bg-[#09090b]" />
      <div className="absolute inset-y-0 left-[95%] z-10 w-[2px] bg-[#09090b]" />
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
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
  onToggleLogs: (id: string) => void;
}) {
  const phaseLabel = getPhaseLabel(item);

  return (
    <div className="rounded-[2rem] border border-zinc-800/60 bg-zinc-900/30 p-6 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-colors hover:bg-zinc-900/45">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="truncate text-lg font-medium tracking-tight text-zinc-100">
            {item.title}
          </h4>
          <p className="mt-1.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span className="text-zinc-400">
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
          <StatusBadge phase={phaseLabel} />
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/80 text-zinc-400 transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400"
            title="Cancel download"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <MultiPhaseProgressBar progress={item.progress} phase={phaseLabel} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-5 font-mono">
          <span className="font-medium text-zinc-300">
            {item.progress.toFixed(1)}%
          </span>
          <span>{item.speed}</span>
          <span>{item.eta}</span>
          <span>{item.size}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggleLogs(item.id)}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {item.isLogsOpen ? "Hide logs" : "Show logs"}
        </button>
      </div>

      {item.isLogsOpen && (
        <div className="mt-4 whitespace-pre-wrap rounded-[1.2rem] border border-zinc-800/80 bg-zinc-950/70 p-4 font-mono text-[11px] leading-relaxed text-zinc-400">
          {item.logs?.length ? item.logs.join("\n") : "No logs yet."}
        </div>
      )}
    </div>
  );
}

function ScheduledDownloadCard({
  item,
  onCancel,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-800/40 bg-zinc-900/20 p-4">
      <div className="border-l-2 border-sky-500/50 pl-3">
        <h4 className="max-w-[340px] truncate text-sm font-medium text-zinc-300">
          {item.title}
        </h4>
        <div className="mt-1 flex gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span>Dispatch: {formatScheduledForLabel(item.scheduledFor)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCancel(item.id)}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-red-400/10 hover:text-red-400"
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
}: {
  item: DownloadItem;
  isLast: boolean;
  onToggleLogs: (id: string, isOpen?: boolean) => void;
  onOpenFolder: (path: string) => void;
  onRemove: (id: string) => void;
}) {
  const isSuccess = item.status === "completed";
  const isError = item.status === "error";
  const accentClass = isSuccess
    ? "bg-emerald-500"
    : isError
      ? "bg-red-500"
      : "bg-amber-500";

  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        !isLast && "border-b border-zinc-800/50",
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
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-zinc-800/30"
      >
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-zinc-300">
            {item.title}
          </h4>
          <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
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
          {isSuccess && item.downloadPath && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenFolder(item.downloadPath!);
              }}
              className="rounded-xl border border-zinc-700/50 bg-zinc-800 p-2 text-zinc-400 opacity-0 transition-all hover:bg-zinc-700 hover:text-zinc-200 group-hover:opacity-100"
              title="Open destination"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.id);
            }}
            className="rounded-xl border border-zinc-700/50 bg-zinc-800 p-2 text-zinc-400 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
            title="Remove from history"
          >
            <X className="h-4 w-4" />
          </button>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-zinc-600 transition-transform",
              item.isLogsOpen && "rotate-180",
            )}
          />
        </div>
      </button>

      {item.isLogsOpen && (
        <div className="border-t border-zinc-800/50 bg-zinc-950/50 px-6 py-4 font-mono text-xs leading-relaxed text-zinc-500">
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
      )}
    </div>
  );
}
