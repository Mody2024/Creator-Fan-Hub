/**
 * Raye2 BYOS probe planner — pure helpers plus a thin adapter builder used by the probe route.
 *
 * A contributor-supplied connection is only usable once a trusted server has actually reached the
 * bucket. This module builds an S3-compatible adapter from a stored connection descriptor plus a
 * server-side secret, and interprets the probe result. It never returns secret material.
 */

import { createS3CompatibleProvider } from "./s3-compatible-provider.mjs";

const PROVIDER_ENDPOINTS = Object.freeze({
  storj: { region: "us1" },
  backblaze_b2: { region: "us-west-004" },
  cloudflare_r2: { region: "auto" },
});

/** Build the adapter config for a stored connection. BYOS is private overflow only, so the
 * public and private bucket are the same; public delivery is deliberately not offered. */
export function buildByosAdapterConfig(connection) {
  if (!connection || typeof connection !== "object") throw new TypeError("a BYOS connection is required.");
  const { providerId, endpoint, region, bucketId, pathStyle } = connection;
  if (!PROVIDER_ENDPOINTS[providerId]) throw new TypeError("Unsupported BYOS provider.");
  if (typeof endpoint !== "string" || !/^https:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/.test(endpoint)) throw new TypeError("BYOS endpoint must be a clean HTTPS origin.");
  if (typeof bucketId !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketId)) throw new TypeError("BYOS bucket name is invalid.");
  const effectiveRegion = typeof region === "string" && /^[a-z0-9-]{2,32}$/.test(region) ? region : PROVIDER_ENDPOINTS[providerId].region;
  return {
    endpoint,
    region: effectiveRegion,
    bucketId,
    pathStyle: pathStyle !== false,
    // The adapter requires both bucket slots; contributed storage is private overflow only.
    publicBucket: bucketId,
    privateBucket: bucketId,
    publicBaseUrl: null,
  };
}

/** Create an S3-compatible adapter for a connection using a server-held secret. */
export function createByosAdapter(connection, secret, fetchImpl = fetch) {
  if (!secret || typeof secret.accessKeyId !== "string" || typeof secret.secretAccessKey !== "string") {
    throw new TypeError("BYOS secret material is required to probe a connection.");
  }
  const config = buildByosAdapterConfig(connection);
  const providerId = "byos_" + String(connection.providerId);
  return createS3CompatibleProvider(providerId, {
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: secret.accessKeyId,
    secretAccessKey: secret.secretAccessKey,
    publicBucket: config.publicBucket,
    privateBucket: config.privateBucket,
    publicBaseUrl: config.publicBaseUrl,
  }, fetchImpl);
}

/**
 * Interpret a probe result into a connection state. A successful, non-throwing probe verifies the
 * connection; any error marks it failed with a bounded, secret-free message.
 */
export function interpretProbe({ ok, error, listedKeys = 0 } = {}) {
  if (ok) {
    return { state: "verified", lastError: null, listedKeys: Number.isInteger(listedKeys) && listedKeys >= 0 ? listedKeys : 0 };
  }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "The bucket could not be reached.";
  return { state: "failed", lastError: message.slice(0, 300), listedKeys: 0 };
}

/** True when a connection is safe to route private overflow onto. */
export function isConnectionUsable(connection) {
  return Boolean(connection && connection.connection_state === "verified" && connection.secret_ref);
}
