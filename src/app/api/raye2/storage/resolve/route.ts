import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createStorageProviderForId } from "@/lib/storage/s3-compatible-provider.mjs";
import { planObjectDelivery } from "@/lib/storage/object-delivery.mjs";
import { isResolvableBucket, isValidObjectKey, PRIVATE_DELIVERY_BUCKETS, RESOLVE_TTL_SECONDS } from "@/lib/storage/resolve.server";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = RESOLVE_TTL_SECONDS;
const MAX_OBJECTS = 100;

type Adapter = {
  capabilities: { publicDelivery: boolean };
  createSignedDownload: (object: { bucket: string; key: string }, expiresInSeconds: number) => Promise<string>;
  getPublicUrl: (object: { bucket: string; key: string }) => string;
};

function adapterFor(providerId: string): Adapter | null {
  const adapter = createStorageProviderForId(providerId);
  return adapter ? (adapter as unknown as Adapter) : null;
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

function readObject(value: unknown): { bucketId: string; objectKey: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.bucketId !== "string" || !isResolvableBucket(record.bucketId)) return null;
  if (typeof record.objectKey !== "string" || !isValidObjectKey(record.objectKey)) return null;
  return { bucketId: record.bucketId, objectKey: record.objectKey };
}

/**
 * Resolve a batch of logical objects to playback URLs. Public objects are delivered to anyone;
 * private objects require the signed-in owner. Objects not found in the pooled registry are
 * returned as "legacy" so the client keeps using the Supabase storage client for them.
 */
export async function POST(request: NextRequest) {
  const service = createSupabaseServiceClient();
  if (!service) return fail("unconfigured", "Storage service is not configured.", 503);

  const parsed = await readBoundedJson(request, 32 * 1024);
  if (!parsed.ok) return fail("bad_request", parsed.error, parsed.status);
  const payload = (parsed.value ?? {}) as Record<string, unknown>;
  const rawObjects = Array.isArray(payload.objects) ? payload.objects : null;
  if (!rawObjects || rawObjects.length === 0) return fail("bad_request", "A non-empty object list is required.", 400);
  if (rawObjects.length > MAX_OBJECTS) return fail("bad_request", `At most ${MAX_OBJECTS} objects may be resolved at once.`, 400);

  const objects: Array<{ bucketId: string; objectKey: string }> = [];
  for (const value of rawObjects) {
    const object = readObject(value);
    if (!object) return fail("bad_request", "Invalid object reference.", 400);
    objects.push(object);
  }

  // A caller only needs to be authenticated to reach private objects; public delivery stays open.
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const viewerId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  const { data: resolved, error } = await service.rpc("raye2_resolve_storage_objects", { p_objects: objects });
  if (error) return fail("unavailable", "Could not resolve storage objects.", 503);

  type ResolvedRow = { bucket_id: string; object_key: string; provider_id: string; object_state: string; visibility: string; owner_id: string | null };
  const byKey = new Map<string, ResolvedRow>();
  for (const row of (resolved ?? []) as ResolvedRow[]) {
    byKey.set(row.bucket_id + "\u0000" + row.object_key, row);
  }

  const results = await Promise.all(objects.map(async object => {
    const row = byKey.get(object.bucketId + "\u0000" + object.objectKey);
    if (!row) return { ...object, kind: "legacy" as const, url: null };
    const isPrivate = PRIVATE_DELIVERY_BUCKETS.has(object.bucketId) || row.visibility === "private";
    if (isPrivate && (!viewerId || row.owner_id !== viewerId)) {
      return { ...object, kind: "forbidden" as const, url: null };
    }
    if (row.provider_id === "supabase") {
      // Still served by the legacy bucket; the client uses the Supabase storage client.
      return { ...object, kind: "legacy" as const, url: null };
    }
    const adapter = adapterFor(row.provider_id);
    if (!adapter) return { ...object, kind: "unavailable" as const, url: null };
    const delivery = planObjectDelivery(
      { providerId: row.provider_id, bucketId: object.bucketId, visibility: isPrivate ? "private" : "public" },
      { providerHasPublicBase: adapter.capabilities.publicDelivery },
    );
    try {
      if (!delivery.requiresSigning) {
        return { ...object, kind: "public_url" as const, url: adapter.getPublicUrl({ bucket: object.bucketId, key: object.objectKey }) };
      }
      const url = await adapter.createSignedDownload({ bucket: object.bucketId, key: object.objectKey }, TTL_SECONDS);
      return { ...object, kind: "signed_url" as const, url, expiresInSeconds: TTL_SECONDS };
    } catch {
      return { ...object, kind: "unavailable" as const, url: null };
    }
  }));

  return NextResponse.json({ objects: results, ttlSeconds: TTL_SECONDS });
}
