import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, form] = await Promise.all([
  read("../supabase/migrations/20261031213109_fail_closed_optional_idea_submissions.sql"),
  read("../src/app/ideas/idea-submission-form.tsx")
]);

test("display name is genuinely optional in both the public form and database RPC", () => {
  assert.ok(migration.includes("v_name text := btrim(coalesce(p_display_name, ''));"));
  assert.ok(migration.includes("if length(v_name) > 32"));
  assert.ok(!migration.includes("length(v_name) not between 1 and 32"));
  assert.ok(form.includes("Display name <span>OPTIONAL IDENTITY"));
  assert.ok(form.includes("const cleanName = displayName.trim();"));
});

test("public idea submission still validates title, body, and browser token server-side", () => {
  assert.ok(migration.includes("length(v_title) not between 4 and 100"));
  assert.ok(migration.includes("length(v_body) not between 10 and 800"));
  assert.ok(migration.includes("length(p_submission_token) < 32"));
  assert.ok(migration.includes("p_submission_token !~ '^[A-Za-z0-9_-]+$'"));
});

test("anonymous idea submission remains disabled when public config is missing or gated", () => {
  assert.ok(migration.includes("if not exists ("));
  assert.ok(migration.includes("not coalesce(c.maintenance_mode, false)"));
  assert.ok(migration.includes("coalesce((c.published #>> '{featureFlags,ideas}')::boolean, true)"));
  assert.ok(migration.includes("return query select false, 'ideas_unavailable'::text"));
});

test("idea submission rate limits remain transactionally serialized per browser token", () => {
  assert.ok(migration.includes("pg_advisory_xact_lock(hashtextextended(v_hash, 0))"));
  assert.ok(migration.includes("interval '10 minutes'"));
  assert.ok(migration.includes("interval '24 hours'"));
});
