/**
 * Raye2 BYOS (bring-your-own-storage) connector interface — pure descriptors, validation and placement
 * policy shared by the admin UI, the multipart route and tests.
 *
 * Design decisions baked in here:
 *  - Raye2 controls the connector. We do NOT integrate raw Google Drive (its ToS forbid using Drive as a
 *    backend store). Instead a user connects an S3-compatible bucket they own (Storj, Backblaze, R2, ...).
 *  - Credentials are server-only secrets; this module never stores or returns a secret value.
 *  - Contributed storage is private overflow only: public delivery assets stay on Raye2-owned providers
 *    so a contributor can never break public playback by revoking a key.
 */

export const BYOS_PROVIDERS = Object.freeze({
  storj: {
    id: "storj",
    label: "Storj (decentralized)",
    transport: "s3-compatible",
    endpointRequired: true,
    endpointExample: "https://gateway.storjshare.io",
    region: "us-east-1",
    pathStyle: true,
    capabilities: { multipartUploads: true, signedDownloads: true, serverSideCopy: true },
  },
  backblaze_b2: {
    id: "backblaze_b2",
    label: "Backblaze B2",
    transport: "s3-compatible",
    endpointRequired: true,
    endpointExample: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    pathStyle: true,
    capabilities: { multipartUploads: true, signedDownloads: true, serverSideCopy: true },
  },
  cloudflare_r2: {
    id: "cloudflare_r2",
    label: "Cloudflare R2",
    transport: "s3-compatible",
    endpointRequired: true,
    endpointExample: "https://<account>.r2.cloudflarestorage.com",
    region: "auto",
    pathStyle: true,
    capabilities: { multipartUploads: true, signedDownloads: true, serverSideCopy: true },
  },
});

/** Asset classes a contributor may host. Public delivery classes are excluded by policy. */
export const BYOS_ALLOWED_ASSET_CLASSES = Object.freeze(["video", "mini", "moment", "stream_replay", "voice_recording", "chat_attachment", "memory", "other"]);

export function describeByosProvider(providerId) {
  const descriptor = BYOS_PROVIDERS[providerId];
  if (!descriptor) throw new TypeError("Unsupported BYOS provider.");
  return descriptor;
}

function assertCleanHttps(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new TypeError(`${name} must be a clean HTTPS URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

/**
 * Validate a connection request. Returns a normalized, secret-free descriptor plus the secret fields the
 * server must read from its own environment (never echoed back).
 */
export function validateByosConnection(input) {
  if (!input || typeof input !== "object") throw new TypeError("A connection request is required.");
  const provider = describeByosProvider(input.providerId);
  if (typeof input.bucket !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket)) {
    throw new TypeError("A valid lowercase bucket name is required.");
  }
  if (typeof input.endpoint !== "string" || !input.endpoint) throw new TypeError("An endpoint is required.");
  const endpoint = assertCleanHttps(input.endpoint, "endpoint");
  const region = typeof input.region === "string" && input.region ? input.region : provider.region;
  if (!/^[a-z0-9-]{2,32}$/.test(region)) throw new TypeError("A valid region is required.");
  const secretRef = typeof input.secretRef === "string" ? input.secretRef.trim() : "";
  if (!/^[A-Z0-9_]{3,64}$/.test(secretRef)) {
    throw new TypeError("secretRef must name a server-side environment secret (A-Z, 0-9, underscore).");
  }
  return {
    providerId: provider.id,
    label: provider.label,
    transport: provider.transport,
    endpoint,
    region,
    bucket: input.bucket,
    pathStyle: provider.pathStyle,
    capabilities: provider.capabilities,
    secretRef,
    // Explicitly no secret material crosses this boundary.
    hasSecret: false,
  };
}

/** Decide whether a given asset may be placed on contributed storage. Public delivery never may. */
export function planByosPlacement({ assetClass, visibility = "private", contributorOwned = true }) {
  if (typeof assetClass !== "string") throw new TypeError("assetClass is required.");
  if (!["private", "public"].includes(visibility)) throw new TypeError("visibility must be private or public.");
  if (visibility === "public") {
    return { allowed: false, code: "public_not_allowed", reason: "Public delivery stays on Raye2-owned providers so a contributor cannot break playback." };
  }
  if (assetClass === "thumbnail") {
    return { allowed: false, code: "thumbnail_not_allowed", reason: "Thumbnails are public-delivery assets and stay on Raye2 providers." };
  }
  if (!BYOS_ALLOWED_ASSET_CLASSES.includes(assetClass)) {
    return { allowed: false, code: "class_not_allowed", reason: "This asset class is not eligible for contributed storage." };
  }
  if (!contributorOwned) {
    return { allowed: false, code: "not_contributor_owned", reason: "Contributed storage is only used for the contributor's own private overflow." };
  }
  return { allowed: true, code: "ok", reason: "Eligible for private overflow on the contributor's bucket." };
}
