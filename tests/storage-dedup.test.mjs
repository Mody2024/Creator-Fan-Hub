import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBlobKey,
  normalizeSha256,
  planBlobRelease,
  planDedup,
  summarizeDedupSavings,
} from "../src/lib/storage/dedup.mjs";

const DIGEST = "a".repeat(64);
const OTHER = "b".repeat(64);

test("sha256 digests are canonicalized to lowercase and validated", () => {
  assert.equal(normalizeSha256("  " + DIGEST.toUpperCase() + "  "), DIGEST);
  assert.equal(buildBlobKey(DIGEST), "sha256:" + DIGEST);
  assert.throws(() => normalizeSha256("xyz"), TypeError);
  assert.throws(() => normalizeSha256(null), TypeError);
});

test("a first upload of a digest is stored physically and charged fully", () => {
  const plan = planDedup({ digest: DIGEST, sizeBytes: 4_000_000, knownBlobs: [] });
  assert.deepEqual(plan, { deduplicated: false, sha256: DIGEST, chargedBytes: 4_000_000, canonicalProviderId: null, canonicalObjectKey: null });
});

test("a repeated digest is deduplicated and charges no new bytes", () => {
  const plan = planDedup({
    digest: DIGEST,
    sizeBytes: 4_000_000,
    knownBlobs: [{ sha256: DIGEST, canonicalProviderId: "raye2_r2_1", canonicalObjectKey: "users/u1/video.mp4" }],
  });
  assert.equal(plan.deduplicated, true);
  assert.equal(plan.chargedBytes, 0);
  assert.equal(plan.canonicalProviderId, "raye2_r2_1");
  assert.equal(plan.canonicalObjectKey, "users/u1/video.mp4");
});

test("a different digest is not confused with a known one", () => {
  const plan = planDedup({ digest: OTHER, sizeBytes: 100, knownBlobs: [{ sha256: DIGEST }] });
  assert.equal(plan.deduplicated, false);
  assert.equal(plan.chargedBytes, 100);
});

test("dedup savings report logical vs physical bytes and the ratio", () => {
  const savings = summarizeDedupSavings([
    { sha256: DIGEST, sizeBytes: 1_000, refCount: 4 },
    { sha256: OTHER, sizeBytes: 2_000, refCount: 1 },
  ]);
  assert.equal(savings.logicalBytes, 6_000);
  assert.equal(savings.physicalBytes, 3_000);
  assert.equal(savings.savedBytes, 3_000);
  assert.equal(savings.sharedBlobs, 1);
  assert.equal(savings.ratio, 2);
});

test("the last reference to a blob may reclaim its physical replica", () => {
  assert.deepEqual(planBlobRelease({ refCount: 3, sizeBytes: 1_000 }), { remainingRefs: 2, reclaimPhysicalBytes: 0 });
  assert.deepEqual(planBlobRelease({ refCount: 1, sizeBytes: 1_000 }), { remainingRefs: 0, reclaimPhysicalBytes: 1_000 });
});
