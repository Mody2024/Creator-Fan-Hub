export type Raye2AllowanceRole = "user" | "creator" | "streamer" | "combined" | "owner";

export type Raye2StorageAllowance = {
  roleKey: Raye2AllowanceRole | string;
  monthlyBytes: number;
  maxFileBytes: number;
  periodDays: number;
  resetDay: number;
  isOverride: boolean;
};

export type Raye2ReserveDecision = {
  allowed: boolean;
  code: "ok" | "no_allowance" | "bad_size" | "file_too_large" | "allowance_reached" | "platform_full";
  message: string;
  remainingBytes?: number;
};

export const GIB: number;
export const DEFAULT_MAX_FILE_BYTES: number;
export const DEFAULT_PLATFORM_CEILING_BYTES: number;
export const DEFAULT_STORAGE_ALLOWANCES: Readonly<Record<Raye2AllowanceRole, Omit<Raye2StorageAllowance, "roleKey" | "isOverride">>>;

export function allowanceRoleForTier(tier: string): Raye2AllowanceRole;
export function resolveAllowance(roleKey: string, override?: { monthlyBytes?: number; maxFileBytes?: number } | null): Raye2StorageAllowance;
export function currentPeriodStart(now: Date, allowance: { periodDays: number; resetDay: number }): Date;
export function currentPeriodEnd(now: Date, allowance: { periodDays: number; resetDay: number }): Date;
export function canReserveWithinAllowance(input: {
  allowance: Raye2StorageAllowance | null;
  periodUsedBytes: number;
  reservedBytes?: number;
  fileBytes: number;
  platformUsedBytes?: number;
  platformCeilingBytes?: number;
}): Raye2ReserveDecision;
export function allowanceUsagePercent(usedBytes: number, monthlyBytes: number): number;
export function platformGrantCeilingBytes(allowances: Array<{ monthlyBytes: number }>): number;
