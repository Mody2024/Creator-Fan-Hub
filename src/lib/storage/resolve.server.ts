import type { SupabaseClient } from "@supabase/supabase-js";
import { createStorageProviderForId } from "@/lib/storage/s3-compatible-provider.mjs";
import { planObjectDelivery } from "@/lib/storage/object-delivery.mjs";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Server-side resolution of logical storage objects to playback URLs. Shared by the
 * /api/raye2/storage/resolve route and by server-rendered pages so both agree on where an object
 * lives and how it is delivered. Never throws: an object that cannot be resolved is simply absent
 * from the map, and the caller falls back to the legacy Supabase path.
 */

// Buckets whose objects may be served to anyone (published, public content).
export const PUBLIC_DELIVERY_BUCKETS = new Set(["creator-media-public", "raye2-community-shorts", "raye2-minis", "raye2-clips"]);
// Buckets that are always owner-scoped, even when the object is marked public.
export const PRIVATE_DELIVERY_BUCKETS = new Set(["creator-media-private"]);
export const RESOLVE_TTL_SECONDS = 900;

export type ResolveRef = { bucketId: string; objectKey: string };
export type ResolveKind = "public_url" | "signed_url" | "legacy" | "forbidden" | "unavailable";
export type ResolvedObject = ResolveRef & { kind: ResolveKind; url: string | null; expiresInSeconds?: number };

type Adapter = {
  capabilities: { publicDelivery: boolean };
  createSignedDownload: (object: { bucket: string; key: string }, expiresInSeconds: number) => Promise<string>;
  getPublicUrl: (object: { bucket: string; key: string }) => string;
};

function adapterFor(providerId: string): Adapter | null {
  const adapter = createStorageProviderForId(providerId);
  return adapter ? (adapter as unknown as Adapter) : null;
}

export function isResolvableBucket(bucketId: string): boolean {
  return PUBLIC_DELIVERY_BUCKETS.has(bucketId) || PRIVATE_DELIVERY_BUCKETS.has(bucketId);
}

export function isValidObjectKey(objectKey: string): boolean {
  if (objectKey.length < 3 || objectKey.length > 1024) return false;
  if (objectKey.startsWith("/") || objectKey.includes("\\") || objectKey.includes("..")) return false;
  return objectKey.split("/").every(part => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part));
}

type ResolvedRow = { bucket_id: string; object_key: string; provider_id: string; object_state: string; visibility: string; owner_id: string | null };

/** Resolve a batch of objects to delivery URLs for one viewer (null = anonymous). */
export async function resolveObjectsToUrls(
  service: SupabaseClient,
  refs: ResolveRef[],
  viewerId: string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const valid = refs.filter(ref => isResolvableBucket(ref.bucketId) && isValidObjectKey(ref.objectKey));
  if (valid.length === 0) return out;

  const { data, error } = await service.rpc("raye2_resolve_storage_objects", { p_objects: valid });
  if (error) return out;

  const byKey = new Map<string, ResolvedRow>();
  for (const row of (data ?? []) as ResolvedRow[]) byKey.set(row.bucket_id + "\u0000" + row.object_key, row);

  for (const ref of valid) {
    const row = byKey.get(ref.bucketId + "\u0000" + ref.objectKey);
    if (!row) continue;
    const isPrivate = PRIVATE_DELIVERY_BUCKETS.has(ref.bucketId) || row.visibility === "private";
    if (isPrivate && (!viewerId || row.owner_id !== viewerId)) continue;
    if (row.provider_id === "supabase") continue;
    const adapter = adapterFor(row.provider_id);
    if (!adapter) continue;
    const delivery = planObjectDelivery(
      { providerId: row.provider_id, bucketId: ref.bucketId, visibility: isPrivate ? "private" : "public" },
      { providerHasPublicBase: adapter.capabilities.publicDelivery },
    );
    try {
      const url = delivery.requiresSigning
        ? await adapter.createSignedDownload({ bucket: ref.bucketId, key: ref.objectKey }, RESOLVE_TTL_SECONDS)
        : adapter.getPublicUrl({ bucket: ref.bucketId, key: ref.objectKey });
      out.set(ref.bucketId + "\u0000" + ref.objectKey, url);
    } catch {
      // Unresolvable on the provider: the caller falls back to the Supabase path.
    }
  }
  return out;
}

/**
 * Convenience for server-rendered pages: build a "bucket\u0000key" → URL lookup over a set of
 * public objects using the service role. Returns an empty map when the service client is not
 * configured, so the page still renders with legacy Supabase URLs.
 */
export async function resolvePublicObjectUrls(refs: ResolveRef[]): Promise<Map<string, string>> {
  const service = createSupabaseServiceClient();
  if (!service) return new Map();
  return resolveObjectsToUrls(service, refs, null);
}
