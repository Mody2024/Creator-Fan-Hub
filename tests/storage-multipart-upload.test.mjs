import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  buildCompletionManifest,
  choosePartSize,
  MIN_PART_BYTES,
  planPartRetry,
  planResume,
  planUploadParts,
  shouldUseMultipart,
  SINGLE_SHOT_THRESHOLD_BYTES,
} from "../src/lib/storage/multipart-upload.mjs";

test("small files stay on the single-shot path", () => {
  assert.equal(shouldUseMultipart(1_000_000), false);
  assert.equal(shouldUseMultipart(SINGLE_SHOT_THRESHOLD_BYTES), false);
  assert.equal(shouldUseMultipart(SINGLE_SHOT_THRESHOLD_BYTES + 1), true);
});

test("part plan covers the file exactly with contiguous numbers", () => {
  const { parts, partCount, partSize } = planUploadParts(50 * 1024 * 1024, { preferred: 16 * 1024 * 1024 });
  assert.equal(partSize, 16 * 1024 * 1024);
  assert.equal(partCount, 4);
  assert.deepEqual(parts.map(part => part.partNumber), [1, 2, 3, 4]);
  assert.equal(parts[0].offset, 0);
  assert.equal(parts[3].length, 2 * 1024 * 1024);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  assert.equal(total, 50 * 1024 * 1024);
});

test("every non-final part meets the 5 MiB minimum", () => {
  const { parts } = planUploadParts(100 * 1024 * 1024, { preferred: 6 * 1024 * 1024 });
  for (const part of parts.slice(0, -1)) assert.ok(part.length >= MIN_PART_BYTES);
});

test("very large files never exceed the maximum number of parts", () => {
  const total = 200 * 1024 * 1024 * 1024; // 200 GiB
  const { parts, partSize } = planUploadParts(total);
  assert.ok(parts.length <= 10000);
  assert.ok(partSize >= MIN_PART_BYTES);
  assert.equal(parts.reduce((sum, part) => sum + part.length, 0), total);
});

test("part size is clamped to the S3 minimum when preferred is too small", () => {
  assert.throws(() => choosePartSize(10 * 1024 * 1024, { preferred: 1024 }), /below the 5 MiB minimum/);
});

test("resume reports remaining parts, progress and completion", () => {
  const plan = planUploadParts(50 * 1024 * 1024, { preferred: 16 * 1024 * 1024 });
  const resumed = planResume(plan, [{ partNumber: 1, etag: '"a"' }, { partNumber: 3, etag: '"c"' }]);
  assert.equal(resumed.completed, 2);
  assert.equal(resumed.total, 4);
  assert.equal(resumed.isComplete, false);
  assert.equal(resumed.progressPercent, 50);
  assert.deepEqual(resumed.remaining.map(part => part.partNumber), [2, 4]);
  const done = planResume(plan, plan.parts.map(part => ({ partNumber: part.partNumber, etag: '"x"' })));
  assert.equal(done.isComplete, true);
  assert.equal(done.progressPercent, 100);
});

test("the completion manifest is ordered and rejects gaps or duplicates", () => {
  const manifest = buildCompletionManifest([{ partNumber: 2, etag: '"b"' }, { partNumber: 1, etag: '"a"' }]);
  assert.deepEqual(manifest, [{ partNumber: 1, etag: "a" }, { partNumber: 2, etag: "b" }]);
  assert.throws(() => buildCompletionManifest([{ partNumber: 1, etag: '"a"' }, { partNumber: 3, etag: '"c"' }]), /contiguous/);
  assert.throws(() => buildCompletionManifest([{ partNumber: 1, etag: '"a"' }, { partNumber: 1, etag: '"a"' }]), /contiguous/);
  assert.throws(() => buildCompletionManifest([]), TypeError);
});

test("part retry uses bounded exponential backoff", () => {
  assert.deepEqual(planPartRetry(1), { retry: true, delayMs: 1000, attempt: 1 });
  assert.deepEqual(planPartRetry(3), { retry: true, delayMs: 4000, attempt: 3 });
  assert.equal(planPartRetry(5).retry, false);
  assert.equal(planPartRetry(9).retry, false);
});


test("multipart completion recovers an object committed before ledger finalization", async () => {
  const route = await readFile(new URL("../src/app/api/raye2/storage/multipart/route.ts", import.meta.url), "utf8");
  assert.match(route, /\.from\("raye2_storage_reservations"\)[\s\S]*?\.select\("reservation_state,object_id"\)/);
  assert.match(route, /reservation\.reservation_state === "consumed" && typeof reservation\.object_id === "string"/);
  assert.match(route, /alreadyCompleted: true, recovered: true/);
  assert.match(route, /p_upload_state: "completed"/);
});

test("multipart completion never repeats provider completion after the reservation was consumed", async () => {
  const route = await readFile(new URL("../src/app/api/raye2/storage/multipart/route.ts", import.meta.url), "utf8");
  const recovery = route.indexOf('reservation.reservation_state === "consumed"');
  const providerComplete = route.indexOf("adapter.completeMultipartUpload", route.indexOf("async function completeUpload"));
  assert.ok(recovery >= 0 && providerComplete > recovery);
  assert.match(route, /if \(reservation\.reservation_state !== "active"\) return fail\("reservation_finalized"/);
});

test("multipart completion reports ledger-finalization failures without losing the committed object", async () => {
  const route = await readFile(new URL("../src/app/api/raye2/storage/multipart/route.ts", import.meta.url), "utf8");
  assert.match(route, /completion_finalize_failed/);
  assert.match(route, /The object is stored and recorded\. Retry completion to safely finalize the upload\./);
});


test("multipart completion verifies an existing provider object before replaying completion", async () => {
  const route = await readFile(new URL("../src/app/api/raye2/storage/multipart/route.ts", import.meta.url), "utf8");
  assert.match(route, /headObject\?: \(input: \{ bucket: string; key: string \}\)/);
  assert.match(route, /existingObject = await adapter\.headObject/);
  assert.match(route, /existingObject\.sizeBytes !== Number\(upload\.total_bytes\)/);
  assert.match(route, /if \(existingObject\)[\s\S]*?else \{[\s\S]*?adapter\.completeMultipartUpload/);
  assert.match(route, /provider_verification_failed/);
});
