// dlp-gui local Cobalt adapter. No browser cookies or API keys are sent anywhere.
import { constants } from "node:fs";
import { copyFile, link, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

const HEIGHTS = new Set([144, 240, 360, 480, 720, 1080, 1440, 2160, 4320]);

export function buildRequest({ url, format_string, subtitles }) {
  const audioOnly = ["ba/b", "bestaudio/best"].includes(format_string);
  const match = format_string.match(/height\s*(?:<=|=)\s*(\d+)/);
  const height = match ? Number(match[1]) : null;
  if ((height !== null && !HEIGHTS.has(height)) ||
      (!audioOnly && height === null && !["best", "bv+ba/b", "bv*+ba/b"].includes(format_string))) {
    throw new Error("Choose an existing quality preset to use the Cobalt fallback.");
  }
  return {
    url,
    videoQuality: height === null ? "max" : String(height),
    downloadMode: audioOnly ? "audio" : "auto",
    audioFormat: "best",
    audioBitrate: "320",
    youtubeVideoCodec: height !== null && height > 1080 ? "vp9" : "h264",
    youtubeVideoContainer: "mp4",
    filenameStyle: "pretty",
    localProcessing: "disabled",
    alwaysProxy: true,
    ...(subtitles && !audioOnly ? { subtitleLang: "en" } : {}),
  };
}

export function safeFilename(value, fallback = "download.mp4") {
  let name = String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
    .replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  const extension = path.extname(name).slice(0, 12);
  return `${path.basename(name, path.extname(name)).slice(0, 160)}${extension}`;
}

export function getFiles(result, title, audioOnly) {
  if (result.status === "error") {
    const code = result.error?.code;
    const safeCode = typeof code === "string" && /^[\w.-]{1,120}$/.test(code) ? code : "unknown";
    throw new Error(`Cobalt could not resolve this media (${safeCode}).`);
  }
  if (["tunnel", "redirect"].includes(result.status) && typeof result.url === "string") {
    return [{ url: result.url, filename: safeFilename(result.filename, `${title || "download"}.${audioOnly ? "m4a" : "mp4"}`) }];
  }
  if (result.status === "picker") {
    if (audioOnly && result.audio) {
      return [{ url: result.audio, filename: safeFilename(result.audioFilename, `${title || "audio"}.m4a`) }];
    }
    if (audioOnly) throw new Error("Cobalt did not provide an audio-only file for this media.");
    const items = Array.isArray(result.picker) ? result.picker : [];
    if (items.length && items.every(item => typeof item.url === "string")) {
      return items.map((item, index) => ({
        url: item.url,
        filename: safeFilename(`${title || "download"}_${index + 1}.${item.type === "photo" ? "jpg" : item.type === "gif" ? "gif" : "mp4"}`),
      }));
    }
  }
  throw new Error("Cobalt returned an unsupported or empty media response.");
}

export function formatBytes(value) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MiB`;
  return `${(value / 1024).toFixed(2)} KiB`;
}

export async function publishFile(temporaryPath, directory, filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  await mkdir(directory, { recursive: true });
  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const destination = path.join(directory, suffix ? `${stem} (${suffix})${extension}` : filename);
    try {
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if (!["ENOTSUP", "EPERM", "EXDEV", "ENOSYS"].includes(error.code)) throw error;
        try {
          await copyFile(temporaryPath, destination, constants.COPYFILE_EXCL);
        } catch (copyError) {
          if (copyError.code !== "EEXIST") await unlink(destination).catch(() => {});
          throw copyError;
        }
      }
      return destination;
    } catch (error) {
      if (error.code !== "EEXIST") throw new Error("Cobalt could not save the completed file in the download folder.");
    }
  }
  throw new Error("Too many files already have this download name.");
}

export async function saveResponse(response, temporaryPath, onProgress, { idleTimeoutMs = 60000 } = {}) {
  if (!response.ok || !response.body) throw new Error("Cobalt could not retrieve the media stream.");
  if (/^(text\/|application\/(json|xml))/i.test(response.headers.get("content-type") || "")) {
    throw new Error("Cobalt returned a page instead of a media file.");
  }
  const exactLength = Number(response.headers.get("content-length")) || 0;
  const estimate = Math.max(0, Number(response.headers.get("estimated-content-length")) || 0);
  const total = exactLength || estimate;
  const reader = response.body.getReader();
  const file = await open(temporaryPath, "wx");
  let received = 0;
  let timer;
  try {
    while (true) {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Cobalt media transfer timed out.")), idleTimeoutMs);
      });
      let chunk;
      try { chunk = await Promise.race([reader.read(), timeout]); }
      finally { clearTimeout(timer); }
      if (chunk.done) break;
      let written = 0;
      while (written < chunk.value.byteLength) {
        const result = await file.write(chunk.value.subarray(written));
        if (!result.bytesWritten) throw new Error("Cobalt could not write the media file.");
        written += result.bytesWritten;
      }
      received += written;
      onProgress({ received, total, estimated: !exactLength });
    }
    if (!received || (exactLength && received !== exactLength)) {
      throw new Error("Cobalt received an incomplete media file.");
    }
    await file.sync();
    return received;
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    await file.close();
  }
}
