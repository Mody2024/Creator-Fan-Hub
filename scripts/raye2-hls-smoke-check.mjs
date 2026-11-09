import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk.slice(0, 12000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

const work = await mkdtemp(join(tmpdir(), "raye2-hls-smoke-"));
try {
  const source = join(work, "source.mp4");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", "testsrc2=size=1280x720:rate=24:duration=12",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=12",
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-y", source,
  ]);

  for (const variant of [
    { name: "360p", maxWidth: 640, maxHeight: 360, crf: 27, audioRate: "96k", maxWidthExpected: 640, maxHeightExpected: 360 },
    { name: "720p", maxWidth: 1280, maxHeight: 720, crf: 24, audioRate: "128k", maxWidthExpected: 1280, maxHeightExpected: 720 },
  ]) {
    const dir = join(work, variant.name);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const filter = `scale=w='min(${variant.maxWidth},iw)':h='min(${variant.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", source,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", String(variant.crf),
      "-maxrate", variant.name === "720p" ? "2200k" : "850k",
      "-bufsize", variant.name === "720p" ? "4400k" : "1700k",
      "-threads", "2", "-force_key_frames", "expr:gte(t,n_forced*6)", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", variant.audioRate, "-ac", "2",
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
      "-hls_flags", "independent_segments",
      "-hls_segment_filename", join(dir, "segment_%05d.ts"),
      "-y", join(dir, "index.m3u8"),
    ]);
    const playlist = await readFile(join(dir, "index.m3u8"), "utf8");
    assert.match(playlist, /#EXT-X-ENDLIST/);
    const segmentNames = playlist.split("\n").filter(line => line.endsWith(".ts"));
    assert.equal(segmentNames.length, 2, `${variant.name} should contain two six-second segments`);
    for (const segment of segmentNames) {
      const segmentPath = join(dir, segment);
      assert.ok((await stat(segmentPath)).size > 0, `${variant.name} segment should not be empty`);
      const probe = await new Promise((resolve, reject) => {
        const child = spawn("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", segmentPath], { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        let errors = "";
        child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
        child.stderr.setEncoding("utf8").on("data", chunk => { errors += chunk; });
        child.on("error", reject);
        child.on("close", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(errors)));
      });
      const streams = probe.streams ?? [];
      const video = streams.find(stream => stream.codec_type === "video");
      assert.ok(video, "HLS segment must contain video");
      assert.ok(video.width <= variant.maxWidthExpected && video.height <= variant.maxHeightExpected, "rendition must respect its maximum dimensions");
      assert.ok(streams.some(stream => stream.codec_type === "audio"), "audio must be preserved in HLS segments");
    }
  }
  console.log("Raye2 HLS smoke test passed: 360p and 720p playlists, two segments each, bounded dimensions and AAC audio.");
} finally {
  await rm(work, { recursive: true, force: true });
}
