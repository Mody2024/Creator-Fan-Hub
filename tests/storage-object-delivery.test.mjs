import test from "node:test";
import assert from "node:assert/strict";
import { composeObjectUrl, isKnownManagedBucket, planObjectDelivery, DEFAULT_SIGNED_URL_TTL_SECONDS, MAX_SIGNED_URL_TTL_SECONDS } from "../src/lib/storage/object-delivery.mjs";

test("a public object on a provider with a public domain needs no signature", () => {
  const plan = planObjectDelivery({ providerId: "raye2-r2", bucketId: "raye2-public", visibility: "public" }, { providerHasPublicBase: true });
  assert.equal(plan.kind, "public_url");
  assert.equal(plan.requiresSigning, false);
  assert.equal(plan.ttlSeconds, 0);
});

test("a public object on a provider without a public domain is still signed", () => {
  const plan = planObjectDelivery({ providerId: "raye2-r2", bucketId: "raye2-public", visibility: "public" }, { providerHasPublicBase: false });
  assert.equal(plan.kind, "signed_url");
  assert.equal(plan.requiresSigning, true);
});

test("a private object is never returned as a public URL", () => {
  const plan = planObjectDelivery({ providerId: "raye2-b2", bucketId: "raye2-private", visibility: "private" }, { providerHasPublicBase: true });
  assert.equal(plan.kind, "signed_url");
  assert.equal(plan.requiresSigning, true);
  assert.equal(plan.ttlSeconds, DEFAULT_SIGNED_URL_TTL_SECONDS);
});

test("legacy Supabase public buckets are delivered without signing", () => {
  for (const bucketId of ["creator-media-public", "raye2-community-shorts", "raye2-minis", "raye2-clips"]) {
    const plan = planObjectDelivery({ providerId: "supabase", bucketId, visibility: "public" });
    assert.equal(plan.kind, "public_url", bucketId);
    assert.equal(plan.requiresSigning, false);
  }
});

test("signed URL lifetime is clamped to a safe range", () => {
  const long = planObjectDelivery({ providerId: "p", bucketId: "b", visibility: "private" }, { requestedTtlSeconds: 999999 });
  assert.equal(long.ttlSeconds, MAX_SIGNED_URL_TTL_SECONDS);
  const short = planObjectDelivery({ providerId: "p", bucketId: "b", visibility: "private" }, { requestedTtlSeconds: 1 });
  assert.equal(short.ttlSeconds, 60);
});

test("composeObjectUrl encodes the key and rejects traversal", () => {
  assert.equal(composeObjectUrl("https://cdn.example.com", "owner id/a b.mp4"), "https://cdn.example.com/owner%20id/a%20b.mp4");
  assert.throws(() => composeObjectUrl("https://cdn.example.com", "../secret"), /invalid/);
  assert.throws(() => composeObjectUrl("https://cdn.example.com", "a//b"), /invalid/);
  assert.throws(() => composeObjectUrl("https://cdn.example.com", "a\\b"), /invalid/);
});

test("isKnownManagedBucket recognizes the managed buckets only", () => {
  assert.equal(isKnownManagedBucket("raye2-minis"), true);
  assert.equal(isKnownManagedBucket("not-a-bucket"), false);
  assert.equal(isKnownManagedBucket(null), false);
});
