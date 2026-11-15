import "server-only";

import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase()
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return createHmac("sha256", key).update(value).digest(encoding);
}

function signingKey(secret, date, region) {
  const dateKey = hmac("AWS4" + secret, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function canonicalQuery(parameters) {
  return [...parameters.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => encodeRfc3986(key) + "=" + encodeRfc3986(value))
    .join("&");
}

function timestampParts(date) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function normalizeObjectKey(key) {
  if (typeof key !== "string" || !key || key.startsWith("/") || key.includes("\\") ||
      key.split("/").some(part => !part || part === "." || part === "..") ||
      /[\u0000-\u001f\u007f]/.test(key)) {
    throw new TypeError("Storage object key is invalid.");
  }
  return key.split("/").map(encodeRfc3986).join("/");
}

function normalizeBucket(bucket) {
  if (typeof bucket !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new TypeError("Storage bucket name is invalid.");
  }
  return bucket;
}

function buildObjectUrl(config, object) {
  const bucket = normalizeBucket(object.bucket);
  const key = normalizeObjectKey(object.key);
  const url = new URL(config.endpoint);
  url.pathname = url.pathname.replace(/\/$/, "") + "/" + bucket + "/" + key;
  url.search = "";
  return url;
}

function authorizationHeaders(config, method, url, extraHeaders = {}, now = new Date()) {
  const { amzDate, shortDate } = timestampParts(now);
  const payloadHash = "UNSIGNED-PAYLOAD";
  const headers = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders,
  };
  const names = Object.keys(headers).map(name => name.toLowerCase()).sort();
  const canonicalHeaders = names.map(name => name + ":" + String(headers[name]).trim().replace(/\s+/g, " ") + "\n").join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = shortDate + "/" + config.region + "/" + SERVICE + "/aws4_request";
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(config.secretAccessKey, shortDate, config.region), stringToSign, "hex");
  return {
    ...headers,
    authorization: ALGORITHM + " Credential=" + config.accessKeyId + "/" + scope +
      ", SignedHeaders=" + signedHeaders + ", Signature=" + signature,
  };
}

function presign(config, method, object, expiresInSeconds, requiredHeaders = {}, now = new Date()) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_PRESIGN_SECONDS) {
    throw new TypeError("Signed URL expiry must be between 1 second and 7 days.");
  }
  const url = buildObjectUrl(config, object);
  const { amzDate, shortDate } = timestampParts(now);
  const scope = shortDate + "/" + config.region + "/" + SERVICE + "/aws4_request";
  const signedNames = ["host", ...Object.keys(requiredHeaders).map(name => name.toLowerCase())].sort();
  const signedHeaders = signedNames.join(";");
  const parameters = new URLSearchParams({
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": config.accessKeyId + "/" + scope,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  url.search = canonicalQuery(parameters);
  const canonicalHeaders = signedNames.map(name => {
    const value = name === "host" ? url.host : requiredHeaders[name];
    return name + ":" + String(value).trim().replace(/\s+/g, " ") + "\n";
  }).join("");
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(config.secretAccessKey, shortDate, config.region), stringToSign, "hex");
  url.searchParams.set("X-Amz-Signature", signature);
  return url;
}

function readConfig(providerId, env = process.env) {
  const prefix = providerId === "cloudflare_r2" ? "RAYE2_R2" : "RAYE2_B2";
  const accountId = env[prefix + "_ACCOUNT_ID"];
  const endpoint = env[prefix + "_ENDPOINT"] || (
    providerId === "cloudflare_r2" && accountId
      ? "https://" + accountId + ".r2.cloudflarestorage.com"
      : ""
  );
  const accessKeyId = env[prefix + "_ACCESS_KEY_ID"];
  const secretAccessKey = env[prefix + "_SECRET_ACCESS_KEY"];
  const region = env[prefix + "_REGION"] || (providerId === "cloudflare_r2" ? "auto" : "us-west-004");
  const publicBucket = env[prefix + "_PUBLIC_BUCKET"] || "";
  const privateBucket = env[prefix + "_PRIVATE_BUCKET"] || "";
  if (!endpoint || !accessKeyId || !secretAccessKey || !publicBucket || !privateBucket) return null;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(prefix + "_ENDPOINT must be a clean HTTPS S3 endpoint.");
  }
  return { endpoint: parsed.origin, accessKeyId, secretAccessKey, region, publicBucket, privateBucket };
}

function responseError(response, providerId) {
  return response.text().then(body => {
    const safeBody = body.slice(0, 500);
    throw new Error(providerId + " S3 request failed (" + response.status + "): " + safeBody);
  });
}

export function createS3CompatibleProvider(providerId, config, fetchImpl = fetch) {
  if (!["cloudflare_r2", "backblaze_b2"].includes(providerId)) {
    throw new TypeError("Only R2 and B2 S3-compatible providers are supported here.");
  }
  const bucketFor = visibility => visibility === "public" ? config.publicBucket : config.privateBucket;
  const capabilities = Object.freeze({
    resumableUploads: false,
    multipartUploads: false,
    signedDownloads: true,
    serverSideCopy: true,
    sha256Verification: false,
    publicDelivery: true,
  });

  async function request(method, object, extraHeaders = {}) {
    const url = buildObjectUrl(config, object);
    const headers = authorizationHeaders(config, method, url, extraHeaders);
    const response = await fetchImpl(url, { method, headers, redirect: "error" });
    if (!response.ok && response.status !== 404) await responseError(response, providerId);
    return response;
  }

  return Object.freeze({
    id: providerId,
    capabilities,
    async createSignedUpload(requestOptions) {
      const bucket = requestOptions.bucket || bucketFor(requestOptions.visibility);
      const headers = { "content-type": requestOptions.contentType };
      const url = presign(config, "PUT", { bucket, key: requestOptions.key }, requestOptions.expiresInSeconds, headers);
      return { url: url.toString(), headers };
    },
    async createSignedDownload(object, expiresInSeconds) {
      return presign(config, "GET", object, expiresInSeconds).toString();
    },
    async headObject(object) {
      const response = await request("HEAD", object);
      if (response.status === 404) return null;
      const length = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(length) || length < 0) throw new Error("Provider returned an invalid object size.");
      return {
        bucket: object.bucket,
        key: object.key,
        sizeBytes: length,
        contentType: response.headers.get("content-type"),
        checksumSha256: null,
        etag: response.headers.get("etag"),
      };
    },
    async copyObject(source, destination) {
      const sourcePath = "/" + normalizeBucket(source.bucket) + "/" + normalizeObjectKey(source.key);
      const response = await request("PUT", destination, { "x-amz-copy-source": sourcePath });
      const metadata = await this.headObject(destination);
      if (!metadata) throw new Error("Copied object could not be verified at its destination.");
      return metadata;
    },
    async deleteObject(object) {
      const response = await request("DELETE", object);
      if (!response.ok && response.status !== 404) await responseError(response, providerId);
    },
  });
}

export function createConfiguredStorageProviders(env = process.env, fetchImpl = fetch) {
  const providers = [];
  for (const providerId of ["cloudflare_r2", "backblaze_b2"]) {
    const config = readConfig(providerId, env);
    if (config) providers.push(createS3CompatibleProvider(providerId, config, fetchImpl));
  }
  return providers;
}

export function getStorageBucketForVisibility(config, visibility) {
  if (visibility !== "public" && visibility !== "private") throw new TypeError("Invalid object visibility.");
  return visibility === "public" ? config.publicBucket : config.privateBucket;
}
