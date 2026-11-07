import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_MS = Math.max(2000, Number(process.env.RAYE2_WORKER_POLL_MS ?? 10000));
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const PRIVATE_BUCKET = "creator-media-private";
const PUBLIC_BUCKET = "creator-media-public";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.");
}
if (SERVICE_ROLE_KEY.startsWith("sb_publishable_") || SERVICE_ROLE_KEY.startsWith("eyJ") === false) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be the server-only service_role secret, never a publishable/anon key.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function probeMedia(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration,size,format_name:stream=codec_type,codec_name,width,height,channels,sample_rate",
    "-of", "json", filePath,
  ], 30000);
  const parsed = JSON.parse(stdout);
  const duration = Number(parsed.format?.duration);
  return {
    container: String(parsed.format?.format_name ?? "").slice(0, 120),
    durationSeconds: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null,
    streams: (parsed.streams ?? []).slice(0, 12).map(stream => ({
      type: String(stream.codec_type ?? "").slice(0, 20),
      codec: String(stream.codec_name ?? "").slice(0, 40),
      ...(Number.isFinite(Number(stream.width)) ? { width: Number(stream.width) } : {}),
      ...(Number.isFinite(Number(stream.height)) ? { height: Number(stream.height) } : {}),
      ...(Number.isFinite(Number(stream.channels)) ? { channels: Number(stream.channels) } : {}),
      ...(stream.sample_rate ? { sampleRate: String(stream.sample_rate).slice(0, 20) } : {}),
    })),
  };
}

async function makeThumbnail(mediaType, mimeType, sourcePath, workDir) {
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
      "-hide_banner", "-loglevel", "error", "-ss", "1",
      "-i", sourcePath, "-frames:v", "1", "-vf", "scale=640:360:force_original_aspect_ratio=decrease",
      "-c:v", "libwebp", "-quality", "78", "-y", outputPath,
    ], 90000);
    return { outputPath, dimensions: null, thumbnailKind: "video" };
  }
  return null;
}

async function storeThumbnail(ownerId, mediaId, thumbnailPath) {
  const file = await readFile(thumbnailPath);
  if (!file.byteLength || file.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new Error("Generated thumbnail exceeded the 5 MiB safety limit.");
  }
  const { data: reservationId, error: reserveError } = await supabase.rpc(
    "reserve_raye2_worker_thumbnail_capacity",
    { p_owner_id: ownerId, p_bucket: PRIVATE_BUCKET, p_bytes: file.byteLength },
  );
  if (reserveError) throw reserveError;
  const objectPath = `${ownerId}/thumbnails/${mediaId}.webp`;
  const { error: uploadError } = await supabase.storage.from(PRIVATE_BUCKET).upload(objectPath, file, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: true,
    metadata: { ownerId, purpose: "raye2-thumbnail", mediaId },
  });
  if (uploadError) {
    await supabase.rpc("release_raye2_worker_thumbnail_capacity", { p_reservation_id: reservationId });
    throw uploadError;
  }
  return { path: `${PRIVATE_BUCKET}/${objectPath}`, bytes: file.byteLength };
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
    await writeFile(sourcePath, Buffer.from(await blob.arrayBuffer()));
    let extracted = {};
    let thumbnail = null;
    let thumbnailSkippedReason = null;

    if (job.media_type === "image" || job.media_type === "sprite") {
      const info = await sharp(sourcePath, { limitInputPixels: 40000000 }).metadata();
      extracted = {
        width: info.width ?? null,
        height: info.height ?? null,
        imageFormat: info.format ?? null,
        hasAlpha: info.hasAlpha ?? false,
      };
      thumbnail = await makeThumbnail(job.media_type, job.mime_type, sourcePath, workDir);
    } else if (job.media_type === "video" || job.media_type === "audio") {
      extracted = await probeMedia(sourcePath);
      if (job.media_type === "video") {
        try {
          thumbnail = await makeThumbnail(job.media_type, job.mime_type, sourcePath, workDir);
        } catch (error) {
          thumbnailSkippedReason = `Video thumbnail unavailable: ${error instanceof Error ? error.message.slice(0, 300) : "ffmpeg failed"}`;
        }
      }
    } else {
      throw new Error("Unsupported media kind for processing.");
    }

    let thumbnailResult = null;
    if (thumbnail) {
      try {
        thumbnailResult = await storeThumbnail(job.owner_id, job.media_id, thumbnail.outputPath);
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

async function handleOne() {
  const { data: jobs, error } = await supabase.rpc("claim_raye2_media_processing_job");
  if (error) throw error;
  const job = jobs?.[0];
  if (!job) return false;
  console.info(`[raye2-worker] claimed ${job.media_id} (attempt ${job.processing_attempts})`);
  try {
    const result = await processJob(job);
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
    console.info(`[raye2-worker] ready ${job.media_id}`);
  } catch (error) {
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

console.info("[raye2-worker] running. Requires ffprobe; ffmpeg is used for video thumbnails. No hosted paid worker is used.");
while (true) {
  try {
    const processed = await handleOne();
    if (!processed) await delay(POLL_MS);
  } catch (error) {
    console.error("[raye2-worker] queue error", error instanceof Error ? error.message : error);
    await delay(POLL_MS);
  }
}
