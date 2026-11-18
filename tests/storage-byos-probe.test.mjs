import test from "node:test";
import assert from "node:assert/strict";
import { buildByosAdapterConfig, createByosAdapter, interpretProbe, isConnectionUsable } from "../src/lib/storage/byos-probe.mjs";

test("a Storj connection builds a private-only adapter config", () => {
  const config = buildByosAdapterConfig({ providerId: "storj", endpoint: "https://gateway.storjshare.io", region: "us1", bucketId: "my-bucket", pathStyle: true });
  assert.equal(config.endpoint, "https://gateway.storjshare.io");
  assert.equal(config.publicBucket, "my-bucket");
  assert.equal(config.privateBucket, "my-bucket");
  assert.equal(config.publicBaseUrl, null);
});

test("a missing or unsafe endpoint is rejected", () => {
  assert.throws(() => buildByosAdapterConfig({ providerId: "storj", endpoint: "http://insecure.example.com", region: "us1", bucketId: "b" }), /HTTPS/);
  assert.throws(() => buildByosAdapterConfig({ providerId: "google_drive", endpoint: "https://x.example.com", bucketId: "b" }), /Unsupported/);
  assert.throws(() => buildByosAdapterConfig({ providerId: "storj", endpoint: "https://x.example.com", bucketId: "Bad_Bucket" }), /bucket/);
});

test("a successful probe verifies the connection; a failure records a bounded error", () => {
  assert.deepEqual(interpretProbe({ ok: true, listedKeys: 3 }), { state: "verified", lastError: null, listedKeys: 3 });
  const failed = interpretProbe({ ok: false, error: new Error("AccessDenied") });
  assert.equal(failed.state, "failed");
  assert.equal(failed.lastError, "AccessDenied");
  const long = interpretProbe({ ok: false, error: "x".repeat(1000) });
  assert.equal(long.lastError.length, 300);
});

test("creating an adapter requires server-side secret material", () => {
  const connection = { providerId: "storj", endpoint: "https://gateway.storjshare.io", region: "us1", bucketId: "my-bucket", pathStyle: true };
  assert.throws(() => createByosAdapter(connection, null), /secret/);
  const adapter = createByosAdapter(connection, { accessKeyId: "key", secretAccessKey: "secret" });
  assert.equal(typeof adapter.listObjects, "function");
});

test("a connection is only usable when verified and backed by a secret reference", () => {
  assert.equal(isConnectionUsable({ connection_state: "verified", secret_ref: "RAYE2_BYOS_STORJ" }), true);
  assert.equal(isConnectionUsable({ connection_state: "pending", secret_ref: "RAYE2_BYOS_STORJ" }), false);
  assert.equal(isConnectionUsable({ connection_state: "verified", secret_ref: "" }), false);
  assert.equal(isConnectionUsable(null), false);
});
