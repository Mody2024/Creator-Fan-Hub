import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = Math.max(2000, Number(process.env.RAYE2_WORKER_POLL_MS ?? 10000));
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_HLS_OBJECT_BYTES = 25 * 1024 * 1024;
const MAX_HLS_DURATION_SECONDS = 3600;
const MAX_TRANSCODE_TIMEOUT_MS = 20 * 60 * 1000;
const PRIVATE_BUCKET = "creator-media-private";
const PUBLIC_BUCKET = "creator-media-public";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.");
}
if (SERVICE_ROLE_KEY.startsWith("sb_publishable_") || (!SERVICE_ROLE_KEY.startsWith("eyJ") && !SERVICE_ROLE_KEY.startsWith("sb_secret_"))) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be the server-only service_role secret, never a publishable/anon key.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_JOB_TIMEOUT_MS = 120000;

function run(command, args, timeoutMs = DEFAULT_JOB_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref?.();

    child.stdout.setEncoding("utf8").on("data", chunk => {
      stdoutBytes += Buffer.byteLength(chunk);
      if (stdoutBytes + stderrBytes > MAX_PROCESS_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", chunk => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stdoutBytes + stderrBytes > MAX_PROCESS_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      stderr += chunk;
    });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} exceeded its ${timeoutMs} ms execution limit.`));
      } else if (outputExceeded) {
        reject(new Error(`${command} exceeded the ${MAX_PROCESS_OUTPUT_BYTES}-byte output limit.`));
      } else if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`));
      }
    });
  });
}

async function probeMedia(filePath, expectedType) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,size,format_name:stream=codec_type,codec_name,width,height,channels,sample_rate,duration,disposition=attached_pic",
    "-of", "json", filePath,
  ], 30000);
  const parsed = JSON.parse(stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const expectedStream = streams.find(stream => stream.codec_type === expectedType && (expectedType !== "video" || Number(stream.disposition?.attached_pic ?? 0) !== 1));
  if (!expectedStream) throw new Error(`Uploaded ${expectedType} file contains no ${expectedType} stream.`);
  // Some containers omit a format-level duration while exposing a valid
  // duration on the primary audio/video stream. Prefer the format duration,
  // then fall back to that stream instead of rejecting a playable source.
  const formatDuration = Number(parsed.format?.duration);
  const streamDuration = Number(expectedStream.duration);
  const duration = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : streamDuration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21600) {
    throw new Error("Media duration is missing, invalid, or exceeds the six-hour processing limit.");
  }
  if (expectedType === "video") {
    const width = Number(expectedStream.width);
    const height = Number(expectedStream.height);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 7680 || height > 4320) {
      throw new Error("Video dimensions are invalid or exceed the supported 8K processing ceiling.");
    }
  }
  if (expectedType === "audio") {
    const channels = Number(expectedStream.channels ?? 0);
    if (channels < 1 || channels > 8) throw new Error("Audio channel layout is invalid or exceeds the eight-channel processing ceiling.");
  }
  return {
    container: String(parsed.format?.format_name ?? "").slice(0, 120),
    durationSeconds: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
    streams: streams.slice(0, 12).map(stream => ({
      type: String(stream.codec_type ?? "").slice(0, 20),
      codec: String(stream.codec_name ?? "").slice(0, 40),
      ...(Number.isFinite(Number(stream.width)) ? { width: Number(stream.width) } : {}),
      ...(Number.isFinite(Number(stream.height)) ? { height: Number(stream.height) } : {}),
      ...(Number.isFinite(Number(stream.channels)) ? { channels: Number(stream.channels) } : {}),
      ...(Number.isFinite(Number(stream.duration)) && Number(stream.duration) > 0 ? { durationSeconds: Math.round(Number(stream.duration) * 100) / 100 } : {}),
      ...(stream.sample_rate ? { sampleRate: String(stream.sample_rate).slice(0, 20) } : {}),
    })),
  };
}

async function makeThumbnail(mediaType, mimeType, sourcePath, workDir, durationSeconds = null) {
  const outputPath = join(workDir, "thumbnail.webp");
  if (mediaType === "image" || mediaType === "sprite") {
    const imageMeta = await sharp(sourcePath, { limitInputPixels: 40000000 }).metadata();
    await sharp(sourcePath, { limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 640, height: 360, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(outputPath);
    return { outputPath, dimensions: { width: imageMeta.width ?? null, height: imageMeta.height ?? null }, thumbnailKind: "image" };
  }
  if (mediaType === "video") {
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-ss", String(Number.isFinite(durationSeconds) ? Math.min(30, Math.max(0.5, durationSeconds * 0.1)) : 1),
      "-i", sourcePath, "-map", "0:V:0", "-frames:v", "1", "-vf", "scale=640:360:force_original_aspect_ratio=decrease",
      "-c:v", "libwebp", "-quality", "78", "-y", outputPath,
    ], 90000);
    return { outputPath, dimensions: null, thumbnailKind: "video" };
  }
  return null;
}

async function storeThumbnail(ownerId, mediaId, leaseToken, bucket, thumbnailPath) {
  const file = await readFile(thumbnailPath);
  if (!file.byteLength || file.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new Error("Generated thumbnail exceeded the 5 MiB safety limit.");
  }
  const { data: reservationId, error: reserveError } = await supabase.rpc(
    "reserve_raye2_worker_thumbnail_capacity",
    { p_owner_id: ownerId, p_bucket: bucket, p_bytes: file.byteLength },
  );
  if (reserveError) throw reserveError;
  const objectPath = `${ownerId}/thumbnails/${mediaId}-${leaseToken}.webp`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
    metadata: { ownerId, purpose: "raye2-thumbnail", mediaId },
  });
  if (uploadError) {
    await supabase.rpc("release_raye2_worker_thumbnail_capacity", { p_reservation_id: reservationId });
    throw uploadError;
  }
  return { path: `${bucket}/${objectPath}`, bytes: file.byteLength };
}


async function walkFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative));
    else if (entry.isFile()) files.push({ absolute, relative, bytes: (await stat(absolute)).size });
  }
  return files;
}

async function storeHlsObject(ownerId, mediaId, leaseToken, bucket, relativePath, absolutePath) {
  const outputParts = relativePath.split("/");
  if (outputParts.length < 2 || !["master", "360p", "720p"].includes(outputParts[0]) || !outputParts.slice(1).every(part => /^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error("Generated HLS output path is invalid.");
  }
  const file = await readFile(absolutePath);
  if (!file.byteLength || file.byteLength > MAX_HLS_OBJECT_BYTES) {
    throw new Error("Generated HLS output exceeded the per-object storage safety limit.");
  }
  const { data: reservationId, error: reserveError } = await supabase.rpc(
    "reserve_raye2_worker_thumbnail_capacity",
    { p_owner_id: ownerId, p_bucket: bucket, p_bytes: file.byteLength },
  );
  if (reserveError) throw reserveError;
  const objectPath = `${ownerId}/streams/${mediaId}-${leaseToken}/${relativePath}`;
  const contentType = relativePath.endsWith(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : "video/mp2t";
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
    contentType,
    cacheControl: "3600",
    upsert: false,
    metadata: { ownerId, purpose: "raye2-hls", mediaId },
  });
  if (uploadError) {
    await supabase.rpc("release_raye2_worker_thumbnail_capacity", { p_reservation_id: reservationId });
    throw uploadError;
  }
  return { path: `${bucket}/${objectPath}`, bytes: file.byteLength };
}

async function removeWorkerHls(ownerId, mediaId, masterPath) {
  if (!masterPath) return;
  const [bucket, ...parts] = masterPath.split("/");
  const objectPath = parts.join("/");
  const expectedPrefix = `${ownerId}/streams/${mediaId}-`;
  if (![PRIVATE_BUCKET, PUBLIC_BUCKET].includes(bucket) || !objectPath.startsWith(expectedPrefix) || !objectPath.endsWith("/master/master.m3u8")) {
    console.warn("[raye2-worker] skipped cleanup for an unexpected HLS path", masterPath);
    return;
  }
  const root = objectPath.slice(0, -"/master/master.m3u8".length);
  const objects = [];
  const collect = async folder => {
    const { data: entries, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw error;
    for (const entry of entries ?? []) {
      if (!entry.name || !/^[A-Za-z0-9_.-]+$/.test(entry.name)) continue;
      const child = `${folder}/${entry.name}`;
      if (entry.id === null) await collect(child);
      else objects.push(child);
    }
  };
  try {
    await collect(root);
    for (let offset = 0; offset < objects.length; offset += 100) {
      const { error } = await supabase.storage.from(bucket).remove(objects.slice(offset, offset + 100));
      if (error) throw error;
    }
  } catch (error) {
    console.error("[raye2-worker] generated HLS package needs orphan cleanup", error instanceof Error ? error.message : String(error));
  }
}

async function makeHlsPackage(sourcePath, workDir, durationSeconds, hasAudio, ownerId, mediaId, leaseToken, bucket) {
  if (!Number.isFinite(durationSeconds) || durationSeconds > MAX_HLS_DURATION_SECONDS) {
    return { hls: null, skippedReason: `Adaptive playback is limited to videos of ${MAX_HLS_DURATION_SECONDS / 60} minutes in this worker version.` };
  }
  const root = join(workDir, "hls");
  const uploaded = [];
  const masterDir = join(root, "master");
  await mkdir(masterDir, { recursive: true });
  const variants = [
    { name: "360p", maxWidth: 640, maxHeight: 360, crf: 27, audioRate: "96k", bandwidth: 850000 },
    { name: "720p", maxWidth: 1280, maxHeight: 720, crf: 24, audioRate: "128k", bandwidth: 2200000 },
  ];
  try {
    for (const variant of variants) {
      const variantDir = join(root, variant.name);
      await mkdir(variantDir, { recursive: true });
      const filter = `scale=w='min(${variant.maxWidth},iw)':h='min(${variant.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
      const args = [
        "-hide_banner", "-loglevel", "error", "-i", sourcePath,
        "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0?"] : []),
        "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", String(variant.crf),
        "-maxrate", variant.name === "720p" ? "2200k" : "850k",
        "-bufsize", variant.name === "720p" ? "4400k" : "1700k",
        "-threads", "2", "-force_key_frames", "expr:gte(t,n_forced*6)", "-sc_threshold", "0",
        ...(hasAudio ? ["-c:a", "aac", "-b:a", variant.audioRate, "-ac", "2"] : ["-an"]),
        "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", join(variantDir, "segment_%05d.ts"),
        "-y", join(variantDir, "index.m3u8"),
      ];
      await run("ffmpeg", args, MAX_TRANSCODE_TIMEOUT_MS);
    }
    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...variants.flatMap(variant => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},NAME="${variant.name}"`,
        `../${variant.name}/index.m3u8`,
      ]),
      "",
    ].join("\n");
    const masterFile = join(masterDir, "master.m3u8");
    await writeFile(masterFile, master, "utf8");
    const files = await walkFiles(root);
    if (!files.some(file => file.relative === "master/master.m3u8")
      || !files.some(file => file.relative === "360p/index.m3u8")
      || !files.some(file => file.relative === "720p/index.m3u8")) {
      throw new Error("Adaptive HLS package is missing a required master or rendition playlist.");
    }
    for (const file of files) {
      const stored = await storeHlsObject(ownerId, mediaId, leaseToken, bucket, file.relative, file.absolute);
      uploaded.push(stored.path);
    }
    return {
      hls: {
        masterPath: `${bucket}/${ownerId}/streams/${mediaId}-${leaseToken}/master/master.m3u8`,
        variants: variants.map(variant => variant.name),
        segmentDurationSeconds: 6,
        hasAudio,
        outputObjects: files.length,
      },
      skippedReason: null,
    };
  } catch (error) {
    if (uploaded.length) {
      const prefix = `${ownerId}/streams/${mediaId}-${leaseToken}/`;
      const paths = uploaded.map(value => value.slice(bucket.length + 1)).filter(value => value.startsWith(prefix));
      if (paths.length) {
        const { error: cleanupError } = await supabase.storage.from(bucket).remove(paths);
        if (cleanupError) console.error("[raye2-worker] partial HLS output cleanup failed", cleanupError.message);
      }
    }
    throw error;
  }
}

async function processJob(job) {
  if (!job.owner_id || !job.storage_path) throw new Error("Media job is missing its owner or storage path.");
  const [bucket, ...pathParts] = job.storage_path.split("/");
  const objectPath = pathParts.join("/");
  if (![PRIVATE_BUCKET, PUBLIC_BUCKET].includes(bucket) || !objectPath.startsWith(job.owner_id + "/")) {
    throw new Error("Media job storage path is outside the creator's managed media folders.");
  }
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectPath);
  if (downloadError || !blob) throw downloadError ?? new Error("Could not download source media.");
  if (blob.size < 1 || blob.size > MAX_SOURCE_BYTES) throw new Error("Source media is empty or exceeds the 50 MiB processing limit.");

  const workDir = await mkdtemp(join(tmpdir(), "raye2-media-"));
  try {
    const sourcePath = join(workDir, "source");
    const sourceBytes = Buffer.from(await blob.arrayBuffer());
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    await writeFile(sourcePath, sourceBytes);
    let extracted = {};
    let thumbnail = null;
    let thumbnailSkippedReason = null;

    if (job.media_type === "image" || job.media_type === "sprite") {
      const info = await sharp(sourcePath, { limitInputPixels: 40000000, failOn: "error" }).metadata();
      const width = Number(info.width ?? 0);
      const height = Number(info.height ?? 0);
      const supportedFormats = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);
      if (!supportedFormats.has(String(info.format ?? ""))) {
        throw new Error("Image format is not supported by the secure media processor.");
      }
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 40000000) {
        throw new Error("Image dimensions are invalid or exceed the 40-megapixel processing limit.");
      }
      extracted = {
        width,
        height,
        imageFormat: info.format,
        hasAlpha: info.hasAlpha ?? false,
        ...(info.pages && info.pages > 1 ? { animationFrames: Math.min(info.pages, 500) } : {}),
      };
      thumbnail = await makeThumbnail(job.media_type, job.mime_type, sourcePath, workDir, extracted.durationSeconds);
    } else if (job.media_type === "video" || job.media_type === "audio") {
      extracted = await probeMedia(sourcePath, job.media_type);
      if (job.media_type === "video") {
        try {
          thumbnail = await makeThumbnail(job.media_type, job.mime_type, sourcePath, workDir, extracted.durationSeconds);
        } catch (error) {
          thumbnailSkippedReason = `Video thumbnail unavailable: ${error instanceof Error ? error.message.slice(0, 300) : "ffmpeg failed"}`;
        }
        try {
          const hasAudio = extracted.streams.some(stream => stream.type === "audio");
          const packageResult = await makeHlsPackage(sourcePath, workDir, extracted.durationSeconds, hasAudio, job.owner_id, job.media_id, job.lease_token, bucket);
          if (packageResult.hls) extracted.hls = packageResult.hls;
          if (packageResult.skippedReason) extracted.hlsSkippedReason = packageResult.skippedReason;
        } catch (error) {
          extracted.hlsSkippedReason = `Adaptive playback unavailable: ${error instanceof Error ? error.message.slice(0, 400) : "transcoding failed"}`;
        }
      }
    } else {
      throw new Error("Unsupported media kind for processing.");
    }

    let thumbnailResult = null;
    if (thumbnail) {
      try {
        thumbnailResult = await storeThumbnail(job.owner_id, job.media_id, job.lease_token, bucket, thumbnail.outputPath);
        extracted.thumbnailKind = thumbnail.thumbnailKind;
        if (thumbnail.dimensions) extracted.imageDimensions = thumbnail.dimensions;
      } catch (error) {
        thumbnailSkippedReason = `Thumbnail not stored: ${error instanceof Error ? error.message.slice(0, 300) : "storage failed"}`;
      }
    }
    if (thumbnailSkippedReason) extracted.thumbnailSkippedReason = thumbnailSkippedReason;
    return {
      success: true,
      metadata: {
        processing: {
          worker: "raye2-self-hosted",
          completedAt: new Date().toISOString(),
          sourceBytes: blob.size,
          sourceSha256,
          ...extracted,
          ...(thumbnailResult ? { thumbnailBytes: thumbnailResult.bytes } : {}),
        },
      },
      thumbnailPath: thumbnailResult?.path ?? null,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function removeWorkerThumbnail(ownerId, thumbnailPath, mediaId) {
  if (!thumbnailPath) return;
  const [bucket, ...parts] = thumbnailPath.split("/");
  const objectPath = parts.join("/");
  const expectedPrefix = `${ownerId}/thumbnails/${mediaId}-`;
  if (![PRIVATE_BUCKET, PUBLIC_BUCKET].includes(bucket) || !objectPath.startsWith(expectedPrefix) || !objectPath.endsWith(".webp")) {
    console.warn("[raye2-worker] skipped cleanup for an unexpected thumbnail path", thumbnailPath);
    return;
  }
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) console.error("[raye2-worker] generated thumbnail needs orphan cleanup", error.message);
}

const LEASE_HEARTBEAT_MS = 5 * 60 * 1000;

function startLeaseHeartbeat(job) {
  let leaseLost = false;
  let stopped = false;
  let timer = null;
  let renewalInFlight = null;
  let stopPromise = null;

  const scheduleRenewal = () => {
    if (stopped || leaseLost) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped || leaseLost) return;
      renewalInFlight = (async () => {
        try {
          const { data, error } = await supabase.rpc("renew_raye2_media_processing_lease", {
            p_media_id: job.media_id,
            p_lease_token: job.lease_token,
          });
          if (error) throw error;
          if (data !== true) throw new Error("The database rejected this processing lease renewal.");
        } catch (error) {
          // Fail closed: if the worker cannot prove that it still owns the
          // lease, it must not publish output under a possibly stale token.
          leaseLost = true;
          console.error(`[raye2-worker] lease renewal could not be confirmed for ${job.media_id}; refusing stale completion`, error instanceof Error ? error.message : String(error));
        }
      })();
      await renewalInFlight;
      renewalInFlight = null;
      scheduleRenewal();
    }, LEASE_HEARTBEAT_MS);
    timer.unref?.();
  };

  scheduleRenewal();
  return {
    hasLostLease: () => leaseLost,
    stop: () => {
      if (stopPromise) return stopPromise;
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      stopPromise = (async () => {
        if (renewalInFlight) await renewalInFlight;
      })();
      return stopPromise;
    },
  };
}

async function handleOne() {
  const { data: jobs, error } = await supabase.rpc("claim_raye2_media_processing_job");
  if (error) throw error;
  const job = jobs?.[0];
  if (!job) return false;
  console.info(`[raye2-worker] claimed ${job.media_id} (attempt ${job.processing_attempts})`);
  let result = null;
  let completedSuccessfully = false;
  const heartbeat = startLeaseHeartbeat(job);
  try {
    result = await processJob(job);
    await heartbeat.stop();
    if (heartbeat.hasLostLease()) throw new Error("Processing lease was lost; a later worker may retry.");
    const { data: completed, error: completeError } = await supabase.rpc("complete_raye2_media_processing_job", {
      p_media_id: job.media_id,
      p_lease_token: job.lease_token,
      p_success: true,
      p_result_metadata: result.metadata,
      p_thumbnail_path: result.thumbnailPath,
      p_error: null,
    });
    if (completeError) throw completeError;
    if (completed !== true) throw new Error("Processing lease expired before completion; a later worker may retry.");
    completedSuccessfully = true;
    if (job.previous_thumbnail_path && job.previous_thumbnail_path !== result.thumbnailPath) {
      await removeWorkerThumbnail(job.owner_id, job.previous_thumbnail_path, job.media_id);
    }
    console.info(`[raye2-worker] ready ${job.media_id}`);
  } catch (error) {
    await heartbeat.stop();
    if (!completedSuccessfully && result?.thumbnailPath) {
      await removeWorkerThumbnail(job.owner_id, result.thumbnailPath, job.media_id);
    }
    const hlsMasterPath = result?.metadata?.processing?.hls?.masterPath;
    if (!completedSuccessfully && typeof hlsMasterPath === "string") {
      await removeWorkerHls(job.owner_id, job.media_id, hlsMasterPath);
    }
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing failure.";
    const { error: completeError } = await supabase.rpc("complete_raye2_media_processing_job", {
      p_media_id: job.media_id,
      p_lease_token: job.lease_token,
      p_success: false,
      p_result_metadata: { processing: { worker: "raye2-self-hosted", failedAt: new Date().toISOString() } },
      p_thumbnail_path: null,
      p_error: message,
    });
    if (completeError) console.error("[raye2-worker] could not record failure", completeError.message);
    console.error(`[raye2-worker] failed ${job.media_id}: ${message}`);
  }
  return true;
}

const shutdownController = new AbortController();
let shuttingDown = false;
let consecutiveQueueErrors = 0;

function requestShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[raye2-worker] received ${signal}; finishing the current job before exit.`);
  shutdownController.abort();
}

process.once("SIGINT", () => requestShutdown("SIGINT"));
process.once("SIGTERM", () => requestShutdown("SIGTERM"));

async function waitForNextPoll(milliseconds) {
  try {
    await delay(milliseconds, undefined, { signal: shutdownController.signal });
  } catch (error) {
    if (!shuttingDown) throw error;
  }
}

console.info("[raye2-worker] running. Requires ffprobe; ffmpeg is used for video thumbnails. No hosted paid worker is used.");
while (!shuttingDown) {
  try {
    const processed = await handleOne();
    consecutiveQueueErrors = 0;
    if (!processed && !shuttingDown) {
      const jitter = Math.floor(Math.random() * Math.min(1500, POLL_MS * 0.2));
      await waitForNextPoll(POLL_MS + jitter);
    }
  } catch (error) {
    if (shuttingDown) break;
    consecutiveQueueErrors = Math.min(consecutiveQueueErrors + 1, 6);
    const backoff = Math.min(POLL_MS * (2 ** consecutiveQueueErrors), 60000);
    const jitter = Math.floor(Math.random() * Math.min(3000, backoff * 0.15));
    console.error("[raye2-worker] queue error; retrying with backoff", {
      attempt: consecutiveQueueErrors,
      delayMs: backoff + jitter,
      message: error instanceof Error ? error.message : String(error),
    });
    await waitForNextPoll(backoff + jitter);
  }
}
console.info("[raye2-worker] stopped cleanly.");
