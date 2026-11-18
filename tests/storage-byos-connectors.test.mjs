import test from "node:test";
import assert from "node:assert/strict";
import {
  BYOS_ALLOWED_ASSET_CLASSES,
  describeByosProvider,
  planByosPlacement,
  validateByosConnection,
} from "../src/lib/storage/byos-connectors.mjs";

test("Storj is the first supported connector and is S3-compatible", () => {
  const storj = describeByosProvider("storj");
  assert.equal(storj.transport, "s3-compatible");
  assert.equal(storj.pathStyle, true);
  assert.equal(storj.capabilities.multipartUploads, true);
  assert.throws(() => describeByosProvider("google_drive"), /Unsupported BYOS provider/);
});

test("a connection request is normalized and never carries a secret", () => {
  const descriptor = validateByosConnection({
    providerId: "storj",
    bucket: "fan-media-bucket",
    endpoint: "https://gateway.storjshare.io/",
    secretRef: "RAYE2_STORJ_FAN_ACCESS_KEY",
  });
  assert.equal(descriptor.endpoint, "https://gateway.storjshare.io");
  assert.equal(descriptor.hasSecret, false);
  assert.equal(descriptor.secretRef, "RAYE2_STORJ_FAN_ACCESS_KEY");
  assert.equal("accessKeyId" in descriptor, false);
  assert.equal("secretAccessKey" in descriptor, false);
});

test("connection validation rejects insecure endpoints and bad buckets", () => {
  assert.throws(() => validateByosConnection({ providerId: "storj", bucket: "Ok_Bucket", endpoint: "https://gateway.storjshare.io", secretRef: "X" }), /bucket name/);
  assert.throws(() => validateByosConnection({ providerId: "storj", bucket: "good-bucket", endpoint: "http://gateway.storjshare.io", secretRef: "X" }), /HTTPS/);
  assert.throws(() => validateByosConnection({ providerId: "storj", bucket: "good-bucket", endpoint: "https://user:pass@gateway.storjshare.io", secretRef: "X" }), /clean HTTPS/);
  assert.throws(() => validateByosConnection({ providerId: "storj", bucket: "good-bucket", endpoint: "https://gateway.storjshare.io", secretRef: "not a ref!" }), /secretRef/);
});

test("contributed storage is private overflow only", () => {
  assert.equal(planByosPlacement({ assetClass: "video", visibility: "private" }).allowed, true);
  assert.equal(planByosPlacement({ assetClass: "video", visibility: "public" }).code, "public_not_allowed");
  assert.equal(planByosPlacement({ assetClass: "thumbnail", visibility: "private" }).code, "thumbnail_not_allowed");
  assert.equal(planByosPlacement({ assetClass: "video", visibility: "private", contributorOwned: false }).code, "not_contributor_owned");
  assert.equal(planByosPlacement({ assetClass: "unknown", visibility: "private" }).code, "class_not_allowed");
});

test("the allowed asset classes exclude public delivery assets", () => {
  assert.ok(BYOS_ALLOWED_ASSET_CLASSES.includes("video"));
  assert.ok(!BYOS_ALLOWED_ASSET_CLASSES.includes("thumbnail"));
});
