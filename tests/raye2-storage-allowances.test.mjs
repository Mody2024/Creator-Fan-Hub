import test from "node:test";
import assert from "node:assert/strict";
import {
  GIB,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_STORAGE_ALLOWANCES,
  allowanceRoleForTier,
  resolveAllowance,
  currentPeriodStart,
  currentPeriodEnd,
  canReserveWithinAllowance,
  allowanceUsagePercent,
  platformGrantCeilingBytes
} from "../src/lib/raye2/storage-allowances.mjs";

test("every role has a generous monthly allowance above the Supabase free pool", () => {
  for (const [role, plan] of Object.entries(DEFAULT_STORAGE_ALLOWANCES)) {
    assert.ok(plan.monthlyBytes >= 2 * GIB, `${role} allowance should be at least 2 GiB`);
    assert.equal(plan.maxFileBytes, DEFAULT_MAX_FILE_BYTES);
    assert.ok(plan.periodDays >= 28 && plan.resetDay >= 1 && plan.resetDay <= 28);
  }
  assert.ok(DEFAULT_STORAGE_ALLOWANCES.creator.monthlyBytes > DEFAULT_STORAGE_ALLOWANCES.user.monthlyBytes);
  assert.ok(DEFAULT_STORAGE_ALLOWANCES.streamer.monthlyBytes > DEFAULT_STORAGE_ALLOWANCES.user.monthlyBytes);
  assert.ok(DEFAULT_STORAGE_ALLOWANCES.combined.monthlyBytes > DEFAULT_STORAGE_ALLOWANCES.creator.monthlyBytes);
  assert.ok(DEFAULT_STORAGE_ALLOWANCES.owner.monthlyBytes >= DEFAULT_STORAGE_ALLOWANCES.combined.monthlyBytes);
});

test("combined is not the sum of creator and streamer", () => {
  const sum = DEFAULT_STORAGE_ALLOWANCES.creator.monthlyBytes + DEFAULT_STORAGE_ALLOWANCES.streamer.monthlyBytes;
  assert.ok(DEFAULT_STORAGE_ALLOWANCES.combined.monthlyBytes < sum);
});

test("tier mapping matches raye2_creator_tier", () => {
  assert.equal(allowanceRoleForTier("combined"), "combined");
  assert.equal(allowanceRoleForTier("creator"), "creator");
  assert.equal(allowanceRoleForTier("streamer"), "streamer");
  assert.equal(allowanceRoleForTier("none"), "user");
  assert.equal(allowanceRoleForTier("mystery"), "user");
});

test("an override wins over the role allowance and keeps the role period", () => {
  const plan = resolveAllowance("creator", { monthlyBytes: 30 * GIB, maxFileBytes: 20 * 1024 * 1024 });
  assert.equal(plan.monthlyBytes, 30 * GIB);
  assert.equal(plan.maxFileBytes, 20 * 1024 * 1024);
  assert.equal(plan.isOverride, true);
  assert.equal(plan.periodDays, DEFAULT_STORAGE_ALLOWANCES.creator.periodDays);
});

test("an unknown role falls back to the user allowance", () => {
  const plan = resolveAllowance("mystery", null);
  assert.equal(plan.roleKey, "user");
  assert.equal(plan.monthlyBytes, DEFAULT_STORAGE_ALLOWANCES.user.monthlyBytes);
});

test("period start is the most recent reset day and the period rolls over", () => {
  const allowance = { periodDays: 30, resetDay: 1 };
  const start = currentPeriodStart(new Date(Date.UTC(2026, 5, 15)), allowance);
  assert.equal(start.toISOString(), "2026-06-01T00:00:00.000Z");
  const end = currentPeriodEnd(new Date(Date.UTC(2026, 5, 15)), allowance);
  assert.equal(end.toISOString(), "2026-07-01T00:00:00.000Z");
  // Before the reset day, the period started in the previous month.
  const early = currentPeriodStart(new Date(Date.UTC(2026, 5, 1)), { periodDays: 30, resetDay: 5 });
  assert.equal(early.toISOString(), "2026-05-05T00:00:00.000Z");
});

test("a reservation within the allowance is allowed with the right remainder", () => {
  const allowance = resolveAllowance("user", null);
  const decision = canReserveWithinAllowance({ allowance, periodUsedBytes: 0, fileBytes: 10 * 1024 * 1024, platformCeilingBytes: 0 });
  assert.equal(decision.allowed, true);
  assert.equal(decision.remainingBytes, allowance.monthlyBytes - 10 * 1024 * 1024);
});

test("reservations and prior usage both count toward the allowance", () => {
  const allowance = resolveAllowance("user", null);
  const decision = canReserveWithinAllowance({ allowance, periodUsedBytes: allowance.monthlyBytes - 1, reservedBytes: 1, fileBytes: 1, platformCeilingBytes: 0 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "allowance_reached");
});

test("a file over the per-file cap is rejected first", () => {
  const allowance = resolveAllowance("owner", null);
  const decision = canReserveWithinAllowance({ allowance, periodUsedBytes: 0, fileBytes: DEFAULT_MAX_FILE_BYTES + 1, platformCeilingBytes: 0 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "file_too_large");
});

test("the platform ceiling blocks uploads even when the user has room", () => {
  const allowance = resolveAllowance("owner", null);
  const decision = canReserveWithinAllowance({
    allowance, periodUsedBytes: 0, fileBytes: 10 * 1024 * 1024,
    platformUsedBytes: 750 * 1024 * 1024, platformCeilingBytes: 750 * 1024 * 1024
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "platform_full");
});

test("usage percent is clamped and rounded, and grant ceiling is the max allowance", () => {
  assert.equal(allowanceUsagePercent(1 * GIB, 2 * GIB), 50);
  assert.equal(allowanceUsagePercent(0, 0), 0);
  assert.equal(allowanceUsagePercent(99 * GIB, 2 * GIB), 100);
  assert.equal(platformGrantCeilingBytes(Object.values(DEFAULT_STORAGE_ALLOWANCES)), DEFAULT_STORAGE_ALLOWANCES.owner.monthlyBytes);
});
