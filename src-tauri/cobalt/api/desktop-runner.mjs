// Local Cobalt engine process; the Rust download manager owns and cancels it.
// dlp-gui adapter, 2026-11-16. Upstream engine: api/LICENSE (AGPL-3.0).
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { buildRequest, formatBytes, getFiles, publishFile, saveResponse } from "./desktop-client.mjs";

const log = message => process.stdout.write(`${message}\n`);
// Upstream debug output can include request URLs. Only controlled status lines
// cross into the application's history and failure log.
console.log = console.info = console.warn = console.error = () => {};

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Local Cobalt requires Node.js 22 or newer.");
  }
  let options;
  try { options = JSON.parse(process.env.DLPGUI_COBALT_REQUEST); }
  catch { throw new Error("The local Cobalt download request is invalid."); }
  delete process.env.DLPGUI_COBALT_REQUEST;
  const request = buildRequest(options);
  await access(options.ffmpeg_path).catch(() => {
    throw new Error("Local Cobalt needs the app's FFmpeg binary or FFmpeg on PATH.");
  });
  Object.assign(process.env, {
    API_URL: "http://127.0.0.1:1/", API_PORT: "0", API_LISTEN_ADDRESS: "127.0.0.1",
    API_INSTANCE_COUNT: "1", API_REDIS_URL: "", API_ENV_FILE: "", API_KEY_URL: "",
    API_AUTH_REQUIRED: "0", TURNSTILE_SITEKEY: "", TURNSTILE_SECRET: "", JWT_SECRET: "",
    COOKIE_PATH: "", CORS_WILDCARD: "0", CORS_URL: "http://127.0.0.1",
    FREEBIND_CIDR: "", FORCE_LOCAL_PROCESSING: "never", DISABLED_SERVICES: "",
    DURATION_LIMIT: "86400", RATELIMIT_MAX: "1000", TUNNEL_RATELIMIT_MAX: "1000",
    DLPGUI_FFMPEG_PATH: options.ffmpeg_path,
  });
  let runAPI, env, express;
  try {
    ({ default: express } = await import("express"));
    ({ runAPI } = await import("./src/core/api.js"));
    ({ env } = await import("./src/config.js"));
  } catch {
    throw new Error("Local Cobalt dependencies are missing or incompatible. Run the documented Cobalt preparation step.");
  }
  const token = randomUUID();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) {
      return res.sendStatus(403);
    }
    next();
  });
  const server = await runAPI(express, app, path.resolve(import.meta.dirname), false);
  if (!server.listening) await once(server, "listening");
  const endpoint = `http://127.0.0.1:${server.address().port}/`;
  env.apiURL = endpoint;
  const headers = { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  log("[dlp-gui] Local Cobalt engine started; keeping the selected quality.");

  let response;
  try {
    response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(request), signal: AbortSignal.timeout(60000) });
  } catch {
    throw new Error("Local Cobalt could not resolve the media within 60 seconds.");
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error("Local Cobalt returned an invalid response."); }
  const files = getFiles(result, options.title, request.downloadMode === "audio");
  if (!response.ok) throw new Error("Local Cobalt rejected this download.");
  await mkdir(options.temp_dir, { recursive: true });
  const workDir = await mkdtemp(path.join(options.temp_dir, "cobalt-"));
  try {
    for (const [index, file] of files.entries()) {
      log(`__DLPGUI_TITLE__${file.filename}`);
      log(`[download] Destination: ${file.filename}`);
      log(`[info] Cobalt: Downloading ${request.downloadMode === "audio" ? "audio" : "video"}`);
      let media;
      try {
        const local = new URL(file.url).origin === new URL(endpoint).origin;
        media = await fetch(file.url, { headers: local ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(6 * 60 * 60 * 1000) });
      } catch {
        throw new Error("Cobalt could not connect to the media stream.");
      }
      const temporaryPath = path.join(workDir, `${index}.part`);
      const started = performance.now();
      let lastEmitted = 0;
      await saveResponse(media, temporaryPath, ({ received, total, estimated }) => {
        const now = performance.now();
        if (now - lastEmitted < 150) return;
        lastEmitted = now;
        const rate = received / Math.max((now - started) / 1000, 0.001);
        const percentage = total ? Math.min(99, received / total * 100) : 0;
        const seconds = total ? Math.max(0, Math.ceil((total - received) / rate)) : 0;
        const eta = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
        log(`[download] ${percentage.toFixed(1)}% of ${estimated ? "~" : ""}${formatBytes(total || received)} at ${formatBytes(rate)}/s ETA ${eta}`);
      }).catch(error => {
        if (error.message.startsWith("Cobalt ")) throw error;
        throw new Error("Cobalt media transfer failed before completion.");
      });
      await publishFile(temporaryPath, options.download_dir, file.filename);
      log(`[dlp-gui] Cobalt saved ${file.filename}`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  log("[dlp-gui] Local Cobalt download completed.");
}

main().then(() => process.exit(0), error => {
  // Avoid emitting upstream errors, signed URLs, cookies, or environment data.
  const message = error instanceof Error && /^(Cobalt |Local Cobalt |The local Cobalt |Choose an existing |Too many files)/.test(error.message)
    ? error.message : "Local Cobalt download failed.";
  process.stderr.write(`ERROR: ${message}\n`, () => process.exit(1));
});
