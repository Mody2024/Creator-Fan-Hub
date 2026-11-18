/**
 * Raye2 storage object delivery planner — pure logic shared by the object API route and tests.
 *
 * A community surface records a logical object. Depending on where the bytes physically live
 * (Supabase legacy bucket or a pooled S3-compatible provider) and on the object's visibility,
 * playback needs either a public URL or a short-lived signed URL. This module decides which,
 * so the route, the client and the tests agree without duplicating rules.
 */

/** Playback URLs stay short-lived: they are handed to a browser and may leak via sharing. */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 600;
export const MAX_SIGNED_URL_TTL_SECONDS = 3600;

/** Legacy Supabase buckets still hold most objects and are delivered by the Supabase client. */
const SUPABASE_BUCKETS = new Set(["creator-media-private", "creator-media-public", "raye2-community-shorts", "raye2-minis", "raye2-clips"]);

function assertString(value, name) {
  if (typeof value !== "string" || !value) throw new TypeError(`${name} is required.`);
}

/**
 * Decide how an object is delivered.
 * Returns the delivery kind, whether a signature is required, and the TTL to sign with.
 * Public objects on a provider that has a public delivery domain need no signature; everything
 * else is signed. A private object is never returned as a public URL.
 */
export function planObjectDelivery(object, { providerHasPublicBase = false, requestedTtlSeconds } = {}) {
  if (!object || typeof object !== "object") throw new TypeError("a storage object is required.");
  const visibility = object.visibility === "public" ? "public" : "private";
  const provider = object.providerId ?? object.provider_id ?? "supabase";
  assertString(provider, "providerId");
  const ttl = Number.isInteger(requestedTtlSeconds)
    ? Math.min(Math.max(requestedTtlSeconds, 60), MAX_SIGNED_URL_TTL_SECONDS)
    : DEFAULT_SIGNED_URL_TTL_SECONDS;

  const isSupabase = provider === "supabase" || SUPABASE_BUCKETS.has(object.bucketId ?? object.bucket_id);
  if (visibility === "public" && !isSupabase && providerHasPublicBase) {
    return { kind: "public_url", requiresSigning: false, ttlSeconds: 0, provider };
  }
  // Supabase public buckets are delivered through the storage client's public URL, no signing.
  if (visibility === "public" && isSupabase) {
    return { kind: "public_url", requiresSigning: false, ttlSeconds: 0, provider };
  }
  return { kind: "signed_url", requiresSigning: true, ttlSeconds: ttl, provider };
}

/**
 * Compose a delivery URL from a resolved base and object key. Kept separate from signing so the
 * pure URL shape is testable and callers cannot accidentally inject a path traversal.
 */
export function composeObjectUrl(baseUrl, objectKey) {
  assertString(baseUrl, "baseUrl");
  assertString(objectKey, "objectKey");
  if (objectKey.startsWith("/") || objectKey.includes("\\") || objectKey.split("/").some(part => !part || part === "." || part === "..")) {
    throw new TypeError("Storage object key is invalid.");
  }
  const base = new URL(baseUrl);
  base.pathname = base.pathname.replace(/\/$/, "") + "/" + objectKey.split("/").map(encodeURIComponent).join("/");
  base.search = "";
  return base.toString();
}

/** Buckets a client may reference by logical object id; used to reject unknown buckets early. */
export function isKnownManagedBucket(bucketId) {
  return typeof bucketId === "string" && SUPABASE_BUCKETS.has(bucketId);
}
