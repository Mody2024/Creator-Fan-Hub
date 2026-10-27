import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson } from "../src/lib/read-bounded-json.ts";

test("bounded JSON reader parses valid UTF-8 JSON", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision: 4, title: "Creator" })
  });

  const result = await readBoundedJson(request, 1024);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { revision: 4, title: "Creator" });
});

test("bounded JSON reader rejects malformed JSON", async () => {
  const request = new Request("https://example.test/api", { method: "POST", body: "{bad" });
  const result = await readBoundedJson(request, 1024);
  assert.deepEqual(result, { ok: false, status: 400, error: "Invalid JSON body." });
});

test("bounded JSON reader rejects malformed UTF-8", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: new Uint8Array([0xc3, 0x28]),
    headers: { "content-type": "application/json" }
  });
  const result = await readBoundedJson(request, 1024);
  assert.deepEqual(result, { ok: false, status: 400, error: "Invalid JSON body." });
});

test("bounded JSON reader rejects oversized Content-Length before reading", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-length": "4096" },
    body: "{}"
  });
  const result = await readBoundedJson(request, 16);
  assert.deepEqual(result, { ok: false, status: 413, error: "Request body is too large." });
});

test("bounded JSON reader rejects oversized streamed content without a size header", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ payload: "x".repeat(128) })));
        controller.close();
      }
    }),
    duplex: "half"
  });
  const result = await readBoundedJson(request, 32);
  assert.deepEqual(result, { ok: false, status: 413, error: "Request body is too large." });
});


test("bounded JSON reader accepts a body exactly at the byte limit", async () => {
  const body = '{"x":1}';
  const result = await readBoundedJson(new Request("https://example.test/api", {
    method: "POST",
    body
  }), new TextEncoder().encode(body).byteLength);
  assert.deepEqual(result, { ok: true, value: { x: 1 } });
});

test("bounded JSON reader enforces streamed bytes even when Content-Length understates the body", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-length": "1" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"payload":"' + "z".repeat(64) + '"}'));
        controller.close();
      }
    }),
    duplex: "half"
  });
  const result = await readBoundedJson(request, 16);
  assert.deepEqual(result, { ok: false, status: 413, error: "Request body is too large." });
});

test("bounded JSON reader rejects invalid configured byte limits", async () => {
  const request = new Request("https://example.test/api", { method: "POST", body: "{}" });
  await assert.rejects(() => readBoundedJson(request, 0), RangeError);
  await assert.rejects(() => readBoundedJson(request, Number.POSITIVE_INFINITY), RangeError);
});
