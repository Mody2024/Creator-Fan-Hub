/**
 * Resolve logical storage objects (bucket + key) to playback URLs. A single batched request to
 * /api/raye2/storage/resolve asks the server where each object lives: pooled objects come back with
 * a signed or public URL, objects still on the legacy Supabase path come back as "legacy" and are
 * resolved by the caller through the Supabase storage client. Any failure degrades to "legacy" so
 * playback never depends on the new provider being configured.
 */

export type StorageObjectRef = { bucketId: string; objectKey: string };

export type ResolvedDelivery = {
  bucketId: string;
  objectKey: string;
  kind: "public_url" | "signed_url" | "legacy" | "forbidden" | "unavailable";
  url: string | null;
};

export type LegacyResolver = (bucketId: string, objectKey: string) => string | null;

const BUCKET = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const MAX_BATCH = 100;

function validRef(ref: StorageObjectRef): boolean {
  if (!ref || typeof ref.bucketId !== "string" || !BUCKET.test(ref.bucketId)) return false;
  const key = ref.objectKey;
  if (typeof key !== "string" || key.length < 3 || key.length > 1024) return false;
  if (key.startsWith("/") || key.includes("\\") || key.includes("..")) return false;
  return key.split("/").every(part => /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part));
}

/** Split a "bucket/path/to/key" storage path into its parts, or null when malformed. */
export function splitStoragePath(path: string | null | undefined): StorageObjectRef | null {
  if (typeof path !== "string") return null;
  const slash = path.indexOf("/");
  if (slash <= 0) return null;
  const ref = { bucketId: path.slice(0, slash), objectKey: path.slice(slash + 1) };
  return validRef(ref) ? ref : null;
}

/**
 * Resolve many objects at once. `legacy` looks up an object through the Supabase storage client so
 * the returned map always holds a usable URL when one is available.
 */
export async function resolveStorageDeliveries(
  refs: StorageObjectRef[],
  legacy: LegacyResolver,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique: StorageObjectRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!validRef(ref)) continue;
    const id = ref.bucketId + "\u0000" + ref.objectKey;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(ref);
  }
  const legacyFill = (ref: StorageObjectRef) => { out.set(ref.bucketId + "\u0000" + ref.objectKey, legacy(ref.bucketId, ref.objectKey)); };

  if (unique.length === 0) return out;

  const batches: StorageObjectRef[][] = [];
  for (let index = 0; index < unique.length; index += MAX_BATCH) batches.push(unique.slice(index, index + MAX_BATCH));

  await Promise.all(batches.map(async batch => {
    let deliveries: ResolvedDelivery[] | null = null;
    try {
      const response = await fetch("/api/raye2/storage/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objects: batch.map(ref => ({ bucketId: ref.bucketId, objectKey: ref.objectKey })) }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => null) as { objects?: ResolvedDelivery[] } | null;
        deliveries = Array.isArray(data?.objects) ? data.objects : null;
      }
    } catch {
      deliveries = null;
    }

    if (!deliveries) {
      for (const ref of batch) legacyFill(ref);
      return;
    }
    const byKey = new Map(deliveries.map(delivery => [delivery.bucketId + "\u0000" + delivery.objectKey, delivery]));
    for (const ref of batch) {
      const delivery = byKey.get(ref.bucketId + "\u0000" + ref.objectKey);
      if (!delivery || delivery.kind === "legacy" || delivery.kind === "unavailable") { legacyFill(ref); continue; }
      out.set(ref.bucketId + "\u0000" + ref.objectKey, delivery.url ?? null);
    }
  }));

  return out;
}

/** Convenience: resolve one object and return its URL (or the legacy URL). */
export async function resolveStorageDelivery(ref: StorageObjectRef, legacy: LegacyResolver): Promise<string | null> {
  if (!validRef(ref)) return null;
  const resolved = await resolveStorageDeliveries([ref], legacy);
  return resolved.get(ref.bucketId + "\u0000" + ref.objectKey) ?? null;
}

