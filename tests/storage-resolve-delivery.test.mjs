import test from "node:test";
import assert from "node:assert/strict";
import { resolveStorageDeliveries, splitStoragePath } from "../src/lib/storage/resolve-delivery.ts";

const key = (bucketId, objectKey) => bucketId + "\u0000" + objectKey;

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

test("splitStoragePath separates bucket from key and rejects malformed paths", () => {
  assert.deepEqual(splitStoragePath("raye2-minis/owner/file.mp4"), { bucketId: "raye2-minis", objectKey: "owner/file.mp4" });
  assert.equal(splitStoragePath("no-bucket"), null);
  assert.equal(splitStoragePath("/leading"), null);
  assert.equal(splitStoragePath("raye2-minis/../secret"), null);
  assert.equal(splitStoragePath("raye2-minis/a//b"), null);
  assert.equal(splitStoragePath(null), null);
});

test("a pooled object resolves to the server-signed URL", async () => {
  await withFetch(async (url, init) => {
    assert.equal(url, "/api/raye2/storage/resolve");
    assert.deepEqual(JSON.parse(init.body).objects, [{ bucketId: "raye2-minis", objectKey: "owner/a.mp4" }]);
    return new Response(JSON.stringify({ objects: [{ bucketId: "raye2-minis", objectKey: "owner/a.mp4", kind: "signed_url", url: "https://provider.example/signed" }] }), { status: 200 });
  }, async () => {
    const urls = await resolveStorageDeliveries([{ bucketId: "raye2-minis", objectKey: "owner/a.mp4" }], () => "legacy");
    assert.equal(urls.get(key("raye2-minis", "owner/a.mp4")), "https://provider.example/signed");
  });
});

test("a legacy object falls back to the caller's Supabase URL", async () => {
  await withFetch(async () => new Response(JSON.stringify({ objects: [{ bucketId: "raye2-clips", objectKey: "owner/b.mp4", kind: "legacy", url: null }] }), { status: 200 }), async () => {
    const urls = await resolveStorageDeliveries([{ bucketId: "raye2-clips", objectKey: "owner/b.mp4" }], (bucketId, objectKey) => "https://supabase.example/" + bucketId + "/" + objectKey);
    assert.equal(urls.get(key("raye2-clips", "owner/b.mp4")), "https://supabase.example/raye2-clips/owner/b.mp4");
  });
});

test("a failed request degrades every object to the legacy resolver", async () => {
  await withFetch(async () => { throw new Error("network down"); }, async () => {
    const urls = await resolveStorageDeliveries([
      { bucketId: "raye2-minis", objectKey: "owner/a.mp4" },
      { bucketId: "raye2-clips", objectKey: "owner/b.mp4" },
    ], (bucketId) => "legacy:" + bucketId);
    assert.equal(urls.get(key("raye2-minis", "owner/a.mp4")), "legacy:raye2-minis");
    assert.equal(urls.get(key("raye2-clips", "owner/b.mp4")), "legacy:raye2-clips");
  });
});

test("a non-OK response also degrades to legacy", async () => {
  await withFetch(async () => new Response("nope", { status: 503 }), async () => {
    const urls = await resolveStorageDeliveries([{ bucketId: "raye2-minis", objectKey: "owner/a.mp4" }], () => "legacy");
    assert.equal(urls.get(key("raye2-minis", "owner/a.mp4")), "legacy");
  });
});

test("an unavailable provider is retried through the legacy resolver", async () => {
  await withFetch(async () => new Response(JSON.stringify({ objects: [{ bucketId: "raye2-minis", objectKey: "owner/a.mp4", kind: "unavailable", url: null }] }), { status: 200 }), async () => {
    const urls = await resolveStorageDeliveries([{ bucketId: "raye2-minis", objectKey: "owner/a.mp4" }], () => "legacy");
    assert.equal(urls.get(key("raye2-minis", "owner/a.mp4")), "legacy");
  });
});

test("invalid references are dropped without a request", async () => {
  let called = false;
  await withFetch(async () => { called = true; return new Response("{}", { status: 200 }); }, async () => {
    const urls = await resolveStorageDeliveries([{ bucketId: "BAD BUCKET", objectKey: "x/y.mp4" }], () => "legacy");
    assert.equal(urls.size, 0);
    assert.equal(called, false);
  });
});

test("duplicate references are de-duplicated into one request entry", async () => {
  let seen = [];
  await withFetch(async (url, init) => {
    seen = JSON.parse(init.body).objects;
    return new Response(JSON.stringify({ objects: seen.map(o => ({ ...o, kind: "public_url", url: "https://cdn/" + o.objectKey })) }), { status: 200 });
  }, async () => {
    const urls = await resolveStorageDeliveries([
      { bucketId: "raye2-minis", objectKey: "owner/a.mp4" },
      { bucketId: "raye2-minis", objectKey: "owner/a.mp4" },
    ], () => "legacy");
    assert.equal(seen.length, 1);
    assert.equal(urls.get(key("raye2-minis", "owner/a.mp4")), "https://cdn/owner/a.mp4");
  });
});
