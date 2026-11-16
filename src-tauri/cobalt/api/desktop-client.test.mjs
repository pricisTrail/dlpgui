import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRequest, getFiles, publishFile, safeFilename, saveResponse } from "./desktop-client.mjs";

const request = format_string => buildRequest({ url: "https://example.test/video", format_string, subtitles: true });

test("every existing quality preset keeps its resolution in the fallback", () => {
  for (const height of [2160, 1440, 1080, 720, 480, 360, 240]) {
    const body = request(`bv*[height<=${height}]+ba/b[height<=${height}]/best`);
    assert.equal(body.videoQuality, String(height));
    assert.equal(body.downloadMode, "auto");
    assert.equal(body.subtitleLang, "en");
    assert.equal(body.youtubeVideoContainer, "mp4");
    assert.equal(body.youtubeVideoCodec, height > 1080 ? "vp9" : "h264");
    assert.equal(body.localProcessing, "disabled");
  }
});

test("audio only preserves best audio and omits video subtitles", () => {
  const body = request("ba/b");
  assert.equal(body.downloadMode, "audio");
  assert.equal(body.audioFormat, "best");
  assert.equal(body.subtitleLang, undefined);
});

test("custom format IDs and unsupported heights cannot silently change quality", () => {
  assert.throws(() => request("137+140"), /quality preset/);
  assert.throws(() => request("bv[height<=999]+ba/b"), /quality preset/);
  assert.equal(request("bv+ba/b").videoQuality, "max");
});

test("remote filenames cannot escape the destination or use Windows device names", () => {
  for (const value of ["../../secret.mp4", "C:\\temp\\file.mp4", "CON.mp4", "NUL", "..", "a\u0000b.mp4"]) {
    const name = safeFilename(value);
    assert.equal(path.basename(name), name);
    assert.equal(/[<>:"/\\|?*\u0000-\u001f]/.test(name), false);
    assert.equal(/^(con|nul)(\.|$)/i.test(name), false);
  }
  assert.equal(safeFilename("Lecture 日本語.mp4"), "Lecture 日本語.mp4");
  assert.ok(safeFilename(`${"a".repeat(500)}.mp4`).length <= 172);
});

test("all picker items are retained and malformed replies fail clearly", () => {
  const files = getFiles({ status: "picker", picker: [{ type: "photo", url: "https://example.test/1" }, { type: "video", url: "https://example.test/2" }] }, "Clip", false);
  assert.equal(files.length, 2);
  assert.equal(files[0].filename, "Clip_1.jpg");
  assert.equal(files[1].filename, "Clip_2.mp4");
  assert.throws(() => getFiles({ status: "picker", picker: [{ type: "video", url: "https://example.test/1" }] }, "Clip", true), /audio-only/);
  assert.throws(() => getFiles({ status: "error", error: { code: "error.youtube.login" } }), /error.youtube.login/);
  assert.throws(() => getFiles({ status: "local-processing" }), /unsupported/);
  assert.throws(() => getFiles({ status: "picker", picker: [] }), /empty/);
  assert.throws(() => getFiles({ status: "error", error: { code: "https://private.invalid/signed" } }), /\(unknown\)/);
});

test("completed downloads never overwrite a previously saved file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dlpgui-cobalt-files-"));
  try {
    const source = path.join(directory, "temporary.part");
    await writeFile(source, "new media");
    await writeFile(path.join(directory, "clip.mp4"), "existing media");
    const [first, second] = await Promise.all([
      publishFile(source, directory, "clip.mp4"),
      publishFile(source, directory, "clip.mp4"),
    ]);
    assert.notEqual(first, second);
    assert.equal(await readFile(path.join(directory, "clip.mp4"), "utf8"), "existing media");
    assert.equal(await readFile(first, "utf8"), "new media");
    assert.equal(await readFile(second, "utf8"), "new media");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("streaming validates exact length while accepting approximate Cobalt sizes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dlpgui-cobalt-stream-"));
  try {
    const received = [];
    const exact = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3", "content-type": "video/mp4" } });
    assert.equal(await saveResponse(exact, path.join(directory, "exact.part"), progress => received.push(progress)), 3);
    assert.equal(received.at(-1).received, 3);
    const estimated = new Response(new Uint8Array([4, 5]), { headers: { "estimated-content-length": "20", "content-type": "video/mp4" } });
    assert.equal(await saveResponse(estimated, path.join(directory, "estimated.part"), () => {}), 2);
    const incomplete = new Response(new Uint8Array([1]), { headers: { "content-length": "3" } });
    await assert.rejects(saveResponse(incomplete, path.join(directory, "incomplete.part"), () => {}), /incomplete/);
    await assert.rejects(saveResponse(new Response(new Uint8Array()), path.join(directory, "empty.part"), () => {}), /incomplete/);
    await assert.rejects(saveResponse(new Response("error page", { headers: { "content-type": "text/html" } }), path.join(directory, "page.part"), () => {}), /page instead/);
    assert.equal((await readdir(directory)).includes("page.part"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a stalled transfer times out and cancels its reader", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dlpgui-cobalt-timeout-"));
  let cancelled = false;
  try {
    const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    await assert.rejects(saveResponse(response, path.join(directory, "stalled.part"), () => {}, { idleTimeoutMs: 25 }), /timed out/);
    assert.equal(cancelled, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
