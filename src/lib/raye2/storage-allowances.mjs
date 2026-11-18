/**
 * Raye2 monthly storage allowances — pure decision logic shared by the UI and tests.
 *
 * The database is authoritative (raye2_storage_allowance_for / raye2_reserve_storage enforce every rule
 * server-side). This module mirrors the seeded rows in migration 20261116120000_raye2_storage_allowances_and_control.sql
 * so the UI can show an accurate allowance and explain a rejection before a large upload starts.
 */

export const GIB = 1024 * 1024 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_PLATFORM_CEILING_BYTES = 750 * 1024 * 1024;

/** Default monthly allowance per role tier. Keep in step with the seeded raye2_storage_allowances rows. */
export const DEFAULT_STORAGE_ALLOWANCES = Object.freeze({
  user: { monthlyBytes: 2 * GIB, maxFileBytes: DEFAULT_MAX_FILE_BYTES, periodDays: 30, resetDay: 1 },
  creator: { monthlyBytes: 8 * GIB, maxFileBytes: DEFAULT_MAX_FILE_BYTES, periodDays: 30, resetDay: 1 },
  streamer: { monthlyBytes: 8 * GIB, maxFileBytes: DEFAULT_MAX_FILE_BYTES, periodDays: 30, resetDay: 1 },
  combined: { monthlyBytes: 12 * GIB, maxFileBytes: DEFAULT_MAX_FILE_BYTES, periodDays: 30, resetDay: 1 },
  owner: { monthlyBytes: 20 * GIB, maxFileBytes: DEFAULT_MAX_FILE_BYTES, periodDays: 30, resetDay: 1 }
});

/** Map a creator tier (from raye2_creator_tier) to the allowance role key. */
export function allowanceRoleForTier(tier) {
  switch (tier) {
    case "creator": return "creator";
    case "streamer": return "streamer";
    case "combined": return "combined";
    default: return "user";
  }
}

/**
 * Resolve a role's effective allowance, letting a per-account override win.
 * @param {string} roleKey
 * @param {{monthlyBytes?:number,maxFileBytes?:number}|null} [override]
 */
export function resolveAllowance(roleKey, override) {
  const base = DEFAULT_STORAGE_ALLOWANCES[roleKey] ?? DEFAULT_STORAGE_ALLOWANCES.user;
  if (!override) return { ...base, roleKey: DEFAULT_STORAGE_ALLOWANCES[roleKey] ? roleKey : "user", isOverride: false };
  return {
    roleKey,
    monthlyBytes: Number(override.monthlyBytes ?? base.monthlyBytes),
    maxFileBytes: Number(override.maxFileBytes ?? base.maxFileBytes),
    periodDays: base.periodDays,
    resetDay: base.resetDay,
    isOverride: true
  };
}

/**
 * Start of the current allowance period for a given date, matching raye2_my_storage_status.
 * @param {Date} now
 * @param {{periodDays:number,resetDay:number}} allowance
 * @returns {Date}
 */
export function currentPeriodStart(now, allowance) {
  const resetDay = Math.min(28, Math.max(1, allowance.resetDay));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), resetDay));
  if (start > now) start.setUTCMonth(start.getUTCMonth() - 1);
  return start;
}

/** End of the current allowance period. */
export function currentPeriodEnd(now, allowance) {
  const start = currentPeriodStart(now, allowance);
  return new Date(start.getTime() + allowance.periodDays * 24 * 60 * 60 * 1000);
}

/**
 * Decide whether an upload may be reserved, returning a reason when it cannot.
 * Mirrors raye2_reserve_storage's per-file, per-user and platform checks.
 */
export function canReserveWithinAllowance({
  allowance,
  periodUsedBytes,
  reservedBytes = 0,
  fileBytes,
  platformUsedBytes = 0,
  platformCeilingBytes = DEFAULT_PLATFORM_CEILING_BYTES
}) {
  if (!allowance) return { allowed: false, code: "no_allowance", message: "No storage allowance could be resolved." };
  if (!Number.isFinite(fileBytes) || fileBytes < 1) return { allowed: false, code: "bad_size", message: "The file size is invalid." };
  if (fileBytes > allowance.maxFileBytes) {
    return { allowed: false, code: "file_too_large", message: `Files must be ${Math.floor(allowance.maxFileBytes / (1024 * 1024))} MiB or smaller.` };
  }
  const userUsed = Number(periodUsedBytes || 0) + Number(reservedBytes || 0);
  if (userUsed + fileBytes > allowance.monthlyBytes) {
    return { allowed: false, code: "allowance_reached", message: "Your monthly storage allowance is full; it resets next period." };
  }
  if (Number(platformCeilingBytes) > 0 && Number(platformUsedBytes || 0) + fileBytes > Number(platformCeilingBytes)) {
    return { allowed: false, code: "platform_full", message: "Platform storage is temporarily full; uploads resume when temporary media expires." };
  }
  return { allowed: true, code: "ok", remainingBytes: allowance.monthlyBytes - userUsed - fileBytes };
}

/** Percentage of an allowance in use, clamped to [0, 100]. */
export function allowanceUsagePercent(usedBytes, monthlyBytes) {
  if (!monthlyBytes || monthlyBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(usedBytes) / Number(monthlyBytes)) * 1000) / 10));
}

/** Total monthly allowance the platform can grant: the larger of the user allowances or the pool. */
export function platformGrantCeilingBytes(allowances) {
  return (allowances ?? []).reduce((max, a) => Math.max(max, Number(a.monthlyBytes) || 0), 0);
}
