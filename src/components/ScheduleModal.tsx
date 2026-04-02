import { Calendar, X } from "lucide-react";

import { BATCH_QUALITY_OPTIONS } from "../lib/types";

interface ScheduleModalProps {
  isOpen: boolean;
  isBatchMode: boolean;
  batchUrls: string[];
  url: string;
  batchQualityId: string;
  batchWithSubtitles: boolean;
  isBatchAudioOnly: boolean;
  selectedFormat: string;
  defaultFormat: string;
  scheduledTime: string;
  onClose: () => void;
  onSchedule: () => void;
  onBatchQualityChange: (qualityId: string) => void;
  onBatchSubtitlesChange: (withSubtitles: boolean) => void;
  onSingleFormatChange: (format: string) => void;
  onScheduledTimeChange: (value: string) => void;
  onApplyQuickTime: (hours: number) => void;
}

export function ScheduleModal({
  isOpen,
  isBatchMode,
  batchUrls,
  url,
  batchQualityId,
  batchWithSubtitles,
  isBatchAudioOnly,
  selectedFormat,
  defaultFormat,
  scheduledTime,
  onClose,
  onSchedule,
  onBatchQualityChange,
  onBatchSubtitlesChange,
  onSingleFormatChange,
  onScheduledTimeChange,
  onApplyQuickTime,
}: ScheduleModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="h-5 w-5 text-amber-400" />
            Schedule Download
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-slate-800">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="mb-1 text-xs text-slate-500">
              {isBatchMode ? `Scheduling ${batchUrls.length} URLs` : "Scheduling URL"}
            </div>
            <div className="truncate text-sm text-slate-300">
              {isBatchMode
                ? `${batchUrls[0]} ${batchUrls.length > 1 ? `(+${batchUrls.length - 1} more)` : ""}`
                : url}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-400">Quality</label>
            <select
              value={isBatchMode ? batchQualityId : selectedFormat || defaultFormat}
              onChange={(event) =>
                isBatchMode
                  ? onBatchQualityChange(event.target.value)
                  : onSingleFormatChange(event.target.value)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {isBatchMode ? (
                BATCH_QUALITY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
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
                onChange={(event) => onBatchSubtitlesChange(event.target.value === "with")}
                disabled={isBatchAudioOnly}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
              >
                <option value="without">No subtitles</option>
                <option value="with">With subtitles</option>
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-slate-400">Schedule For</label>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(event) => onScheduledTimeChange(event.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: "In 1 hour", hours: 1 },
              { label: "In 3 hours", hours: 3 },
              { label: "Tonight (10 PM)", hours: -1 },
              { label: "Tomorrow", hours: 24 },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => onApplyQuickTime(option.hours)}
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-700"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-800 p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-700 py-2 font-medium text-white transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={onSchedule}
            disabled={!scheduledTime}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 py-2 font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Calendar className="h-4 w-4" />
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
