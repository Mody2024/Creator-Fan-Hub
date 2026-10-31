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

test("draft GET validates stored configuration and revision before returning data", () => {
  assert.ok(draft.includes("const validation = validateSiteConfig(row.draft)"));
  assert.ok(draft.includes("!validation.ok || !Number.isSafeInteger(row.draft_revision) || row.draft_revision < 1"));
  assert.ok(draft.includes('typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at))'));
  assert.ok(draft.includes("Draft data could not be validated."));
  assert.ok(draft.includes("config: validation.value"));
});

test("draft save validates RPC confirmation before returning success", () => {
  assert.ok(draft.includes("!row || !Number.isSafeInteger(row.new_revision) || typeof row.saved_at !== \"string\""));
  assert.ok(draft.includes("Draft save could not be confirmed."));
});
test("publish validates the committed version before returning success", () => {
  assert.ok(publish.includes("!row || !Number.isSafeInteger(row.published_version) || (row.published_version as number) < 1 || typeof row.published_at !== \"string\" || !Number.isFinite(Date.parse(row.published_at))"));
  assert.ok(publish.includes("Publishing could not be confirmed."));
});
test("history restore validates restored version details before returning success", () => {
  assert.ok(history.includes("!row || !Number.isSafeInteger(row.new_revision) || (row.new_revision as number) < 1 || !Number.isSafeInteger(row.restored_version) || (row.restored_version as number) < 1 || typeof row.saved_at !== \"string\" || !Number.isFinite(Date.parse(row.saved_at))"));
  assert.ok(history.includes("Restore could not be confirmed."));
});

test("history GET validates and bounds every published version returned by the database", () => {
  assert.ok(history.includes("function isPublishHistoryRow(value: unknown): value is PublishHistoryRow"));
  assert.ok(history.includes("Number.isSafeInteger(row.version)"));
  assert.ok(history.includes("Number.isFinite(Date.parse(row.published_at))"));
  assert.ok(history.includes("data.length > 20 || !data.every(isPublishHistoryRow)"));
  assert.ok(history.includes("Publishing history data could not be validated."));
  assert.ok(history.includes("versions: data"));
});

test("creator draft, publish, and restore success responses require valid timestamps and positive versions", () => {
  assert.ok(draft.includes("!Number.isFinite(Date.parse(row.updated_at))"));
  assert.ok(publish.includes("(row.published_version as number) < 1"));
  assert.ok(publish.includes("!Number.isFinite(Date.parse(row.published_at))"));
  assert.ok(history.includes("(row.new_revision as number) < 1"));
  assert.ok(history.includes("(row.restored_version as number) < 1"));
  assert.ok(history.includes("!Number.isFinite(Date.parse(row.saved_at))"));
});

test("creator login recovers from network exceptions and always clears its busy state", async () => {
  const login = await read("../src/app/creator/login/page.tsx");
  assert.ok(login.includes("try {\n      const { error } = await supabase.auth.signInWithPassword"));
  assert.ok(login.includes("email: email.trim(), password"));
  assert.ok(login.includes("The sign-in service could not be reached."));
  assert.ok(login.includes("} finally {\n      setBusy(false);"));
});
