import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PoolProvider = {
  provider: string;
  providerKind: string;
  enabled: boolean;
  health: string;
  capacityVerified: boolean;
  capacityBytes: number;
  usedBytes: number;
  reservedBytes: number;
  safetyReserveBytes: number;
  maxBytes: number | null;
  bucketByVisibility: { public: string | null; private: string | null };
};

const CAPACITY_FRESH_MS = 15 * 60 * 1000;

/** Load the storage provider pool from the registry and normalize it for the routing policy. */
export async function loadStoragePool(service: SupabaseClient): Promise<PoolProvider[]> {
  const { data, error } = await service
    .from("raye2_storage_providers")
    .select("provider_id,provider_kind,enabled,health,capacity_bytes,used_bytes,reserved_bytes,safety_reserve_bytes,max_managed_bytes,capacity_verified_at,public_bucket,private_bucket");
  if (error || !Array.isArray(data)) return [];
  const freshAfter = Date.now() - CAPACITY_FRESH_MS;
  return data.map(row => ({
    provider: String(row.provider_id),
    providerKind: String(row.provider_kind ?? row.provider_id),
    enabled: row.enabled === true,
    health: String(row.health ?? "unknown"),
    capacityVerified: typeof row.capacity_verified_at === "string" && Date.parse(row.capacity_verified_at) >= freshAfter,
    capacityBytes: Number(row.capacity_bytes ?? 0),
    usedBytes: Number(row.used_bytes ?? 0),
    reservedBytes: Number(row.reserved_bytes ?? 0),
    safetyReserveBytes: Number(row.safety_reserve_bytes ?? 0),
    maxBytes: row.max_managed_bytes == null ? null : Number(row.max_managed_bytes),
    bucketByVisibility: { public: row.public_bucket ?? null, private: row.private_bucket ?? null },
  }));
}
