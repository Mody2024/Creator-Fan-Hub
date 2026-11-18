import test from "node:test";
import assert from "node:assert/strict";
import { buildMigrationIdempotencyKey, planStorageMigration } from "../src/lib/storage/migration-planner.mjs";

const destinations = [
  { providerId: "raye2-b2", capacityBytes: 1_000_000, usedBytes: 0, reservedBytes: 0, safetyReserveBytes: 0, capacityVerified: true, bucketByVisibility: { public: "pub", private: "priv" } },
];

test("only objects on a draining provider are planned to move", () => {
  const plan = planStorageMigration([
    { objectId: "a", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 100, objectState: "active" },
    { objectId: "b", providerId: "raye2-r2", assetClass: "video", visibility: "private", sizeBytes: 100, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations });
  assert.deepEqual(plan.moves.map(m => m.objectId), ["a"]);
  assert.ok(plan.skipped.some(s => s.objectId === "b" && s.reason === "not_on_a_draining_provider"));
});

test("protected asset classes are never moved automatically", () => {
  const plan = planStorageMigration([
    { objectId: "v", providerId: "supabase", assetClass: "voice_recording", visibility: "private", sizeBytes: 100, objectState: "active" },
    { objectId: "m", providerId: "supabase", assetClass: "memory", visibility: "private", sizeBytes: 100, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations });
  assert.equal(plan.moveCount, 0);
  assert.ok(plan.skipped.every(s => s.reason === "protected_asset_class"));
});

test("an object larger than the destination headroom is skipped", () => {
  const plan = planStorageMigration([
    { objectId: "big", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 5_000_000, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations });
  assert.equal(plan.moveCount, 0);
  assert.ok(plan.skipped.some(s => s.objectId === "big" && s.reason === "no_destination_capacity"));
});

test("the batch byte ceiling is respected and large objects are planned first", () => {
  const plan = planStorageMigration([
    { objectId: "small", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 100, objectState: "active" },
    { objectId: "large", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 900_000, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations, maxBatchBytes: 900_000 });
  assert.deepEqual(plan.moves.map(m => m.objectId), ["large"]);
  assert.ok(plan.skipped.some(s => s.objectId === "small" && s.reason === "batch_ceiling"));
});

test("destination headroom is consumed across multiple moves", () => {
  const plan = planStorageMigration([
    { objectId: "1", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 400_000, objectState: "active" },
    { objectId: "2", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 400_000, objectState: "active" },
    { objectId: "3", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 400_000, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations: [{ ...destinations[0], capacityBytes: 900_000 }] });
  assert.equal(plan.moveCount, 2);
  assert.equal(plan.plannedBytes, 800_000);
});

test("an unverified destination never receives objects", () => {
  const plan = planStorageMigration([
    { objectId: "a", providerId: "supabase", assetClass: "video", visibility: "private", sizeBytes: 100, objectState: "active" },
  ], { sourceProviders: ["supabase"], destinations: [{ ...destinations[0], capacityVerified: false }] });
  assert.equal(plan.moveCount, 0);
});

test("migration idempotency keys are stable and namespaced", () => {
  assert.equal(buildMigrationIdempotencyKey("obj-1", "raye2-b2"), "migrate:obj-1:raye2-b2");
  assert.throws(() => buildMigrationIdempotencyKey("", "raye2-b2"), /required/);
});
