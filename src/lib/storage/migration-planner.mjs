/**
 * Raye2 storage migration planner — pure logic that decides which stored objects should move off a
 * provider (typically the legacy Supabase buckets) and onto pooled S3-compatible providers.
 *
 * The planner is deliberately conservative: it only plans moves for objects that are active, that
 * live on a provider marked as draining, and that fit the destination's verified headroom. It never
 * plans a move for an object larger than the destination's remaining capacity, and it never plans
 * more bytes than a caller-supplied batch ceiling.
 */

/** Objects whose bytes must not be moved by an automated worker without owner review. */
const PROTECTED_ASSET_CLASSES = new Set(["voice_recording", "memory"]);

export const DEFAULT_MIGRATION_BATCH_BYTES = 2 * 1024 * 1024 * 1024;

function providerHeadroom(provider) {
  if (!provider || provider.capacityVerified !== true) return 0;
  const capacity = Number(provider.capacityBytes ?? 0);
  const used = Number(provider.usedBytes ?? 0);
  const reserved = Number(provider.reservedBytes ?? 0);
  const safety = Number(provider.safetyReserveBytes ?? 0);
  return Math.max(0, capacity - used - reserved - safety);
}

/**
 * Plan a migration batch.
 * @param objects   candidate objects: { objectId, providerId, assetClass, visibility, sizeBytes }
 * @param options.sourceProviders  provider ids considered draining (their objects may move)
 * @param options.destinations     destination providers with capacity fields
 * @param options.maxBatchBytes    total bytes the batch may move
 */
export function planStorageMigration(objects, { sourceProviders = [], destinations = [], maxBatchBytes = DEFAULT_MIGRATION_BATCH_BYTES } = {}) {
  if (!Array.isArray(objects)) throw new TypeError("objects must be an array.");
  if (!Array.isArray(sourceProviders) || !Array.isArray(destinations)) throw new TypeError("source and destination providers must be arrays.");
  if (!Number.isFinite(maxBatchBytes) || maxBatchBytes <= 0) throw new TypeError("maxBatchBytes must be a positive number.");
  const sources = new Set(sourceProviders);
  const headroom = new Map(destinations.map(provider => [provider.providerId ?? provider.provider, providerHeadroom(provider)]));

  const moves = [];
  const skipped = [];
  let plannedBytes = 0;
  // Largest-first keeps the number of requests low and avoids a large object being starved by many small ones.
  const ordered = [...objects].sort((a, b) => Number(b.sizeBytes ?? 0) - Number(a.sizeBytes ?? 0));

  for (const object of ordered) {
    const id = object.objectId ?? object.object_id;
    const provider = object.providerId ?? object.provider_id;
    const size = Number(object.sizeBytes ?? object.size_bytes ?? 0);
    const assetClass = object.assetClass ?? object.asset_class;
    if (!id || !sources.has(provider)) { skipped.push({ objectId: id ?? null, reason: "not_on_a_draining_provider" }); continue; }
    if (PROTECTED_ASSET_CLASSES.has(assetClass)) { skipped.push({ objectId: id, reason: "protected_asset_class" }); continue; }
    if (object.objectState && object.objectState !== "active") { skipped.push({ objectId: id, reason: "not_active" }); continue; }
    if (!Number.isSafeInteger(size) || size < 1) { skipped.push({ objectId: id, reason: "invalid_size" }); continue; }
    if (plannedBytes + size > maxBatchBytes) { skipped.push({ objectId: id, reason: "batch_ceiling" }); continue; }

    const visibility = object.visibility === "public" ? "public" : "private";
    // Pick the destination with the most headroom that can still hold this object.
    let best = null;
    for (const destination of destinations) {
      const key = destination.providerId ?? destination.provider;
      if (!key || key === provider) continue;
      const remaining = headroom.get(key) ?? 0;
      if (remaining < size) continue;
      const bucket = destination.bucketByVisibility ? destination.bucketByVisibility[visibility] : destination.bucketId;
      if (!bucket) continue;
      if (!best || remaining > (headroom.get(best.provider) ?? 0)) best = { provider: key, bucket, remaining };
    }
    if (!best) { skipped.push({ objectId: id, reason: "no_destination_capacity" }); continue; }

    headroom.set(best.provider, best.remaining - size);
    plannedBytes += size;
    moves.push({ objectId: id, fromProvider: provider, toProvider: best.provider, toBucket: best.bucket, assetClass, visibility, sizeBytes: size });
  }

  return { moves, skipped, plannedBytes, moveCount: moves.length };
}

/** A short, stable idempotency key for a single object move. */
export function buildMigrationIdempotencyKey(objectId, toProvider) {
  if (typeof objectId !== "string" || !objectId) throw new TypeError("objectId is required.");
  if (typeof toProvider !== "string" || !toProvider) throw new TypeError("toProvider is required.");
  return `migrate:${objectId}:${toProvider}`;
}
