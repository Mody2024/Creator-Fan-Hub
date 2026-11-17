import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredStorageProviders, createS3CompatibleProvider, getStorageBucketForVisibility } from "../src/lib/storage/s3-compatible-provider.mjs";

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  accessKeyId: "test-access",
  secretAccessKey: "test-secret",
  region: "auto",
  publicBucket: "raye2-public",
  privateBucket: "raye2-private",
};

test("creates a signed upload URL with an explicit content-type header", async () => {
  const provider = createS3CompatibleProvider("cloudflare_r2", config);
  const result = await provider.createSignedUpload({
    bucket: config.publicBucket,
    key: "users/user-1/video file.mp4",
    contentType: "video/mp4",
    expectedBytes: 1024,
    visibility: "public",
    expiresInSeconds: 600,
  });
  const url = new URL(result.url);
  assert.equal(url.protocol, "https:");
  assert.match(url.pathname, /raye2-public\/users\/user-1\/video%20file\.mp4$/);
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  assert.equal(result.headers["content-type"], "video/mp4");
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);
});

test("signed download URLs use GET and enforce expiry limits", async () => {
  const provider = createS3CompatibleProvider("backblaze_b2", config);
  const url = new URL(await provider.createSignedDownload({ bucket: config.privateBucket, key: "private/a.mp4" }, 900));
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
  await assert.rejects(() => provider.createSignedDownload({ bucket: config.privateBucket, key: "a" }, 604801), /expiry/);
});

test("rejects unsafe object keys and invalid provider instance ids", async () => {
  const provider = createS3CompatibleProvider("cloudflare_r2", config);
  await assert.rejects(() => provider.createSignedDownload({ bucket: config.privateBucket, key: "../secret" }, 60), /key is invalid/);
  assert.throws(() => createS3CompatibleProvider("Bad Id", config), /valid provider instance id/);
  assert.throws(() => createS3CompatibleProvider("", config), /valid provider instance id/);
});

test("pooled provider instances keep independent ids and advertise multipart", () => {
  const first = createS3CompatibleProvider("raye2_r2_1", config);
  const second = createS3CompatibleProvider("raye2_r2_2", config);
  assert.equal(first.id, "raye2_r2_1");
  assert.equal(second.id, "raye2_r2_2");
  assert.equal(first.capabilities.multipartUploads, true);
  assert.equal(first.capabilities.resumableUploads, true);
});

test("multipart upload initiates, presigns parts, completes and aborts", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), method: options.method, body: options.body });
    if (options.method === "POST" && url.searchParams.get("uploads") === "") {
      return new Response("<InitiateMultipartUploadResult><UploadId>upload-abc</UploadId></InitiateMultipartUploadResult>", { status: 200 });
    }
    if (options.method === "POST" && url.searchParams.get("uploadId") === "upload-abc") {
      return new Response("<CompleteMultipartUploadResult/>", { status: 200 });
    }
    return new Response(null, { status: 200 });
  };
  const provider = createS3CompatibleProvider("raye2_r2_1", config, fetchImpl);
  const started = await provider.createMultipartUpload({ bucket: config.publicBucket, key: "user/big.mp4", contentType: "video/mp4", expectedBytes: 90_000_000, visibility: "public", expiresInSeconds: 600 });
  assert.equal(started.uploadId, "upload-abc");
  const partUrl = new URL(await provider.signUploadPart({ bucket: config.publicBucket, key: "user/big.mp4", uploadId: started.uploadId, partNumber: 2, expiresInSeconds: 600 }));
  assert.equal(partUrl.searchParams.get("partNumber"), "2");
  assert.equal(partUrl.searchParams.get("uploadId"), "upload-abc");
  assert.equal(partUrl.searchParams.has("X-Amz-Signature"), true);
  const completed = await provider.completeMultipartUpload({ bucket: config.publicBucket, key: "user/big.mp4", uploadId: started.uploadId, parts: [{ partNumber: 2, etag: '"etag-2"' }, { partNumber: 1, etag: '"etag-1"' }] });
  assert.equal(completed.partCount, 2);
  assert.match(completed.body, /<PartNumber>1<\/PartNumber><ETag>"etag-1"<\/ETag>/);
  assert.match(completed.body, /<PartNumber>2<\/PartNumber><ETag>"etag-2"<\/ETag>/);
  const completionCall = calls.find(call => call.method === "POST" && call.body);
  assert.match(String(completionCall.body), /<CompleteMultipartUpload>/);
  await provider.abortMultipartUpload({ bucket: config.publicBucket, key: "user/big.mp4", uploadId: started.uploadId });
  await assert.rejects(() => provider.signUploadPart({ bucket: config.publicBucket, key: "user/big.mp4", uploadId: "u", partNumber: 0, expiresInSeconds: 600 }), /part number/);
  await assert.rejects(() => provider.completeMultipartUpload({ bucket: config.publicBucket, key: "user/big.mp4", uploadId: "u", parts: [] }), /between 1 and 10000/);
});

test("HEAD verifies metadata and returns null for a missing object", async () => {
  let status = 200;
  const provider = createS3CompatibleProvider("cloudflare_r2", config, async () => new Response(null, {
    status,
    headers: { "content-length": "2048", "content-type": "video/mp4", etag: '"etag-value"' },
  }));
  const found = await provider.headObject({ bucket: config.publicBucket, key: "user/video.mp4" });
  assert.equal(found.sizeBytes, 2048);
  assert.equal(found.contentType, "video/mp4");
  status = 404;
  assert.equal(await provider.headObject({ bucket: config.publicBucket, key: "missing.mp4" }), null);
});

test("delete and copy call the provider and copy verifies the destination", async () => {
  const calls = [];
  const provider = createS3CompatibleProvider("backblaze_b2", config, async (url, options) => {
    calls.push({ url: String(url), method: options.method, headers: options.headers });
    if (options.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": "42" } });
    return new Response(null, { status: 200 });
  });
  const copied = await provider.copyObject(
    { bucket: config.privateBucket, key: "source/file.bin" },
    { bucket: config.privateBucket, key: "destination/file.bin" },
  );
  assert.equal(copied.sizeBytes, 42);
  await provider.deleteObject({ bucket: config.privateBucket, key: "destination/file.bin" });
  assert.deepEqual(calls.map(call => call.method), ["PUT", "HEAD", "DELETE"]);
  assert.ok(calls[0].headers.authorization.includes("Signature="));
});

test("reads only fully configured server-side providers", () => {
  const env = {
    RAYE2_R2_ACCOUNT_ID: "abc123",
    RAYE2_R2_ACCESS_KEY_ID: "key",
    RAYE2_R2_SECRET_ACCESS_KEY: "secret",
    RAYE2_R2_PUBLIC_BUCKET: "raye2-public",
    RAYE2_R2_PRIVATE_BUCKET: "raye2-private",
  };
  const providers = createConfiguredStorageProviders(env);
  assert.deepEqual(providers.map(provider => provider.id), ["cloudflare_r2"]);
  assert.equal(getStorageBucketForVisibility(config, "private"), config.privateBucket);
  assert.equal(getStorageBucketForVisibility(config, "public"), config.publicBucket);
});


test("public URLs require an explicitly configured HTTPS delivery domain", () => {
  const provider = createS3CompatibleProvider("cloudflare_r2", {
    ...config,
    publicBaseUrl: "https://media.example.com",
  });
  assert.equal(provider.capabilities.publicDelivery, true);
  assert.equal(
    provider.getPublicUrl({ bucket: config.publicBucket, key: "creators/u1/video.mp4" }),
    "https://media.example.com/creators/u1/video.mp4",
  );
  assert.throws(
    () => provider.getPublicUrl({ bucket: config.privateBucket, key: "private/secret.mp4" }),
    /public delivery domain/,
  );
  const privateOnly = createS3CompatibleProvider("backblaze_b2", config);
  assert.equal(privateOnly.capabilities.publicDelivery, false);
});


test("rejects incomplete or insecure provider configuration", () => {
  assert.throws(() => createS3CompatibleProvider("cloudflare_r2", { ...config, endpoint: "http://example.com" }), /HTTPS origin/);
  assert.throws(() => createS3CompatibleProvider("cloudflare_r2", { ...config, privateBucket: "Bad_Bucket" }), /bucket name/);
  assert.throws(() => createS3CompatibleProvider("cloudflare_r2", { endpoint: config.endpoint }), /complete server-side/);
});

test("rejects invalid upload size and content type before signing", async () => {
  const provider = createS3CompatibleProvider("cloudflare_r2", config);
  await assert.rejects(() => provider.createSignedUpload({
    bucket: config.privateBucket, key: "file.mp4", contentType: "video/mp4",
    expectedBytes: 0, visibility: "private", expiresInSeconds: 60,
  }), /Upload size and content type/);
  await assert.rejects(() => provider.createSignedUpload({
    bucket: config.privateBucket, key: "file.mp4", contentType: "",
    expectedBytes: 10, visibility: "private", expiresInSeconds: 60,
  }), /Upload size and content type/);
});
