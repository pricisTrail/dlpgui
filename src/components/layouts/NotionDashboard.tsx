import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Folder,
  ListPlus,
  Loader2,
  Minus,
  Monitor,
  Moon,
  Settings,
  Square,
  StopCircle,
  Sun,
  TerminalSquare,
  X,
} from "lucide-react";

import {
  formatScheduledForLabel,
  getPhaseLabel,
  getHistoryErrorMessage,
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

interface PaginationState {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageItemsCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

interface NotionDashboardProps {
  isDarkMode: boolean;
  versionLabel: string;
  savePath: string;
  extensionStatusLabel: string;
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
  currentView: "active" | "history";
  activeCount: number;
  activeItems: DownloadItem[];
  historyItems: DownloadItem[];
  activePagination: PaginationState;
  historyPagination: PaginationState;
  playlistInfo: PlaylistInfo | null;
  isFetchingPlaylist: boolean;
  formatsError: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (value: string) => void;
  onSelectQualityId: (qualityId: string) => void;
  onToggleSubtitles: () => void;
  onToggleScheduling: () => void;
  onScheduledTimeChange: (value: string) => void;
  onSetPresetDate: (preset: SchedulePreset) => void;
  onPrimaryAction: () => void;
  onChangeView: (view: "active" | "history") => void;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenFolder: (path: string) => void;
  onCancelDownload: (id: string) => void;
  onToggleHistoryLogs: (id: string, isOpen?: boolean) => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
  onStartDrag: MouseEventHandler<HTMLDivElement>;
}

export function NotionDashboard({
  isDarkMode,
  versionLabel,
  savePath,
  extensionStatusLabel,
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
  currentView,
  activeCount,
  activeItems,
  historyItems,
  activePagination,
  historyPagination,
  playlistInfo,
  isFetchingPlaylist,
  formatsError,
  fileInputRef,
  onFileImport,
  onUrlChange,
  onSelectQualityId,
  onToggleSubtitles,
  onToggleScheduling,
  onScheduledTimeChange,
  onSetPresetDate,
  onPrimaryAction,
  onChangeView,
  onToggleDarkMode,
  onOpenSettings,
  onOpenFolder,
  onCancelDownload,
  onToggleHistoryLogs,
  onMinimize,
  onToggleMaximize,
  onCloseWindow,
  onStartDrag,
}: NotionDashboardProps) {
  const pagination =
    currentView === "active" ? activePagination : historyPagination;
  const items = currentView === "active" ? activeItems : historyItems;
  const showingStart =
    pagination.totalItems === 0
      ? 0
      : (pagination.currentPage - 1) * pagination.itemsPerPage + 1;
  const showingEnd =
    pagination.totalItems === 0
      ? 0
      : showingStart + pagination.pageItemsCount - 1;

  return (
    <div className="min-h-[100dvh] bg-[#FBFBFA] text-[#111111] transition-colors duration-200 dark:bg-[#0F0F0F] dark:text-[#EDEDED]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        onChange={onFileImport}
        className="hidden"
      />

      <div
        className="flex h-10 items-center justify-between border-b border-[#EAEAEA] bg-white px-4 text-xs transition-colors dark:border-[#2A2A2A] dark:bg-[#141414]"
        data-tauri-drag-region
        onMouseDown={onStartDrag}
        onDoubleClick={onToggleMaximize}
      >
        <div className="flex items-center gap-4 font-mono text-[#787774] transition-colors dark:text-[#888888]">
          <span className="font-semibold text-[#111111] dark:text-[#EDEDED]">
            yt-dlp
          </span>
          <span>{versionLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-[#787774] transition-colors dark:text-[#888888]">
          <button
            type="button"
            onClick={onMinimize}
            className="transition-colors hover:text-[#111111] dark:hover:text-[#EDEDED]"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={onToggleMaximize}
            className="transition-colors hover:text-[#111111] dark:hover:text-[#EDEDED]"
          >
            <Square size={12} />
          </button>
          <button
            type="button"
            onClick={onCloseWindow}
            className="transition-colors hover:text-[#9F2F2D] dark:hover:text-[#E86B69]"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <header className="flex items-center justify-between border-b border-[#EAEAEA] bg-white px-6 pb-2 pt-2.5 text-sm transition-colors dark:border-[#2A2A2A] dark:bg-[#141414]">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onOpenFolder(savePath)}
            className="flex items-center gap-2 text-[#787774] transition-colors hover:text-[#111111] dark:text-[#888888] dark:hover:text-[#EDEDED]"
          >
            <Folder size={16} />
            <span className="max-w-[220px] truncate font-mono" title={savePath}>
              {savePath}
            </span>
          </button>
          <div className="h-4 w-px bg-[#EAEAEA] transition-colors dark:bg-[#2A2A2A]" />
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-[#346538] dark:text-[#76B87B]" />
            <span className="text-xs text-[#787774] dark:text-[#888888]">
              Ext: {extensionStatusLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="px-2 py-1"
            onClick={onToggleDarkMode}
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button
            variant="ghost"
            className="px-2 py-1"
            onClick={onOpenSettings}
          >
            <Settings size={18} />
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <section className="rounded-xl border border-[#EAEAEA] bg-white px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-colors dark:border-[#2A2A2A] dark:bg-[#141414] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h1 className="relative -top-0.5 font-serif text-2xl tracking-tight text-[#111111] dark:text-[#EDEDED]">
                New Download
              </h1>
              {(playlistInfo || isFetchingPlaylist || formatsError) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {playlistInfo && (
                    <Badge variant="blue">
                      {playlistInfo.video_count} items
                    </Badge>
                  )}
                  {isFetchingPlaylist && (
                    <Badge variant="yellow">Fetching playlist</Badge>
                  )}
                  {formatsError && (
                    <Badge variant="red">Playlist lookup failed</Badge>
                  )}
                </div>
              )}
            </div>

            {urlType === "batch" && (
              <Badge variant="green">{urlLines.length} urls queued</Badge>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onPrimaryAction();
                  }
                }}
                placeholder="Paste video or playlist URL here..."
                className="w-full rounded-lg border border-[#EAEAEA] bg-[#FBFBFA] px-4 py-3 pr-28 font-mono text-sm text-[#111111] outline-none transition-all placeholder:text-[#CCCCCC] focus:border-[#111111] focus:ring-1 focus:ring-[#111111] dark:border-[#2A2A2A] dark:bg-[#0F0F0F] dark:text-[#EDEDED] dark:placeholder:text-[#555555] dark:focus:border-[#EDEDED] dark:focus:ring-[#EDEDED]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Badge variant="default">Auto-detect</Badge>
              </div>
            </div>

            {(playlistInfo || formatsError) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#EAEAEA] bg-[#FBFBFA] px-4 py-3 text-xs transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]">
                {playlistInfo && (
                  <>
                    <Badge variant="blue">Playlist</Badge>
                    <span className="text-[#787774] dark:text-[#888888]">
                      {playlistInfo.title}
                    </span>
                  </>
                )}
                {formatsError && (
                  <span className="text-[#9F2F2D] dark:text-[#E86B69]">
                    {formatsError}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <select
                  value={selectedQualityId}
                  onChange={(event) => onSelectQualityId(event.target.value)}
                  className="rounded-md border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] transition-colors focus:border-[#111111] focus:outline-none dark:border-[#2A2A2A] dark:bg-[#141414] dark:text-[#EDEDED] dark:focus:border-[#EDEDED]"
                >
                  {BATCH_QUALITY_OPTIONS.map((qualityOption) => (
                    <option key={qualityOption.id} value={qualityOption.id}>
                      {qualityOption.id === "audio"
                        ? "Audio Only"
                        : `${qualityOption.id}p`}
                    </option>
                  ))}
                </select>

                <label
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    subtitlesEnabled
                      ? "border-[#EAEAEA] bg-[#F1EFE9] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-[#2A2A2A] dark:bg-[#1A1A1A] dark:text-[#EDEDED] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "border-[#EAEAEA] bg-white hover:bg-[#FBFBFA] dark:border-[#2A2A2A] dark:bg-[#141414] dark:hover:bg-[#0F0F0F]",
                    isAudioOnly && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={subtitlesEnabled}
                    onChange={onToggleSubtitles}
                    disabled={isAudioOnly}
                    className="rounded-sm border-[#EAEAEA] bg-white text-[#111111] focus:ring-[#111111] dark:border-[#2A2A2A] dark:bg-[#0F0F0F] dark:text-[#EDEDED] dark:focus:ring-[#EDEDED]"
                  />
                  <span>Embed Subtitles</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  title="Batch Import TXT"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ListPlus size={16} />
                  <span>Batch</span>
                </Button>
                <Button
                  variant="secondary"
                  title="Schedule Download"
                  className={cn(
                    isScheduling && "border-[#111111] dark:border-[#EDEDED]",
                  )}
                  onClick={onToggleScheduling}
                >
                  <Clock size={16} />
                </Button>
                <Button
                  variant="primary"
                  className="pl-3 pr-5"
                  onClick={onPrimaryAction}
                  disabled={!canSubmit}
                >
                  {isProcessing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>
                    {isScheduling ? "Queue Download" : "Start Download"}
                  </span>
                  <span className="ml-2 border-l border-white/20 pl-2 dark:border-black/20">
                    <Kbd>Enter</Kbd>
                  </span>
                </Button>
              </div>
            </div>

            {isScheduling && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#EAEAEA] bg-[#FBFBFA] px-4 py-3 text-sm transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]">
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(event) =>
                    onScheduledTimeChange(event.target.value)
                  }
                  className="rounded-md border border-[#EAEAEA] bg-white px-3 py-2 text-sm text-[#111111] transition-colors focus:border-[#111111] focus:outline-none dark:border-[#2A2A2A] dark:bg-[#141414] dark:text-[#EDEDED] dark:focus:border-[#EDEDED]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {(["1h", "3h", "Tonight", "Tomorrow"] as const).map(
                    (preset) => (
                      <Button
                        key={preset}
                        variant="ghost"
                        className="px-3 py-1.5"
                        onClick={() => onSetPresetDate(preset)}
                      >
                        {preset}
                      </Button>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-6 border-b border-[#EAEAEA] transition-colors dark:border-[#2A2A2A]">
            <button
              type="button"
              onClick={() => onChangeView("active")}
              className={cn(
                "relative pb-3 text-sm font-medium transition-colors",
                currentView === "active"
                  ? "text-[#111111] dark:text-[#EDEDED]"
                  : "text-[#787774] hover:text-[#111111] dark:text-[#888888] dark:hover:text-[#EDEDED]",
              )}
            >
              Active Downloads
              {currentView === "active" && (
                <div className="absolute bottom-[-1px] left-0 h-px w-full bg-[#111111] dark:bg-[#EDEDED]" />
              )}
              <span className="ml-2 rounded bg-[#F7F6F3] px-1.5 py-0.5 text-xs text-[#787774] transition-colors dark:bg-[#1F1F1F] dark:text-[#888888]">
                {activeCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChangeView("history")}
              className={cn(
                "relative pb-3 text-sm font-medium transition-colors",
                currentView === "history"
                  ? "text-[#111111] dark:text-[#EDEDED]"
                  : "text-[#787774] hover:text-[#111111] dark:text-[#888888] dark:hover:text-[#EDEDED]",
              )}
            >
              History
              {currentView === "history" && (
                <div className="absolute bottom-[-1px] left-0 h-px w-full bg-[#111111] dark:bg-[#EDEDED]" />
              )}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className={cn(
              "scrollbar-hidden overflow-y-auto rounded-lg border border-dashed border-[#EAEAEA] bg-white transition-colors dark:border-[#2A2A2A] dark:bg-[#141414]",
              currentView === "active" ? "min-h-[340px]" : "min-h-[340px] max-h-[340px]",
            )}>
              {items.length > 0 ? (
                currentView === "active" ? (
                  <div className="flex flex-col gap-3 p-3">
                    {items.map((item) => (
                      <NotionActiveDownloadCard
                        key={item.id}
                        item={item}
                        onCancel={onCancelDownload}
                      />
                    ))}
                  </div>
                ) : (
                  <div>
                    {items.map((item, index) => (
                      <NotionHistoryCard
                        key={item.id}
                        item={item}
                        isLast={index === items.length - 1}
                        onToggleLogs={onToggleHistoryLogs}
                        onOpenFolder={onOpenFolder}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="flex min-h-[340px] items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
                      {currentView === "active"
                        ? "No queued downloads"
                        : "No history yet"}
                    </p>
                    <p className="mt-1 text-xs text-[#787774] dark:text-[#888888]">
                      {currentView === "active"
                        ? "Paste a URL or import a batch list to begin."
                        : "Completed and failed items will appear here."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs text-[#787774] dark:text-[#888888]">
                  Showing {showingStart}-{showingEnd} of {pagination.totalItems}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="px-2 py-1"
                    onClick={() =>
                      pagination.onPageChange(
                        Math.max(1, pagination.currentPage - 1),
                      )
                    }
                    disabled={pagination.currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <div className="flex gap-1">
                    {getVisiblePages(
                      pagination.currentPage,
                      pagination.totalPages,
                    ).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => pagination.onPageChange(page)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
                          pagination.currentPage === page
                            ? "bg-[#111111] text-white dark:bg-[#EDEDED] dark:text-[#111111]"
                            : "text-[#787774] hover:bg-[#F7F6F3] dark:text-[#888888] dark:hover:bg-[#1F1F1F]",
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    className="px-2 py-1"
                    onClick={() =>
                      pagination.onPageChange(
                        Math.min(
                          pagination.totalPages,
                          pagination.currentPage + 1,
                        ),
                      )
                    }
                    disabled={pagination.currentPage === pagination.totalPages}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "blue" | "green" | "yellow" | "red" | "dark";
}) {
  const variants = {
    default:
      "border-[#EAEAEA] bg-[#F7F6F3] text-[#787774] dark:border-[#2A2A2A] dark:bg-[#1F1F1F] dark:text-[#888888]",
    blue: "border-[#b6e2fd] bg-[#E1F3FE] text-[#1F6C9F] dark:border-[#1E3E59] dark:bg-[#112635] dark:text-[#5CA9DF]",
    green:
      "border-[#d2e6cf] bg-[#EDF3EC] text-[#346538] dark:border-[#224027] dark:bg-[#132617] dark:text-[#76B87B]",
    yellow:
      "border-[#f2e2b3] bg-[#FBF3DB] text-[#956400] dark:border-[#4D3800] dark:bg-[#2B1F00] dark:text-[#E6B300]",
    red: "border-[#f8c9cb] bg-[#FDEBEC] text-[#9F2F2D] dark:border-[#571D1F] dark:bg-[#331112] dark:text-[#E86B69]",
    dark: "border-[#111111] bg-[#111111] text-white dark:border-[#EDEDED] dark:bg-[#EDEDED] dark:text-[#111111]",
  };

  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors",
        variants[variant],
      )}
    >
      {children}
    </span>
  );
}

function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary:
      "bg-[#111111] text-white hover:bg-[#333333] dark:bg-[#EDEDED] dark:text-[#111111] dark:hover:bg-white",
    secondary:
      "border border-[#EAEAEA] bg-white text-[#111111] hover:bg-[#F7F6F3] dark:border-[#2A2A2A] dark:bg-[#141414] dark:text-[#EDEDED] dark:hover:bg-[#1F1F1F]",
    ghost:
      "text-[#787774] hover:bg-[#F7F6F3] hover:text-[#111111] dark:text-[#888888] dark:hover:bg-[#1F1F1F] dark:hover:text-[#EDEDED]",
    danger:
      "border border-[#f8c9cb] bg-white text-[#9F2F2D] hover:bg-[#FDEBEC] dark:border-[#571D1F] dark:bg-[#141414] dark:text-[#E86B69] dark:hover:bg-[#331112]",
  };

  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-[#EAEAEA] bg-[#F7F6F3] px-1.5 py-0.5 font-mono text-[10px] text-[#787774] transition-colors dark:border-[#2A2A2A] dark:bg-[#1F1F1F] dark:text-[#888888]">
      {children}
    </kbd>
  );
}

function getVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 2) return [1, 2, 3];
  if (currentPage >= totalPages - 1)
    return [totalPages - 2, totalPages - 1, totalPages];
  return [currentPage - 1, currentPage, currentPage + 1];
}

function NotionActiveDownloadCard({
  item,
  onCancel,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
}) {
  const phase = item.status === "scheduled" ? "SCHEDULED" : getPhaseLabel(item);
  const config = getPhaseConfig(phase);
  const isScheduled = item.status === "scheduled";

  return (
    <div className="group relative overflow-hidden rounded-lg border border-[#EAEAEA] bg-white p-4 transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-[#2A2A2A] dark:bg-[#141414] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
      {!isScheduled && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 opacity-[0.03] dark:opacity-[0.05]",
            config.fill,
          )}
          style={{ width: `${Math.max(0, Math.min(item.progress, 100))}%` }}
        />
      )}

      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3
              className="truncate text-sm font-medium text-[#111111] dark:text-[#EDEDED]"
              title={item.title}
            >
              {item.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[#787774] dark:text-[#888888]">
              <span className="max-w-[320px] truncate">{item.url}</span>
              <span>•</span>
              <span>
                {item.format
                  ? formatQualityLabel(item.format, Boolean(item.subtitles))
                  : "Queued"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isScheduled ? (
              <Badge variant="default">
                <Clock size={10} className="mr-1 inline" />
                {formatScheduledForLabel(item.scheduledFor)}
              </Badge>
            ) : (
              <Badge variant={config.badge}>{phase}</Badge>
            )}
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              className="p-1 text-[#787774] opacity-0 transition-all hover:text-[#9F2F2D] group-hover:opacity-100 dark:text-[#888888] dark:hover:text-[#E86B69]"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {!isScheduled && (
          <div className="flex items-center gap-4">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#F7F6F3] transition-colors dark:bg-[#1F1F1F]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  config.fill,
                )}
                style={{
                  width: `${Math.max(0, Math.min(item.progress, 100))}%`,
                }}
              />
              <div className="absolute inset-y-0 left-[50%] w-px bg-white/50 dark:bg-black/50" />
              <div className="absolute inset-y-0 left-[95%] w-px bg-white/50 dark:bg-black/50" />
            </div>

            <div className="flex min-w-[200px] shrink-0 items-center justify-end gap-4 font-mono text-xs text-[#787774] dark:text-[#888888]">
              <span className="font-medium text-[#111111] dark:text-[#EDEDED]">
                {item.progress.toFixed(1)}%
              </span>
              <span>{item.speed}</span>
              <span>{item.eta}</span>
              <span>{item.size}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotionHistoryCard({
  item,
  isLast,
  onToggleLogs,
  onOpenFolder,
}: {
  item: DownloadItem;
  isLast: boolean;
  onToggleLogs: (id: string, isOpen?: boolean) => void;
  onOpenFolder: (path: string) => void;
}) {
  const config = getHistoryStatusConfig(item.status);
  const Icon = config.icon;
  const errorMessage =
    item.status === "error" ? getHistoryErrorMessage(item) : "";

  return (
    <div
      className={cn(
        "group px-4 py-4 transition-colors",
        !isLast && "border-b border-[#EAEAEA] dark:border-[#2A2A2A]",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div
            className={cn(
              "rounded-md border border-[#EAEAEA] bg-[#FBFBFA] p-2 transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]",
              config.color,
            )}
          >
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
              {item.title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-[#787774] dark:text-[#888888]">
              <span className="inline-flex items-center rounded-md border border-[#EAEAEA] bg-[#FBFBFA] px-2.5 py-1 transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]">
                <span>
                  {item.completedAt
                    ? new Date(item.completedAt).toLocaleString()
                    : "Unknown"}
                </span>
                <span className="mx-2 opacity-60">&bull;</span>
                <span>
                  {item.format
                    ? formatQualityLabel(item.format, Boolean(item.subtitles))
                    : "Queued"}
                </span>
                {item.size && (
                  <>
                    <span className="mx-2 opacity-60">&bull;</span>
                    <span>{item.size}</span>
                  </>
                )}
              </span>
              {errorMessage && (
                <span className="rounded-md border border-[#f8c9cb] bg-[#FDEBEC] px-2.5 py-1 text-[#9F2F2D] transition-colors dark:border-[#571D1F] dark:bg-[#331112] dark:text-[#E86B69]">
                  {errorMessage}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={config.badge}>{item.status}</Badge>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="h-8 px-2 py-1"
              title="View Logs"
              onClick={() => onToggleLogs(item.id)}
            >
              <TerminalSquare size={14} />
            </Button>
            {item.status === "completed" && item.downloadPath && (
              <Button
                variant="secondary"
                className="h-8 px-2 py-1"
                title="Open Folder"
                onClick={() => onOpenFolder(item.downloadPath!)}
              >
                <Folder size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {item.isLogsOpen && (
        <div className="mt-4 whitespace-pre-wrap rounded-md border border-[#EAEAEA] bg-[#FBFBFA] p-3 font-mono text-xs text-[#787774] transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F] dark:text-[#888888]">
          {item.logs?.length
            ? item.logs.join("\n")
            : "No logs captured for this item."}
        </div>
      )}
    </div>
  );
}

function getPhaseConfig(phase: string) {
  switch (phase) {
    case "VIDEO":
      return {
        fill: "bg-indigo-400 dark:bg-indigo-500",
        badge: "blue" as const,
      };
    case "AUDIO":
      return {
        fill: "bg-emerald-400 dark:bg-emerald-500",
        badge: "green" as const,
      };
    case "MERGING":
    case "PROCESSING":
      return {
        fill: "bg-amber-400 dark:bg-amber-500",
        badge: "yellow" as const,
      };
    case "SCHEDULED":
      return {
        fill: "bg-[#EAEAEA] dark:bg-[#2A2A2A]",
        badge: "default" as const,
      };
    default:
      return {
        fill: "bg-[#111111] dark:bg-[#EDEDED]",
        badge: "default" as const,
      };
  }
}

function getHistoryStatusConfig(status: DownloadItem["status"]) {
  switch (status) {
    case "completed":
      return {
        icon: CheckCircle2,
        color: "text-[#346538] dark:text-[#76B87B]",
        badge: "green" as const,
      };
    case "error":
      return {
        icon: AlertCircle,
        color: "text-[#9F2F2D] dark:text-[#E86B69]",
        badge: "red" as const,
      };
    case "cancelled":
      return {
        icon: StopCircle,
        color: "text-[#956400] dark:text-[#E6B300]",
        badge: "yellow" as const,
      };
    default:
      return {
        icon: FileText,
        color: "text-[#787774] dark:text-[#888888]",
        badge: "default" as const,
      };
  }
}
