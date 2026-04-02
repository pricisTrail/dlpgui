import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  HardDrive,
  Link as LinkIcon,
  List,
  Loader2,
  Play,
  X,
} from "lucide-react";

import {
  BATCH_QUALITY_OPTIONS,
  formatQualityLabel,
  type PlaylistInfo,
  PLAYLIST_QUALITY_PRESETS,
  QUALITY_PRESETS,
  QUALITY_PRESETS_NO_AUDIO,
} from "../lib/types";
import { cn } from "../lib/utils";

interface ComposerSectionProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  url: string;
  lastFetchedUrl: string;
  selectedFormat: string;
  withSubtitles: boolean;
  formatsError: string;
  isFetchingFormats: boolean;
  isFetchingPlaylist: boolean;
  isPlaylist: boolean;
  playlistInfo: PlaylistInfo | null;
  isBatchMode: boolean;
  batchUrls: string[];
  batchQualityId: string;
  batchWithSubtitles: boolean;
  isBatchAudioOnly: boolean;
  isProcessing: boolean;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (value: string) => void;
  onOpenSchedule: () => void;
  onSubmit: () => void;
  onExitBatchMode: () => void;
  onBatchQualityChange: (qualityId: string) => void;
  onBatchSubtitlesChange: (withSubtitles: boolean) => void;
  onStartBatchDownload: () => void;
  onSelectFormat: (format: string, withSubtitles: boolean) => void;
}

function QualityPresetGrid({
  presets,
  selectedFormat,
  currentWithSubtitles,
  withSubtitles,
  selectedTone,
  idleTone,
  subtitleLabel,
  onSelect,
}: {
  presets: typeof QUALITY_PRESETS;
  selectedFormat: string;
  currentWithSubtitles: boolean;
  withSubtitles: boolean;
  selectedTone: string;
  idleTone: string;
  subtitleLabel?: string;
  onSelect: (format: string, withSubtitles: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {presets.map((option) => (
        <button
          key={`${option.quality}-${subtitleLabel || "plain"}`}
          onClick={() => onSelect(option.format, withSubtitles)}
          className={cn(
            "rounded-lg border p-3 text-center transition-all duration-200",
            selectedFormat === option.format && currentWithSubtitles === withSubtitles
              ? selectedTone
              : idleTone,
          )}
        >
          <div className="text-sm font-semibold">{option.quality}</div>
          {subtitleLabel ? (
            <div className="text-[10px] text-violet-400">{subtitleLabel}</div>
          ) : (
            option.label && <div className="text-[10px] opacity-75">{option.label}</div>
          )}
        </button>
      ))}
    </div>
  );
}

export function ComposerSection({
  fileInputRef,
  url,
  lastFetchedUrl,
  selectedFormat,
  withSubtitles,
  formatsError,
  isFetchingFormats,
  isFetchingPlaylist,
  isPlaylist,
  playlistInfo,
  isBatchMode,
  batchUrls,
  batchQualityId,
  batchWithSubtitles,
  isBatchAudioOnly,
  isProcessing,
  onFileImport,
  onUrlChange,
  onOpenSchedule,
  onSubmit,
  onExitBatchMode,
  onBatchQualityChange,
  onBatchSubtitlesChange,
  onStartBatchDownload,
  onSelectFormat,
}: ComposerSectionProps) {
  const handleEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && selectedFormat) {
      onSubmit();
    }
  };

  return (
    <section className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        accept=".txt"
        onChange={onFileImport}
        className="hidden"
      />

      {!isBatchMode ? (
        <div className="group relative">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <LinkIcon className="h-5 w-5 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
          </div>
          <input
            type="text"
            placeholder="Paste video or playlist URL here..."
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={handleEnter}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 py-4 pl-12 pr-[340px] text-lg transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <div className="absolute bottom-2 right-2 top-2 flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 font-medium text-white transition-colors hover:bg-slate-600"
              title="Import URLs from TXT file"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={onOpenSchedule}
              disabled={!url || !selectedFormat}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              title="Schedule download"
            >
              <Calendar className="h-4 w-4" />
            </button>
            <button
              onClick={onSubmit}
              disabled={!url || !selectedFormat || isProcessing}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              title={!selectedFormat ? "Select a format first" : "Download"}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <List className="h-5 w-5 text-indigo-400" />
              <span className="font-medium">Batch Download Mode</span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-400">
                {batchUrls.length} URLs
              </span>
            </div>
            <button onClick={onExitBatchMode} className="p-1 text-slate-400 hover:text-slate-300">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-800/50 p-3">
            {batchUrls.slice(0, 5).map((batchUrl, index) => (
              <div key={`${batchUrl}-${index}`} className="truncate py-0.5 text-xs text-slate-400">
                {index + 1}. {batchUrl}
              </div>
            ))}
            {batchUrls.length > 5 && (
              <div className="mt-1 text-xs text-slate-500">... and {batchUrls.length - 5} more</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Default Quality:</span>
              <select
                value={batchQualityId}
                onChange={(event) => onBatchQualityChange(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {BATCH_QUALITY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Subtitles:</span>
              <select
                value={batchWithSubtitles ? "with" : "without"}
                onChange={(event) => onBatchSubtitlesChange(event.target.value === "with")}
                disabled={isBatchAudioOnly}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
              >
                <option value="without">No subtitles</option>
                <option value="with">With subtitles</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onOpenSchedule}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 py-2 font-medium text-white transition-colors hover:bg-amber-500"
            >
              <Calendar className="h-4 w-4" />
              Schedule All
            </button>
            <button
              onClick={onStartBatchDownload}
              disabled={isProcessing}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start All ({batchUrls.length})
            </button>
          </div>
        </div>
      )}

      {isFetchingPlaylist && (
        <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching playlist info...
        </div>
      )}

      {isPlaylist && playlistInfo && !isFetchingPlaylist && (
        <div className="animate-in space-y-4 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 p-4 fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-violet-500/20 p-3">
              <List className="h-6 w-6 text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-slate-200">{playlistInfo.title}</h3>
              <p className="text-sm text-slate-400">{playlistInfo.channel}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-violet-500/20 px-3 py-1 text-sm font-medium text-violet-400">
                  {playlistInfo.video_count} videos
                </span>
                <span className="text-sm text-slate-500">Playlist detected</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-700/50 pt-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <HardDrive className="h-4 w-4" />
              <span>Select quality for all videos:</span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {PLAYLIST_QUALITY_PRESETS.map((option) => (
                <button
                  key={option.quality}
                  onClick={() => onSelectFormat(option.format, false)}
                  className={cn(
                    "rounded-lg border p-3 text-center transition-all duration-200",
                    selectedFormat === option.format
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600",
                  )}
                >
                  <div className="text-sm font-semibold">{option.quality}</div>
                  {option.label && <div className="text-[10px] opacity-75">{option.label}</div>}
                </button>
              ))}
            </div>

            {selectedFormat && selectedFormat !== "ba/b" && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => onSelectFormat(selectedFormat, !withSubtitles)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200",
                    withSubtitles
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                      withSubtitles ? "border-violet-500 bg-violet-500" : "border-slate-600",
                    )}
                  >
                    {withSubtitles && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </div>
                  Include Subtitles
                </button>
                <span className="text-xs text-slate-500">Embed subtitles in all videos</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isFetchingFormats && (
        <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching available formats...
        </div>
      )}

      {formatsError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {formatsError}
        </div>
      )}

      {!isPlaylist && !isBatchMode && url && lastFetchedUrl && (
        <div className="animate-in space-y-4 fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <HardDrive className="h-4 w-4" />
            <span>Select quality:</span>
          </div>

          <QualityPresetGrid
            presets={QUALITY_PRESETS}
            selectedFormat={selectedFormat}
            currentWithSubtitles={withSubtitles}
            withSubtitles={false}
            selectedTone="border-indigo-500 bg-indigo-500/20 text-indigo-300"
            idleTone="border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
            onSelect={onSelectFormat}
          />

          {selectedFormat && selectedFormat !== "ba/b" && (
            <>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Or with subtitles:</span>
              </div>

              <QualityPresetGrid
                presets={QUALITY_PRESETS_NO_AUDIO}
                selectedFormat={selectedFormat}
                currentWithSubtitles={withSubtitles}
                withSubtitles
                selectedTone="border-violet-500 bg-violet-500/20 text-violet-300"
                idleTone="border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                subtitleLabel="+ subs"
                onSelect={onSelectFormat}
              />
            </>
          )}
        </div>
      )}

      {!url && !isBatchMode && (
        <div className="py-2 text-center text-sm text-slate-500">
          Paste a video or playlist URL above to get started
        </div>
      )}

      {selectedFormat && url && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Selected:</span>
          <code className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">
            {formatQualityLabel(selectedFormat, withSubtitles)}
          </code>
        </div>
      )}
    </section>
  );
}
