import {
  BATCH_QUALITY_OPTIONS,
  DEFAULT_BATCH_FORMAT_ID,
  type DownloadItem,
} from "./types";

export type UrlType = "single" | "playlist" | "batch" | null;
export type SchedulePreset = "1h" | "3h" | "Tonight" | "Tomorrow";

export function toLocalDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function getUrlLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getLeafPathLabel(path: string) {
  if (!path) return "Downloads";
  const parts = path.split(/[/\\]+/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function getQueuedTitle(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (!lastPart || lastPart === "watch" || lastPart === "playlist") return fallback;
    return decodeURIComponent(lastPart);
  } catch {
    return fallback;
  }
}

export function isPlaylistUrl(urlString: string) {
  try {
    const parsed = new URL(urlString);
    return /(youtube\.com|youtu\.be)$/i.test(parsed.hostname) && parsed.searchParams.has("list");
  } catch {
    return false;
  }
}

export function getPhaseLabel(item: DownloadItem) {
  if (item.status === "scheduled") return "SCHEDULED";
  if (item.status === "pending") return "PENDING";
  if (item.phase === "audio") return "AUDIO";
  if (item.phase === "merging") return "MERGING";
  if (item.phase === "processing") return "PROCESSING";
  if (item.phase === "video") return "VIDEO";
  if (item.status === "completed") return "COMPLETED";
  if (item.status === "error") return "ERROR";
  if (item.status === "cancelled") return "CANCELLED";
  return "PENDING";
}

export function getQualityIdFromFormat(format: string) {
  if (format === "ba/b") return "audio";

  const match = format.match(/height<=(\d+)/);
  return match?.[1] || DEFAULT_BATCH_FORMAT_ID;
}

export function getFormatFromQualityId(qualityId: string) {
  return (
    BATCH_QUALITY_OPTIONS.find((option) => option.id === qualityId)?.format ||
    BATCH_QUALITY_OPTIONS.find((option) => option.id === DEFAULT_BATCH_FORMAT_ID)?.format ||
    BATCH_QUALITY_OPTIONS[0].format
  );
}

export function formatExtensionStatus(ready: boolean | undefined, port: number | undefined) {
  if (!ready || !port) return "Unavailable";
  return `Listening on :${port}`;
}

export function formatScheduledForLabel(value?: string) {
  if (!value) return "Scheduled";

  const scheduledDate = new Date(value);
  if (Number.isNaN(scheduledDate.getTime())) {
    return value;
  }

  const now = new Date();
  const isSameDay =
    scheduledDate.getFullYear() === now.getFullYear() &&
    scheduledDate.getMonth() === now.getMonth() &&
    scheduledDate.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    scheduledDate.getFullYear() === tomorrow.getFullYear() &&
    scheduledDate.getMonth() === tomorrow.getMonth() &&
    scheduledDate.getDate() === tomorrow.getDate();

  const timeLabel = scheduledDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isSameDay) return `Today, ${timeLabel}`;
  if (isTomorrow) return `Tomorrow, ${timeLabel}`;

  return scheduledDate.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getHistoryErrorMessage(item: DownloadItem) {
  const logs = item.logs || [];
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const message = logs[index];
    if (/error|failed|forbidden|unavailable|denied/i.test(message)) {
      return message;
    }
  }
  return "";
}
