import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createStorageProviderForId } from "@/lib/storage/s3-compatible-provider.mjs";
import { buildMigrationIdempotencyKey, planStorageMigration } from "@/lib/storage/migration-planner.mjs";
import { loadStoragePool } from "@/lib/storage/provider-registry.server";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_OBJECTS = 500;

type Adapter = {
  copyObject: (source: { bucket: string; key: string }, destination: { bucket: string; key: string }) => Promise<unknown>;
  deleteObject: (object: { bucket: string; key: string }) => Promise<void>;
};

function adapterFor(providerId: string): Adapter | null {
  const adapter = createStorageProviderForId(providerId);
  return adapter ? (adapter as unknown as Adapter) : null;
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Migrate active objects off draining providers onto pooled destinations. Admin-only. The route
 * copies each object server-side, repoints its registry row, then deletes the old copy — so a failed
 * delete leaves the object intact at the destination, never lost.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("unconfigured", "Storage service is not configured.", 503);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const actorId = claims?.claims?.sub;
  if (claimsError || typeof actorId !== "string") return fail("unauthenticated", "Sign in required.", 401);
  const { data: isAdmin } = await supabase.rpc("raye2_is_platform_admin");
  if (isAdmin !== true) return fail("forbidden", "Platform administrator required.", 403);

  const service = createSupabaseServiceClient();
  if (!service) return fail("unconfigured", "Storage service is not configured.", 503);

  const parsed = await readBoundedJson(request, 8 * 1024);
  if (!parsed.ok) return fail("bad_request", parsed.error, parsed.status);
  const payload = (parsed.value ?? {}) as Record<string, unknown>;

  const sourceProviders = Array.isArray(payload.sourceProviders)
    ? payload.sourceProviders.filter((value): value is string => typeof value === "string")
    : [];
  if (!sourceProviders.length) return fail("bad_request", "At least one source provider is required.", 400);

  const { data: candidates, error: listError } = await service.rpc("raye2_list_draining_objects", { p_source_providers: sourceProviders, p_limit: MAX_OBJECTS });
  if (listError) return fail("unavailable", "Could not list objects to migrate.", 503);
  const objects = Array.isArray(candidates) ? candidates : [];

  const pool = await loadStoragePool(service);
  const destinations = pool.map(provider => ({
    providerId: provider.provider,
    capacityBytes: provider.capacityBytes,
    usedBytes: provider.usedBytes,
    reservedBytes: provider.reservedBytes,
    safetyReserveBytes: provider.safetyReserveBytes,
    capacityVerified: provider.capacityVerified,
    bucketByVisibility: provider.bucketByVisibility,
  }));

  const plan = (planStorageMigration as unknown as (objects: unknown[], options: unknown) => { moves: Array<{ objectId: string; fromProvider: string; toProvider: string; toBucket: string; assetClass: string; visibility: string; sizeBytes: number }>; skipped: Array<{ objectId: string | null; reason: string }>; plannedBytes: number; moveCount: number })(
    objects.map(row => ({ objectId: row.object_id, providerId: row.provider_id, assetClass: row.asset_class, visibility: row.visibility, sizeBytes: row.size_bytes, objectState: "active" })),
    { sourceProviders, destinations },
  );

  const migrated: string[] = [];
  const failed: Array<{ objectId: string; reason: string }> = [];
  for (const move of plan.moves) {
    const fromAdapter = adapterFor(move.fromProvider);
    const toAdapter = adapterFor(move.toProvider);
    const source = objects.find(row => row.object_id === move.objectId);
    if (!fromAdapter || !toAdapter || !source) { failed.push({ objectId: move.objectId, reason: "adapter_unavailable" }); continue; }
    const idempotencyKey = buildMigrationIdempotencyKey(move.objectId, move.toProvider);
    const { data: migrationId, error: beginError } = await service.rpc("raye2_begin_object_migration", {
      p_object_id: move.objectId, p_to_provider_id: move.toProvider, p_to_bucket_id: move.toBucket, p_idempotency_key: idempotencyKey,
    });
    if (beginError || typeof migrationId !== "string") { failed.push({ objectId: move.objectId, reason: "begin_failed" }); continue; }
    try {
      await toAdapter.copyObject({ bucket: source.bucket_id, key: source.object_key }, { bucket: move.toBucket, key: source.object_key });
      await service.rpc("raye2_complete_object_migration", { p_migration_id: migrationId, p_new_object_key: source.object_key, p_migration_state: "copied" });
      await fromAdapter.deleteObject({ bucket: source.bucket_id, key: source.object_key }).catch(() => {});
      await service.rpc("raye2_complete_object_migration", { p_migration_id: migrationId, p_new_object_key: source.object_key, p_migration_state: "committed" });
      migrated.push(move.objectId);
    } catch {
      await service.rpc("raye2_complete_object_migration", { p_migration_id: migrationId, p_new_object_key: null, p_migration_state: "failed" });
      failed.push({ objectId: move.objectId, reason: "copy_failed" });
    }
  }

  return NextResponse.json({ planned: plan.moveCount, migrated: migrated.length, skipped: plan.skipped.length, failed });
}
