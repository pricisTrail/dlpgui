import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FileVideo,
  FolderOpen,
  History,
  Loader2,
  Music,
  Trash2,
  X,
} from "lucide-react";

import { Pagination } from "./Pagination";
import { ITEMS_PER_PAGE, type DownloadItem } from "../lib/types";
import { cn } from "../lib/utils";

interface DownloadsSectionProps {
  downloads: DownloadItem[];
  history: DownloadItem[];
  showHistory: boolean;
  downloadsPage: number;
  historyPage: number;
  onShowActive: () => void;
  onShowHistory: () => void;
  onChangeDownloadsPage: (page: number) => void;
  onChangeHistoryPage: (page: number) => void;
  onClearHistory: () => void;
  onCancelScheduledDownload: (id: string) => void;
  onCancelDownload: (id: string) => void;
  onToggleDownloadLogs: (id: string) => void;
  onToggleHistoryLogs: (id: string, isOpen?: boolean) => void;
  onRemoveFromHistory: (id: string) => void;
  onOpenFolder: (path: string) => void;
}

function EmptyState({ icon: Icon, label }: { icon: typeof FileVideo; label: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-800 py-20 text-center">
      <Icon className="mx-auto mb-4 h-12 w-12 text-slate-700" />
      <p className="text-slate-500">{label}</p>
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
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 transition-colors hover:border-amber-500/30">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-500/10 p-2">
          <Calendar className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{item.title}</h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            <span>{item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : "Unknown"}</span>
          </div>
        </div>
        <button
          onClick={() => onCancel(item.id)}
          className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
          title="Cancel scheduled download"
        >
          <X className="h-4 w-4 text-slate-400 hover:text-rose-400" />
        </button>
      </div>
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
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-slate-800 p-3">
          {item.phase === "audio" ? (
            <Music className="h-6 w-6 text-emerald-400" />
          ) : item.phase === "merging" || item.phase === "processing" ? (
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          ) : (
            <FileVideo className="h-6 w-6 text-indigo-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between">
            <h3 className="truncate pr-4 font-medium">{item.title}</h3>
            <div className="flex items-center gap-2">
              {item.phase && item.status === "downloading" && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                    item.phase === "video" && "bg-indigo-500/20 text-indigo-400",
                    item.phase === "audio" && "bg-emerald-500/20 text-emerald-400",
                    item.phase === "merging" && "bg-amber-500/20 text-amber-400",
                    item.phase === "processing" && "bg-purple-500/20 text-purple-400",
                  )}
                >
                  {item.phase}
                </span>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  item.status === "downloading" && "bg-indigo-500/10 text-indigo-400",
                  item.status === "pending" && "bg-slate-800 text-slate-400",
                )}
              >
                {item.status.toUpperCase()}
              </span>
              <button
                onClick={() => onCancel(item.id)}
                className="group rounded p-1 transition-colors hover:bg-rose-500/20"
                title="Cancel download"
              >
                <X className="h-4 w-4 text-slate-500 group-hover:text-rose-400" />
              </button>
            </div>
          </div>

          <div className="relative mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                "absolute h-full transition-all duration-300",
                item.phase === "video" ? "bg-indigo-500" : "bg-indigo-600",
              )}
              style={{ width: `${Math.min(item.progress, 50)}%` }}
            />
            {item.progress > 50 && (
              <div
                className="absolute h-full bg-emerald-500 transition-all duration-300"
                style={{ left: "50%", width: `${Math.min(item.progress - 50, 45)}%` }}
              />
            )}
            {item.progress > 95 && (
              <div
                className="absolute h-full bg-amber-500 transition-all duration-300"
                style={{ left: "95%", width: `${Math.min(item.progress - 95, 5)}%` }}
              />
            )}
            <div className="absolute h-full w-px bg-slate-700" style={{ left: "50%" }} />
            <div className="absolute h-full w-px bg-slate-700" style={{ left: "95%" }} />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="font-mono">{Math.round(item.progress)}%</span>
              {item.speed && item.speed !== "..." && <span>{item.speed}</span>}
              {item.size && <span>{item.size}</span>}
            </div>
            <div className="flex items-center gap-3">
              {item.eta && item.eta !== "..." && <span>ETA: {item.eta}</span>}
              <button onClick={() => onToggleLogs(item.id)} className="text-indigo-400 underline hover:text-indigo-300">
                {item.isLogsOpen ? "Hide Logs" : "Show Logs"}
              </button>
            </div>
          </div>

          {item.isLogsOpen && (
            <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/50 p-3 font-mono text-[10px] text-slate-400">
              {item.logs?.join("\n") || "No logs yet..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryItemCard({
  item,
  onToggleLogs,
  onOpenFolder,
  onRemove,
}: {
  item: DownloadItem;
  onToggleLogs: (id: string, isOpen?: boolean) => void;
  onOpenFolder: (path: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg border bg-slate-900 p-3 transition-colors hover:border-slate-600",
        item.status === "completed"
          ? "border-slate-800"
          : item.status === "cancelled"
            ? "border-amber-500/30"
            : "border-rose-500/30",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "rounded-lg p-2",
            item.status === "completed"
              ? "bg-emerald-500/10"
              : item.status === "cancelled"
                ? "bg-amber-500/10"
                : "bg-rose-500/10",
          )}
        >
          {item.status === "completed" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : item.status === "cancelled" ? (
            <X className="h-5 w-5 text-amber-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{item.title}</h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            <span>{item.completedAt ? new Date(item.completedAt).toLocaleString() : "Unknown"}</span>
            {item.status === "cancelled" && (
              <>
                <span>•</span>
                <span className="text-amber-500">Cancelled</span>
              </>
            )}
            {item.size && item.size !== "Unknown" && (
              <>
                <span>•</span>
                <span>{item.size}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {item.logs && item.logs.length > 0 && (
            <button
              onClick={() => onToggleLogs(item.id)}
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
              title="View logs"
            >
              <FileText className="h-4 w-4 text-slate-400 hover:text-indigo-400" />
            </button>
          )}
          {item.status === "completed" && item.downloadPath && (
            <button
              onClick={() => onOpenFolder(item.downloadPath!)}
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
              title="Open folder"
            >
              <FolderOpen className="h-4 w-4 text-slate-400 hover:text-indigo-400" />
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="rounded-lg p-1.5 transition-colors hover:bg-slate-800"
            title="Remove from history"
          >
            <X className="h-4 w-4 text-slate-400 hover:text-rose-400" />
          </button>
        </div>
      </div>

      {item.isLogsOpen && item.logs && item.logs.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-black/50 p-3 font-mono text-[10px] text-slate-400">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>{item.logs.length} log entries</span>
            <button onClick={() => onToggleLogs(item.id, false)} className="hover:text-slate-400">
              Close
            </button>
          </div>
          {item.logs.map((log, index) => (
            <div
              key={`${item.id}-log-${index}`}
              className={cn(
                "py-0.5",
                log.toLowerCase().includes("error") || log.toLowerCase().includes("warning")
                  ? "text-amber-400"
                  : "text-slate-400",
              )}
            >
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DownloadsSection({
  downloads,
  history,
  showHistory,
  downloadsPage,
  historyPage,
  onShowActive,
  onShowHistory,
  onChangeDownloadsPage,
  onChangeHistoryPage,
  onClearHistory,
  onCancelScheduledDownload,
  onCancelDownload,
  onToggleDownloadLogs,
  onToggleHistoryLogs,
  onRemoveFromHistory,
  onOpenFolder,
}: DownloadsSectionProps) {
  const scheduledDownloads = downloads.filter((download) => download.status === "scheduled");
  const activeDownloads = downloads.filter(
    (download) => download.status === "pending" || download.status === "downloading",
  );
  const activeCount = activeDownloads.length + scheduledDownloads.length;
  const totalActivePages = Math.ceil(activeDownloads.length / ITEMS_PER_PAGE);
  const paginatedDownloads = activeDownloads.slice(
    (downloadsPage - 1) * ITEMS_PER_PAGE,
    downloadsPage * ITEMS_PER_PAGE,
  );
  const totalHistoryPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const paginatedHistory = history.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE,
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onShowActive}
            className={cn(
              "text-sm font-semibold uppercase tracking-wider transition-colors",
              !showHistory ? "text-indigo-400" : "text-slate-500 hover:text-slate-400",
            )}
          >
            Active Downloads
          </button>
          <button
            onClick={onShowHistory}
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider transition-colors",
              showHistory ? "text-indigo-400" : "text-slate-500 hover:text-slate-400",
            )}
          >
            <History className="h-4 w-4" />
            History
          </button>
        </div>

        <div className="flex items-center gap-2">
          {showHistory && history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-400 transition-colors hover:bg-rose-500/20"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </button>
          )}
          <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">
            {showHistory ? history.length : activeCount} items
          </span>
        </div>
      </div>

      {!showHistory ? (
        <div className="space-y-3">
          {scheduledDownloads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Calendar className="h-3 w-3" />
                <span className="font-medium uppercase tracking-wider">
                  Scheduled ({scheduledDownloads.length})
                </span>
              </div>
              {scheduledDownloads.map((item) => (
                <ScheduledDownloadCard key={item.id} item={item} onCancel={onCancelScheduledDownload} />
              ))}
            </div>
          )}

          {activeDownloads.length === 0 && scheduledDownloads.length === 0 ? (
            <EmptyState icon={FileVideo} label="No active downloads. Paste a URL to start." />
          ) : (
            activeDownloads.length > 0 && (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs text-indigo-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-medium uppercase tracking-wider">Active ({activeDownloads.length})</span>
                </div>
                {paginatedDownloads.map((item) => (
                  <ActiveDownloadCard
                    key={item.id}
                    item={item}
                    onCancel={onCancelDownload}
                    onToggleLogs={onToggleDownloadLogs}
                  />
                ))}
                <Pagination
                  currentPage={downloadsPage}
                  totalPages={totalActivePages}
                  onPageChange={onChangeDownloadsPage}
                  totalItems={activeDownloads.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                />
              </>
            )
          )}
        </div>
      ) : history.length === 0 ? (
        <EmptyState icon={History} label="No download history yet." />
      ) : (
        <div className="space-y-2">
          {paginatedHistory.map((item) => (
            <HistoryItemCard
              key={item.id}
              item={item}
              onToggleLogs={onToggleHistoryLogs}
              onOpenFolder={onOpenFolder}
              onRemove={onRemoveFromHistory}
            />
          ))}
          <Pagination
            currentPage={historyPage}
            totalPages={totalHistoryPages}
            onPageChange={onChangeHistoryPage}
            totalItems={history.length}
            itemsPerPage={ITEMS_PER_PAGE}
          />
        </div>
      )}
    </section>
  );
}
