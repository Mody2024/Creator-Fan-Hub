import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseThumbnailFormat,
  chooseVideoCodec,
  planCompactRendition,
  planVideoLadder,
} from "../src/lib/storage/media-optimization.mjs";

test("the best available codec is chosen, preferring AV1 then HEVC then H.264", () => {
  assert.equal(chooseVideoCodec(["h264", "hevc", "av1"]).name, "av1");
  assert.equal(chooseVideoCodec(["h264", "hevc"]).name, "hevc");
  assert.equal(chooseVideoCodec(["h264"]).name, "h264");
  assert.equal(chooseVideoCodec([]).name, "h264");
  assert.equal(chooseVideoCodec(["vp9"]).name, "h264");
});

test("the ladder drops rungs above the source and never upscales", () => {
  const small = planVideoLadder({ sourceHeight: 360 });
  assert.deepEqual(small.variants.map(variant => variant.name), ["360p"]);
  const medium = planVideoLadder({ sourceHeight: 720 });
  assert.deepEqual(medium.variants.map(variant => variant.name), ["360p", "540p", "720p"]);
  const large = planVideoLadder({ sourceHeight: 1080 });
  assert.deepEqual(large.variants.map(variant => variant.name), ["360p", "540p", "720p", "1080p"]);
});

test("a modern codec lowers the CRF and the estimated bitrate", () => {
  const av1 = planVideoLadder({ sourceHeight: 1080, codec: "av1" });
  const h264 = planVideoLadder({ sourceHeight: 1080, codec: "h264" });
  const av1Rung = av1.variants.find(variant => variant.name === "1080p");
  const h264Rung = h264.variants.find(variant => variant.name === "1080p");
  assert.ok(av1Rung.crf < h264Rung.crf);
  assert.ok(av1Rung.bandwidth < h264Rung.bandwidth);
  assert.equal(av1.encoder, "libsvtav1");
  assert.equal(av1.estimatedSavingsPercent, 55);
  assert.equal(h264.estimatedSavingsPercent, 0);
});

test("audio mapping and segment length are carried through", () => {
  const noAudio = planVideoLadder({ sourceHeight: 720, hasAudio: false, segmentSeconds: 4 });
  assert.equal(noAudio.segmentSeconds, 4);
  assert.ok(noAudio.variants.every(variant => variant.hasAudio === false));
  assert.throws(() => planVideoLadder({ sourceHeight: 0 }), TypeError);
  assert.throws(() => planVideoLadder({ sourceHeight: 720, segmentSeconds: 0 }), TypeError);
});

test("compact rendition estimates a smaller archive copy for long videos", () => {
  const av1 = planCompactRendition({ sourceHeight: 2160, sourceBytes: 1_000_000_000, codec: "av1" });
  assert.equal(av1.maxHeight, 1080);
  assert.equal(av1.estimatedBytes, 450_000_000);
  assert.equal(av1.estimatedSavingsPercent, 55);
  const h264 = planCompactRendition({ sourceHeight: 480, sourceBytes: 1_000_000, codec: "h264" });
  assert.equal(h264.maxHeight, 480);
  assert.equal(h264.estimatedBytes, 1_000_000);
});

test("thumbnail format prefers AVIF when the encoder is available", () => {
  assert.equal(chooseThumbnailFormat(["webp", "avif"]).format, "avif");
  assert.equal(chooseThumbnailFormat(["webp"]).contentType, "image/webp");
  assert.equal(chooseThumbnailFormat([]).format, "webp");
});
