// Backend-only smoke checks; does not build or start the desktop UI.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineApi = fileURLToPath(new URL("../src-tauri/cobalt/api/", import.meta.url));
const require = createRequire(path.join(engineApi, "package.json"));
const ffmpeg = process.env.DLPGUI_TEST_FFMPEG || execFileSync("where.exe", ["ffmpeg"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/)[0];
const output = message => process.stdout.write(`${message}\n`);
console.log = console.info = console.warn = console.error = () => {};
Object.assign(process.env, {
  API_URL: "http://127.0.0.1:1/", API_PORT: "0", API_LISTEN_ADDRESS: "127.0.0.1",
  API_INSTANCE_COUNT: "1", API_REDIS_URL: "", API_ENV_FILE: "", API_KEY_URL: "",
  TURNSTILE_SITEKEY: "", TURNSTILE_SECRET: "", JWT_SECRET: "", COOKIE_PATH: "",
  FREEBIND_CIDR: "", FORCE_LOCAL_PROCESSING: "never", DLPGUI_FFMPEG_PATH: ffmpeg,
});

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dlpgui-cobalt-engine-"));
  let fixture, server;
  try {
    const videoPath = path.join(directory, "video.mp4");
    const audioPath = path.join(directory, "audio.m4a");
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=5:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath], { windowsHide: true });
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1", "-c:a", "aac", audioPath], { windowsHide: true });
    const video = await readFile(videoPath);
    const audio = await readFile(audioPath);
    const broken = Buffer.from("This is not media.");
    let markSlowStarted, markSlowClosed;
    const slowStarted = new Promise(resolve => { markSlowStarted = resolve; });
    const slowClosed = new Promise(resolve => { markSlowClosed = resolve; });
    fixture = createServer((req, res) => {
      if (req.url === "/slow-video") {
        res.writeHead(200, { "Content-Length": video.length, "Content-Type": "video/mp4" });
        if (req.method === "HEAD") return res.end();
        res.on("close", markSlowClosed);
        res.write(video.subarray(0, 100));
        markSlowStarted();
        return;
      }
      const data = req.url === "/video" ? video : req.url === "/audio" ? audio : broken;
      res.writeHead(200, { "Content-Length": data.length, "Content-Type": "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : data);
    }).listen(0, "127.0.0.1");
    await once(fixture, "listening");
    const fixtureURL = `http://127.0.0.1:${fixture.address().port}`;
    const { runAPI } = await import(new URL("../src-tauri/cobalt/api/src/core/api.js", import.meta.url));
    const { env } = await import(new URL("../src-tauri/cobalt/api/src/config.js", import.meta.url));
    const { createStream } = await import(new URL("../src-tauri/cobalt/api/src/stream/manage.js", import.meta.url));
    const { saveResponse } = await import(new URL("../src-tauri/cobalt/api/desktop-client.mjs", import.meta.url));
    const express = require("express");
    server = await runAPI(express, express(), engineApi, false);
    if (!server.listening) await once(server, "listening");
    env.apiURL = `http://127.0.0.1:${server.address().port}/`;

    const info = await (await fetch(env.apiURL)).json();
    assert.equal(info.cobalt.version, "11.7.1");
    output("PASS: vendored Cobalt starts with its native dependency and no Git metadata");
    const rejected = await fetch(env.apiURL, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.invalid/not-a-supported-service" }),
    });
    assert.equal((await rejected.json()).status, "error");
    output("PASS: the real Cobalt request API handles unsupported links");

    const mergeURL = createStream({ type: "merge", url: [`${fixtureURL}/video`, `${fixtureURL}/audio`], service: "fixture", filename: "merged.mp4", headers: {} });
    const mergedPath = path.join(directory, "merged.mp4");
    const media = await fetch(mergeURL, { signal: AbortSignal.timeout(10000) });
    assert.ok(await saveResponse(media, mergedPath, () => {}, { idleTimeoutMs: 5000 }) > 1000);
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", mergedPath, "-f", "null", "-"], { windowsHide: true });
    output("PASS: Cobalt tunnels and merges video plus audio through the installed FFmpeg");

    const brokenURL = createStream({ type: "merge", url: [`${fixtureURL}/broken`, `${fixtureURL}/audio`], service: "fixture", filename: "broken.mp4", headers: {} });
    await assert.rejects(async () => {
      const response = await fetch(brokenURL, { signal: AbortSignal.timeout(10000) });
      await saveResponse(response, path.join(directory, "broken.part"), () => {}, { idleTimeoutMs: 5000 });
    });
    output("PASS: failed FFmpeg processing is rejected instead of saving a truncated success");

    const cancelledURL = createStream({ type: "merge", url: [`${fixtureURL}/slow-video`, `${fixtureURL}/audio`], service: "fixture", filename: "cancelled.mp4", headers: {} });
    const controller = new AbortController();
    const cancelled = fetch(cancelledURL, { signal: controller.signal }).then(() => null, error => error);
    const deadline = (promise, ms) => Promise.race([promise, new Promise((_, reject) => { setTimeout(() => reject(new Error("Cancellation timeout")), ms).unref(); })]);
    await deadline(slowStarted, 5000);
    controller.abort();
    assert.equal((await cancelled).name, "AbortError");
    await deadline(slowClosed, 5000);
    output("PASS: cancelling a Cobalt transfer closes its upstream FFmpeg stream");

    const runner = spawnSync(process.execPath, ["--no-node-snapshot", "desktop-runner.mjs"], {
      cwd: engineApi, encoding: "utf8", windowsHide: true, timeout: 10000,
      env: { ...process.env, DLPGUI_COBALT_REQUEST: JSON.stringify({
        url: "https://example.invalid/private-query?token=synthetic-test-value",
        title: "Smoke check", download_dir: directory, temp_dir: path.join(directory, "temp"),
        format_string: "bv*[height<=720]+ba/b[height<=720]/best", subtitles: false, ffmpeg_path: ffmpeg,
      }) },
    });
    assert.equal(runner.status, 1);
    assert.match(runner.stdout, /Local Cobalt engine started/);
    assert.match(runner.stderr, /Cobalt could not resolve/);
    assert.equal(`${runner.stdout}${runner.stderr}`.includes("synthetic-test-value"), false);
    output("PASS: the actual desktop runner starts and reports safe errors without leaking source URLs");
  } finally {
    server?.closeAllConnections();
    server?.close();
    fixture?.closeAllConnections();
    fixture?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), () => {
  process.stderr.write("FAIL: local Cobalt backend smoke checks\n");
  process.exit(1);
});
