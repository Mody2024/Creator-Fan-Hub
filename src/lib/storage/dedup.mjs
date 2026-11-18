/**
 * Raye2 content-addressed storage deduplication — pure logic shared by the upload worker, the admin
 * dashboard and tests. The database is authoritative (raye2_register_storage_object holds the advisory
 * lock and bumps ref_count); this module mirrors those rules so a caller can predict the outcome.
 */

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Accept a hex digest in either case and return the canonical lowercase form. */
export function normalizeSha256(value) {
  if (typeof value !== "string") throw new TypeError("A sha256 digest string is required.");
  const digest = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) throw new TypeError("A 64-character lowercase hex sha256 digest is required.");
  return digest;
}

/** Stable, provider-neutral blob key for a digest. */
export function buildBlobKey(digest) {
  return "sha256:" + normalizeSha256(digest);
}

/**
 * Decide whether an upload is a dedup hit against already-known blobs.
 * Returns the canonical replica location when it is a hit, so the caller can copy server-side
 * instead of re-uploading the same bytes.
 */
export function planDedup({ digest, sizeBytes, knownBlobs = [] }) {
  const sha256 = normalizeSha256(digest);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new TypeError("sizeBytes must be a non-negative safe integer.");
  }
  if (!Array.isArray(knownBlobs)) throw new TypeError("knownBlobs must be an array.");
  const existing = knownBlobs.find(blob => blob && normalizeSha256(blob.sha256) === sha256);
  if (!existing) {
    return { deduplicated: false, sha256, chargedBytes: sizeBytes, canonicalProviderId: null, canonicalObjectKey: null };
  }
  return {
    deduplicated: true,
    sha256,
    chargedBytes: 0,
    canonicalProviderId: existing.canonicalProviderId ?? null,
    canonicalObjectKey: existing.canonicalObjectKey ?? null,
  };
}

/** Sum the physical bytes deduplication avoids across a set of blob rows. */
export function summarizeDedupSavings(blobs = []) {
  if (!Array.isArray(blobs)) throw new TypeError("blobs must be an array.");
  let logicalBytes = 0;
  let physicalBytes = 0;
  let sharedBlobs = 0;
  for (const blob of blobs) {
    if (!blob || !Number.isSafeInteger(blob.sizeBytes) || blob.sizeBytes < 0) {
      throw new TypeError("each blob requires a non-negative integer sizeBytes.");
    }
    const refs = Number.isSafeInteger(blob.refCount) && blob.refCount > 0 ? blob.refCount : 1;
    logicalBytes += blob.sizeBytes * refs;
    physicalBytes += blob.sizeBytes;
    if (refs > 1) sharedBlobs += 1;
  }
  return {
    logicalBytes,
    physicalBytes,
    savedBytes: Math.max(0, logicalBytes - physicalBytes),
    sharedBlobs,
    ratio: physicalBytes > 0 ? logicalBytes / physicalBytes : 1,
  };
}

/** Release decision: the last reference to a blob may reclaim its canonical physical replica. */
export function planBlobRelease({ refCount, sizeBytes }) {
  if (!Number.isSafeInteger(refCount) || refCount < 0) throw new TypeError("refCount must be a non-negative integer.");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new TypeError("sizeBytes must be a non-negative integer.");
  const remaining = Math.max(0, refCount - 1);
  return { remainingRefs: remaining, reclaimPhysicalBytes: remaining === 0 ? sizeBytes : 0 };
}
