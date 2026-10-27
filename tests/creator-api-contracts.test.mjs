import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [draft, publish, history] = await Promise.all([
  read("../src/app/api/creator/draft/route.ts"),
  read("../src/app/api/creator/publish/route.ts"),
  read("../src/app/api/creator/history/route.ts")
]);

function assertAuthBeforeBody(route, label) {
  const auth = route.indexOf("supabase.auth.getClaims()");
  const body = route.indexOf("readBoundedJson(request");
  assert.ok(auth >= 0, `${label}: missing server-side claims check`);
  assert.ok(body >= 0, `${label}: missing bounded body reader`);
  assert.ok(auth < body, `${label}: request body must not be processed before authentication`);
}

test("creator draft API authenticates before reading request bodies", () => {
  assertAuthBeforeBody(draft, "draft API");
  assert.ok(draft.includes("readBoundedJson(request, 128 * 1024)"));
  assert.ok(draft.includes("validateSiteConfig(payload.config)"));
  assert.ok(draft.includes("p_expected_revision: revision"));
  assert.ok(draft.includes('error.code === "40001" ? 409'));
});

test("publish API authenticates before reading request bodies", () => {
  assertAuthBeforeBody(publish, "publish API");
  assert.ok(publish.includes("readBoundedJson(request, 8 * 1024)"));
  assert.ok(publish.includes("Number.isSafeInteger(revision)"));
  assert.ok(publish.includes("publish_site_config"));
  assert.ok(publish.includes('error.code === "40001" ? 409'));
});

test("history restore API authenticates before reading request bodies", () => {
  assertAuthBeforeBody(history, "history API");
  assert.ok(history.includes("readBoundedJson(request, 8 * 1024)"));
  assert.ok(history.includes("Number.isSafeInteger(version)"));
  assert.ok(history.includes("restore_site_config_version"));
  assert.ok(history.includes('error.code === "P0002" ? 404'));
});

test("creator APIs map backend failures to safe messages rather than exposing raw database errors", () => {
  for (const [label, route] of [["draft", draft], ["publish", publish], ["history", history]]) {
    assert.ok(!route.includes("error: error.message"), `${label} route exposes raw database error text`);
    assert.ok(route.includes("Sign in required."));
    assert.ok(route.includes("Creator access is not enabled for this account."));
  }
});
