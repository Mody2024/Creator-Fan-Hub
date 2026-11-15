import test from "node:test";
import assert from "node:assert/strict";
import {
  assertUserQuotaAvailable,
  buildStorageReservationKey,
  selectStorageProvider,
  StorageCapacityError,
} from "../src/lib/storage/provider-policy.mjs";

const providers = [
  { provider: "cloudflare_r2", enabled: true, health: "healthy", capacityVerified: true, capacityBytes: 10_000, usedBytes: 2_000, reservedBytes: 1_000, safetyReserveBytes: 500, maxBytes: 8_500, bucketByVisibility: { public: "raye2-public", private: "raye2-private" } },
  { provider: "backblaze_b2", enabled: true, health: "healthy", capacityVerified: true, capacityBytes: 10_000, usedBytes: 1_000, reservedBytes: 0, safetyReserveBytes: 500, maxBytes: 8_500, bucketByVisibility: { public: "raye2-public-b2", private: "raye2-private-b2" } },
  { provider: "supabase", enabled: true, health: "healthy", capacityVerified: true, capacityBytes: 5_000, usedBytes: 1_000, reservedBytes: 0, safetyReserveBytes: 500 },
];

test("public videos prefer R2 and select its configured public bucket", () => {
  const selected = selectStorageProvider({ assetClass: "video", visibility: "public", expectedBytes: 1_000, providers });
  assert.equal(selected.provider, "cloudflare_r2");
  assert.equal(selected.bucket, "raye2-public");
});

test("private chat attachments prefer B2", () => {
  const selected = selectStorageProvider({ assetClass: "chat_attachment", visibility: "private", expectedBytes: 1_000, providers });
  assert.equal(selected.provider, "backblaze_b2");
  assert.equal(selected.bucket, "raye2-private-b2");
});

test("provider failover chooses B2 when R2 has insufficient safe headroom", () => {
  const selected = selectStorageProvider({ assetClass: "video", visibility: "public", expectedBytes: 5_000, providers });
  assert.equal(selected.provider, "backblaze_b2");
});

test("unverified or unhealthy providers are never selected", () => {
  const unsafe = providers.map(item => ({ ...item, capacityVerified: false }));
  assert.throws(() => selectStorageProvider({ assetClass: "video", visibility: "public", expectedBytes: 1, providers: unsafe }), StorageCapacityError);
});

test("provider ceilings include reservations and safety reserves", () => {
  const selected = selectStorageProvider({ assetClass: "video", visibility: "public", expectedBytes: 5_000, providers });
  assert.equal(selected.provider, "backblaze_b2");
  assert.ok(selected.safeRemainingBytes >= 5_000);
});

test("user quotas are lifetime allocations, not monthly resets", () => {
  assert.deepEqual(assertUserQuotaAvailable({ usedBytes: 100, reservedBytes: 50, quotaBytes: 500, expectedBytes: 200 }), {
    availableBytes: 350,
    remainingAfterReservationBytes: 150,
  });
  assert.throws(
    () => assertUserQuotaAvailable({ usedBytes: 300, reservedBytes: 100, quotaBytes: 500, expectedBytes: 101 }),
    error => error.code === "RAYE2_USER_QUOTA_EXCEEDED" && error.availableBytes === 100,
  );
});

test("reservation idempotency keys reject unsafe identifiers", () => {
  assert.equal(buildStorageReservationKey({ userId: "user_1", assetId: "media_1", attemptId: "attempt_1" }), "raye2-storage:user_1:media_1:attempt_1");
  assert.throws(() => buildStorageReservationKey({ userId: "../admin", assetId: "media_1", attemptId: "attempt_1" }), TypeError);
});


test("unsupported visibility and asset classes fail closed", () => {
  assert.throws(() => selectStorageProvider({ assetClass: "video", visibility: "unlisted", expectedBytes: 1, providers }), TypeError);
  assert.throws(() => selectStorageProvider({ assetClass: "unknown", visibility: "private", expectedBytes: 1, providers }), TypeError);
});

test("duplicate provider capacity rows are rejected rather than ambiguously routed", () => {
  assert.throws(() => selectStorageProvider({
    assetClass: "video",
    visibility: "public",
    expectedBytes: 1,
    providers: [providers[0], providers[0]],
  }), TypeError);
});

test("unknown or malformed capacity never becomes free headroom", () => {
  const malformed = [{ ...providers[0], usedBytes: Number.NaN }];
  assert.throws(
    () => selectStorageProvider({ assetClass: "video", visibility: "public", expectedBytes: 1, providers: malformed }),
    StorageCapacityError,
  );
});
