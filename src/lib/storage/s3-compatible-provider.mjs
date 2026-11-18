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

function authorizationHeaders(config, method, url, extraHeaders = {}, now = new Date(), body = "") {
  const { amzDate, shortDate } = timestampParts(now);
  const payloadHash = body ? sha256(body) : "UNSIGNED-PAYLOAD";
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

function presign(config, method, object, expiresInSeconds, requiredHeaders = {}, now = new Date(), extraQuery = {}) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_PRESIGN_SECONDS) {
    throw new TypeError("Signed URL expiry must be between 1 second and 7 days.");
  }
  const url = buildObjectUrl(config, object);
  for (const [name, value] of Object.entries(extraQuery)) {
    url.searchParams.set(name, String(value));
  }
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
  for (const [name, value] of Object.entries(extraQuery)) {
    parameters.set(name, String(value));
  }
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

// Default S3 endpoints and regions for well-known free S3-compatible providers. A provider prefix
// that names a known provider may omit _ENDPOINT/_REGION and inherit these; an explicit value always wins.
const PROVIDER_PRESETS = {
  r2: { kind: "cloudflare_r2", endpoint: accountId => accountId ? "https://" + accountId + ".r2.cloudflarestorage.com" : "", region: "auto" },
  b2: { kind: "backblaze_b2", endpoint: () => "", region: "us-west-004" },
  tigris: { kind: "tigris", endpoint: () => "https://t3.storage.dev", region: "auto" },
  filebase: { kind: "filebase", endpoint: () => "https://s3.filebase.com", region: "us-east-1" },
  storj: { kind: "storj", endpoint: () => "https://gateway.storjshare.io", region: "us-east-1" },
  wasabi: { kind: "wasabi", endpoint: () => "", region: "us-east-1" },
  idrive: { kind: "idrive_e2", endpoint: () => "", region: "us-east-1" },
  scaleway: { kind: "scaleway", endpoint: () => "", region: "fr-par" },
  linode: { kind: "linode", endpoint: () => "", region: "us-east-1" },
  aws: { kind: "aws_s3", endpoint: () => "", region: "us-east-1" },
};

// Parse an env prefix like RAYE2_B2_ACCOUNT2 into { family, account, preset }. A known preset is
// returned when the family matches one of PROVIDER_PRESETS; any other family is still accepted as
// long as it sets an explicit _ENDPOINT (readConfig drops it otherwise).
function parseProviderPrefix(prefix) {
  const match = /^RAYE2_([A-Za-z0-9]+?)(?:_([A-Za-z0-9]+))?$/.exec(prefix);
  if (!match) return null;
  const family = match[1].toLowerCase();
  return { family, account: match[2] ? match[2].toLowerCase() : null, preset: PROVIDER_PRESETS[family] ?? null };
}

function readConfig(prefix, env = process.env) {
  const parsedPrefix = parseProviderPrefix(prefix);
  if (!parsedPrefix) return null;
  const { preset } = parsedPrefix;
  const accountId = env[prefix + "_ACCOUNT_ID"];
  const endpoint = env[prefix + "_ENDPOINT"] || (preset ? preset.endpoint(accountId) : "");
  const accessKeyId = env[prefix + "_ACCESS_KEY_ID"];
  const secretAccessKey = env[prefix + "_SECRET_ACCESS_KEY"];
  const region = env[prefix + "_REGION"] || (preset ? preset.region : "us-east-1");
  const publicBucket = env[prefix + "_PUBLIC_BUCKET"] || "";
  const privateBucket = env[prefix + "_PRIVATE_BUCKET"] || "";
  const publicBaseUrl = env[prefix + "_PUBLIC_BASE_URL"] || "";
  // A known preset supplies the endpoint; an unknown family must set it explicitly.
  if (!endpoint || !accessKeyId || !secretAccessKey || !publicBucket || !privateBucket) return null;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(prefix + "_ENDPOINT must be a clean HTTPS S3 endpoint.");
  }
  let normalizedPublicBaseUrl = null;
  if (publicBaseUrl) {
    const publicUrl = new URL(publicBaseUrl);
    if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
      throw new Error(prefix + "_PUBLIC_BASE_URL must be a clean HTTPS URL.");
    }
    normalizedPublicBaseUrl = publicUrl.toString().replace(/\/$/, "");
  }
  return { endpoint: parsed.origin, accessKeyId, secretAccessKey, region, publicBucket, privateBucket, publicBaseUrl: normalizedPublicBaseUrl };
}

// Discover every configured S3-compatible instance. Each prefix ends in _ACCESS_KEY_ID:
//   RAYE2_B2_ACCESS_KEY_ID            -> instance "backblaze_b2"        (base account)
//   RAYE2_B2_ACCOUNT2_ACCESS_KEY_ID   -> instance "backblaze_b2_account2" (second account)
//   RAYE2_TIGRIS_ACCESS_KEY_ID        -> instance "tigris"
//   RAYE2_FILEBASE_HOME_ACCESS_KEY_ID -> instance "filebase_home"
// Families come from PROVIDER_PRESETS or any custom family that sets an explicit endpoint. The same
// provider can be added many times under different account suffixes.
function configuredInstancePrefixes(env = process.env) {
  const prefixes = new Set();
  for (const key of Object.keys(env)) {
    const match = /^(RAYE2_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)_ACCESS_KEY_ID$/.exec(key);
    if (!match) continue;
    if (parseProviderPrefix(match[1])) prefixes.add(match[1]);
  }
  return [...prefixes].sort();
}

function instanceIdFor(prefix) {
  const { family, account } = parseProviderPrefix(prefix) ?? {};
  const base = PROVIDER_PRESETS[family]?.kind ?? family;
  return account ? base + "_" + account : base;
}

function kindFor(prefix) {
  const { family } = parseProviderPrefix(prefix) ?? {};
  return PROVIDER_PRESETS[family]?.kind ?? family;
}

function responseError(response, providerId) {
  return response.text().then(body => {
    const safeBody = body.slice(0, 500);
    throw new Error(providerId + " S3 request failed (" + response.status + "): " + safeBody);
  });
}

export function createS3CompatibleProvider(providerId, config, fetchImpl = fetch) {
  if (typeof providerId !== "string" || !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(providerId)) {
    throw new TypeError("A valid provider instance id is required.");
  }
  if (!config || typeof config !== "object" || !config.endpoint || !config.accessKeyId ||
      !config.secretAccessKey || !config.region) {
    throw new TypeError("A complete server-side S3 provider configuration is required.");
  }
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== "/") {
    throw new TypeError("S3 provider endpoint must be an HTTPS origin.");
  }
  normalizeBucket(config.publicBucket);
  normalizeBucket(config.privateBucket);
  if (typeof fetchImpl !== "function") throw new TypeError("A valid fetch implementation is required.");
  const bucketFor = visibility => {
    if (visibility !== "public" && visibility !== "private") throw new TypeError("Invalid object visibility.");
    return visibility === "public" ? config.publicBucket : config.privateBucket;
  };
  const capabilities = Object.freeze({
    resumableUploads: true,
    multipartUploads: true,
    signedDownloads: true,
    serverSideCopy: true,
    sha256Verification: true,
    publicDelivery: Boolean(config.publicBaseUrl),
  });

  async function request(method, object, extraHeaders = {}, extraQuery = {}, body = "") {
    const url = buildObjectUrl(config, object);
    for (const [name, value] of Object.entries(extraQuery)) {
      url.searchParams.set(name, String(value));
    }
    const headers = authorizationHeaders(config, method, url, extraHeaders, new Date(), body);
    const response = await fetchImpl(url, { method, headers, body: body || undefined, redirect: "error" });
    if (!response.ok && response.status !== 404) await responseError(response, providerId);
    return response;
  }

  const normalizeUploadId = value => {
    if (typeof value !== "string" || value.length < 1 || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new TypeError("Multipart upload id is invalid.");
    }
    return value;
  };
  const normalizePartNumber = value => {
    if (!Number.isInteger(value) || value < 1 || value > 10000) {
      throw new TypeError("Multipart part number must be between 1 and 10000.");
    }
    return value;
  };
  const normalizeUploadRequest = requestOptions => {
    if (!requestOptions || !Number.isSafeInteger(requestOptions.expectedBytes) ||
        requestOptions.expectedBytes < 1 || typeof requestOptions.contentType !== "string" ||
        requestOptions.contentType.length < 3 || requestOptions.contentType.length > 128) {
      throw new TypeError("Upload size and content type must be valid.");
    }
    const bucket = requestOptions.bucket || bucketFor(requestOptions.visibility);
    normalizeBucket(bucket);
    return bucket;
  };

  return Object.freeze({
    id: providerId,
    // Bucket names are configuration (not secrets); the admin discovery surface records them so the
    // registry knows where a provider stores public and private objects.
    publicBucket: config.publicBucket,
    privateBucket: config.privateBucket,
    capabilities,
    async createSignedUpload(requestOptions) {
      const bucket = normalizeUploadRequest(requestOptions);
      const headers = { "content-type": requestOptions.contentType };
      const url = presign(config, "PUT", { bucket, key: requestOptions.key }, requestOptions.expiresInSeconds, headers);
      return { url: url.toString(), headers };
    },
    // Begin an S3 multipart upload. Small files still use createSignedUpload.
    async createMultipartUpload(requestOptions) {
      const bucket = normalizeUploadRequest(requestOptions);
      const response = await request("POST", { bucket, key: requestOptions.key }, { "content-type": requestOptions.contentType }, { uploads: "" });
      const body = await response.text();
      const match = /<UploadId>([^<]+)<\/UploadId>/.exec(body);
      if (!match) throw new Error(providerId + " did not return a multipart upload id.");
      return { uploadId: normalizeUploadId(match[1]), bucket, key: requestOptions.key };
    },
    async signUploadPart({ bucket, key, uploadId, partNumber, expiresInSeconds }) {
      normalizeBucket(bucket);
      const id = normalizeUploadId(uploadId);
      const part = normalizePartNumber(partNumber);
      const url = presign(config, "PUT", { bucket, key }, expiresInSeconds, {}, new Date(), {
        partNumber: String(part),
        uploadId: id,
      });
      return url.toString();
    },
    // Complete the multipart upload with the collected ETags.
    async completeMultipartUpload({ bucket, key, uploadId, parts }) {
      normalizeBucket(bucket);
      const id = normalizeUploadId(uploadId);
      if (!Array.isArray(parts) || parts.length < 1 || parts.length > 10000) {
        throw new TypeError("Multipart completion requires between 1 and 10000 parts.");
      }
      const ordered = parts
        .map(part => ({ partNumber: normalizePartNumber(part.partNumber), etag: String(part.etag || "").replace(/"/g, "") }))
        .sort((a, b) => a.partNumber - b.partNumber);
      if (ordered.some(part => !part.etag || /[\u0000-\u001f\u007f<>&]/.test(part.etag))) {
        throw new TypeError("Multipart part ETags are invalid.");
      }
      const body = "<CompleteMultipartUpload>" + ordered
        .map(part => "<Part><PartNumber>" + part.partNumber + "</PartNumber><ETag>\"" + part.etag + "\"</ETag></Part>")
        .join("") + "</CompleteMultipartUpload>";
      const response = await request("POST", { bucket, key }, { "content-type": "application/xml" }, { uploadId: id }, body);
      if (!response.ok) await responseError(response, providerId);
      return { bucket, key, partCount: ordered.length, body };
    },
    async abortMultipartUpload({ bucket, key, uploadId }) {
      normalizeBucket(bucket);
      const id = normalizeUploadId(uploadId);
      const response = await request("DELETE", { bucket, key }, {}, { uploadId: id });
      if (!response.ok && response.status !== 404) await responseError(response, providerId);
    },
    // List object keys and sizes for capacity reconciliation. Paginates via continuation tokens.
    async listObjects({ bucket, prefix = "", maxKeys = 1000, continuationToken = null } = {}) {
      normalizeBucket(bucket);
      if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000) {
        throw new TypeError("maxKeys must be between 1 and 1000.");
      }
      const url = new URL(config.endpoint);
      url.pathname = url.pathname.replace(/\/$/, "") + "/" + bucket;
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", String(maxKeys));
      if (prefix) url.searchParams.set("prefix", prefix);
      if (continuationToken) url.searchParams.set("continuation-token", continuationToken);
      // Sign the exact canonical query string that will be sent to the provider.
      const headers = authorizationHeaders(config, "GET", url);
      const response = await fetchImpl(url.toString(), { method: "GET", headers, redirect: "error" });
      if (!response.ok) await responseError(response, providerId);
      const body = await response.text();
      const objects = [...body.matchAll(/<Contents>[\s\S]*?<Key>([^<]*)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)]
        .map(match => ({ key: match[1], sizeBytes: Number(match[2]) }));
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(body);
      const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(body);
      return { objects, isTruncated: truncated, nextContinuationToken: truncated && token ? token[1] : null };
    },
    async createSignedDownload(object, expiresInSeconds) {
      return presign(config, "GET", object, expiresInSeconds).toString();
    },
    getPublicUrl(object) {
      if (!config.publicBaseUrl || object.bucket !== config.publicBucket) {
        throw new Error("A public delivery domain is not configured for this object.");
      }
      const base = new URL(config.publicBaseUrl + "/");
      base.pathname = base.pathname.replace(/\/$/, "") + "/" + normalizeObjectKey(object.key);
      return base.toString();
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
      await request("PUT", destination, { "x-amz-copy-source": sourcePath });
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
  for (const prefix of configuredInstancePrefixes(env)) {
    const config = readConfig(prefix, env);
    if (!config) continue;
    const provider = createS3CompatibleProvider(instanceIdFor(prefix), config, fetchImpl);
    providers.push({ ...provider, providerKind: kindFor(prefix) });
  }
  return providers;
}

/** Build the adapter for one pooled instance id, or null when it is not configured in this environment. */
export function createStorageProviderForId(providerId, env = process.env, fetchImpl = fetch) {
  for (const prefix of configuredInstancePrefixes(env)) {
    if (instanceIdFor(prefix) !== providerId) continue;
    const config = readConfig(prefix, env);
    if (!config) return null;
    const provider = createS3CompatibleProvider(providerId, config, fetchImpl);
    return { ...provider, providerKind: kindFor(prefix) };
  }
  return null;
}

export function getStorageBucketForVisibility(config, visibility) {
  if (visibility !== "public" && visibility !== "private") throw new TypeError("Invalid object visibility.");
  return visibility === "public" ? config.publicBucket : config.privateBucket;
}
