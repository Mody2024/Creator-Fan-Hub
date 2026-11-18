/**
 * Raye2 multipart upload planner — pure logic shared by the chunked-upload client, the server route
 * and tests. The provider adapter performs the actual S3 multipart calls; this module only decides
 * part sizes, numbering, resume points and completion order so behaviour is identical everywhere.
 *
 * S3 rules encoded here:
 *  - every part except the last must be at least 5 MiB (except a single-part upload);
 *  - a part number is 1..10000, and part numbers must be contiguous;
 *  - the last part may be smaller than the minimum;
 *  - the completion manifest must be ordered by part number.
 */

export const MIN_PART_BYTES = 5 * 1024 * 1024;
export const MAX_PART_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_PARTS = 10000;
export const DEFAULT_PART_BYTES = 16 * 1024 * 1024;
/** Files at or below this size stay on the simple single-shot PUT path. */
export const SINGLE_SHOT_THRESHOLD_BYTES = 25 * 1024 * 1024;

function assertSafeSize(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
}

/**
 * Choose a part size that keeps the number of parts within the S3 limit and the part size inside the
 * allowed range. Large files get larger parts so they never exceed 10000 parts.
 */
export function choosePartSize(totalBytes, { preferred = DEFAULT_PART_BYTES } = {}) {
  assertSafeSize(totalBytes, "totalBytes");
  assertSafeSize(preferred, "preferred");
  if (preferred < MIN_PART_BYTES) throw new TypeError("preferred part size is below the 5 MiB minimum.");
  let part = Math.min(Math.max(preferred, MIN_PART_BYTES), MAX_PART_BYTES);
  if (totalBytes > 0) {
    const required = Math.ceil(totalBytes / MAX_PARTS);
    if (required > part) part = Math.min(required, MAX_PART_BYTES);
  }
  return part;
}

/** Build the ordered part plan for a file: partNumber, offset and byte length for each part. */
export function planUploadParts(totalBytes, { preferred = DEFAULT_PART_BYTES } = {}) {
  assertSafeSize(totalBytes, "totalBytes");
  if (totalBytes < 1) throw new TypeError("A multipart upload requires at least one byte.");
  const partSize = choosePartSize(totalBytes, { preferred });
  const parts = [];
  let offset = 0;
  let partNumber = 1;
  while (offset < totalBytes) {
    const length = Math.min(partSize, totalBytes - offset);
    parts.push({ partNumber, offset, length });
    offset += length;
    partNumber += 1;
  }
  if (parts.length > MAX_PARTS) throw new RangeError("File requires more than the maximum number of parts.");
  return { partSize, parts, partCount: parts.length };
}

/** True when the file should use multipart rather than a single PUT. */
export function shouldUseMultipart(totalBytes, { threshold = SINGLE_SHOT_THRESHOLD_BYTES } = {}) {
  assertSafeSize(totalBytes, "totalBytes");
  return totalBytes > threshold;
}

/**
 * Resume plan: given the plan and already-uploaded parts, return the next parts to send and whether
 * the upload is complete. Uploaded entries may be out of order and carry an etag.
 */
export function planResume(plan, uploadedParts = []) {
  if (!plan || !Array.isArray(plan.parts)) throw new TypeError("a part plan is required.");
  if (!Array.isArray(uploadedParts)) throw new TypeError("uploadedParts must be an array.");
  const done = new Map();
  for (const part of uploadedParts) {
    if (!part || !Number.isInteger(part.partNumber) || typeof part.etag !== "string" || !part.etag) {
      throw new TypeError("each uploaded part needs a partNumber and an etag.");
    }
    if (part.partNumber < 1 || part.partNumber > plan.partCount) continue;
    done.set(part.partNumber, { partNumber: part.partNumber, etag: part.etag });
  }
  const remaining = plan.parts.filter(part => !done.has(part.partNumber));
  return {
    remaining,
    completed: done.size,
    total: plan.partCount,
    isComplete: done.size === plan.partCount,
    progressPercent: Math.round((done.size / plan.partCount) * 100),
  };
}

/** Order the completion manifest by part number and reject gaps or duplicates. */
export function buildCompletionManifest(uploadedParts = []) {
  if (!Array.isArray(uploadedParts) || uploadedParts.length < 1) {
    throw new TypeError("at least one uploaded part is required.");
  }
  const ordered = [...uploadedParts]
    .map(part => ({ partNumber: part?.partNumber, etag: String(part?.etag ?? "").replace(/"/g, "") }))
    .sort((a, b) => a.partNumber - b.partNumber);
  ordered.forEach((part, index) => {
    if (!Number.isInteger(part.partNumber) || part.partNumber !== index + 1 || !part.etag) {
      throw new TypeError("part numbers must be contiguous starting at 1 with valid etags.");
    }
  });
  return ordered;
}

/** Retry schedule for a failed part: bounded exponential backoff, capped attempts. */
export function planPartRetry(attempt, { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 30000 } = {}) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError("attempt must be a positive integer.");
  if (attempt >= maxAttempts) return { retry: false, delayMs: 0, attempt };
  const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return { retry: true, delayMs, attempt };
}
