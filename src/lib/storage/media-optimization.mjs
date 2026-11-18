/**
 * Raye2 media optimization planner — pure logic for the transcoding ladder shared by the self-hosted
 * media worker and tests.
 *
 * Reality check baked into these numbers: there is no such thing as lossless video re-encoding that
 * still shrinks a file. What we can do honestly is *visually lossless* compression — modern codecs
 * (AV1, HEVC) at a high quality target look identical to the eye while using roughly 40-60% fewer
 * bytes than H.264. This module chooses the best available codec and a sane ladder for that goal.
 */

export const VIDEO_CODECS = Object.freeze({
  av1: { name: "av1", encoder: "libsvtav1", crfScale: 0.62, estimatedSavingsPercent: 55, container: "mp4" },
  hevc: { name: "hevc", encoder: "libx265", crfScale: 0.78, estimatedSavingsPercent: 48, container: "mp4" },
  h264: { name: "h264", encoder: "libx264", crfScale: 1, estimatedSavingsPercent: 0, container: "mp4" },
});

/** Choose the best codec the caller reports as available, preferring AV1 then HEVC then H.264. */
export function chooseVideoCodec(availableCodecs = ["h264"]) {
  if (!Array.isArray(availableCodecs)) throw new TypeError("availableCodecs must be an array.");
  for (const name of ["av1", "hevc", "h264"]) {
    if (availableCodecs.includes(name)) return VIDEO_CODECS[name];
  }
  return VIDEO_CODECS.h264;
}

const RENDITION_LADDER = [
  { name: "360p", maxWidth: 640, maxHeight: 360, baseCrf: 27, audioKbps: 96, bandwidth: 850_000 },
  { name: "540p", maxWidth: 960, maxHeight: 540, baseCrf: 25, audioKbps: 112, bandwidth: 1_400_000 },
  { name: "720p", maxWidth: 1280, maxHeight: 720, baseCrf: 24, audioKbps: 128, bandwidth: 2_200_000 },
  { name: "1080p", maxWidth: 1920, maxHeight: 1080, baseCrf: 22, audioKbps: 160, bandwidth: 4_000_000 },
];

/**
 * Build the HLS/transcode ladder for a source video. Rungs above the source height are dropped, and
 * only the smallest rung is kept for very small sources so we never upscale.
 */
export function planVideoLadder({ sourceHeight, hasAudio = true, codec = "h264", segmentSeconds = 6 } = {}) {
  if (!Number.isSafeInteger(sourceHeight) || sourceHeight < 1) {
    throw new TypeError("sourceHeight must be a positive integer.");
  }
  if (!Number.isInteger(segmentSeconds) || segmentSeconds < 1 || segmentSeconds > 30) {
    throw new TypeError("segmentSeconds must be between 1 and 30.");
  }
  const chosen = VIDEO_CODECS[codec] ?? VIDEO_CODECS.h264;
  let rungs = RENDITION_LADDER.filter(rung => rung.maxHeight <= sourceHeight + 8);
  if (!rungs.length) rungs = [RENDITION_LADDER[0]];
  const variants = rungs.map(rung => ({
    name: rung.name,
    maxWidth: rung.maxWidth,
    maxHeight: rung.maxHeight,
    crf: Math.round(rung.baseCrf * chosen.crfScale),
    audioKbps: rung.audioKbps,
    bandwidth: Math.round(rung.bandwidth * (chosen.name === "h264" ? 1 : 0.5)),
    videoCodec: chosen.encoder,
    hasAudio,
  }));
  return {
    codec: chosen.name,
    encoder: chosen.encoder,
    segmentSeconds,
    variants,
    estimatedSavingsPercent: chosen.estimatedSavingsPercent,
  };
}

/** Plan a compact progressive rendition used for archive/download of long videos. */
export function planCompactRendition({ sourceHeight, sourceBytes, hasAudio = true, codec = "h264" } = {}) {
  if (!Number.isSafeInteger(sourceHeight) || sourceHeight < 1) throw new TypeError("sourceHeight must be a positive integer.");
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0) throw new TypeError("sourceBytes must be a non-negative integer.");
  const chosen = VIDEO_CODECS[codec] ?? VIDEO_CODECS.h264;
  const targetHeight = Math.min(1080, Math.max(360, sourceHeight));
  const estimatedBytes = Math.round(sourceBytes * (1 - chosen.estimatedSavingsPercent / 100));
  return {
    codec: chosen.name,
    encoder: chosen.encoder,
    maxHeight: targetHeight,
    hasAudio,
    estimatedBytes,
    estimatedSavingsPercent: chosen.estimatedSavingsPercent,
  };
}

/** Pick a still-image thumbnail format; AVIF first when the encoder is available, else WebP. */
export function chooseThumbnailFormat(availableFormats = ["webp"]) {
  if (!Array.isArray(availableFormats)) throw new TypeError("availableFormats must be an array.");
  if (availableFormats.includes("avif")) return { format: "avif", extension: "avif", contentType: "image/avif" };
  return { format: "webp", extension: "webp", contentType: "image/webp" };
}
