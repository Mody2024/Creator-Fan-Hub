import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [atomic, feed, allowances, runner, stub, postchecks, pkg] = await Promise.all([
  read("../supabase/migrations/20261115193000_raye2_atomic_storage_reservations.sql"),
  read("../supabase/migrations/20261111070000_raye2_community_feed_linked_slug.sql"),
  read("../supabase/migrations/20261116120000_raye2_storage_allowances_and_control.sql"),
  read("../scripts/raye2-migration-check.mjs"),
  read("../scripts/raye2-stub-supabase.sql"),
  read("../scripts/raye2-migration-postchecks.sql"),
  read("../package.json")
]);

test("the atomic storage migration is structurally intact", () => {
  // The dollar-quote delimiter must balance, or the file cannot be applied at all.
  const delimiters = atomic.match(/^\$\$;$/gm) ?? [];
  const openers = atomic.match(/^as \$\$$/gm) ?? [];
  assert.equal(delimiters.length, openers.length, "every opened body must close");
  assert.equal(openers.length, 3, "reserve, commit and release bodies");
  // Each of the three service-only functions is defined exactly once, in order.
  const order = ["raye2_reserve_storage(", "raye2_commit_storage_object(", "raye2_release_storage_reservation("]
    .map(name => atomic.indexOf("create or replace function public." + name));
  assert.ok(order[0] < order[1] && order[1] < order[2], "functions are defined in order");
  assert.equal((atomic.match(/create or replace function public\.raye2_commit_storage_object\(/g) ?? []).length, 1);
  // The previously truncated checksum regex is closed and the stray fragment is gone.
  assert.match(atomic, /p_checksum_sha256 !~ '\^\[a-fA-F0-9\]\{64\}\$'/);
  assert.doesNotMatch(atomic, /\n\) then\n\s+raise exception 'invalid verified storage object metadata'/);
});

test("the community feed migration drops the old signature before changing the return type", () => {
  const drop = feed.indexOf("drop function if exists public.raye2_get_community_feed(integer,text,boolean,text);");
  const create = feed.indexOf("create or replace function public.raye2_get_community_feed(");
  assert.ok(drop > -1 && create > -1 && drop < create, "drop precedes redefinition");
});

test("the storage allowances RPC compares the text owner_id column correctly", () => {
  assert.match(allowances, /and o\.owner_id = p_user_id::text/);
  assert.doesNotMatch(allowances, /and o\.owner_id = p_user_id\b(?!::text)/);
});

test("the live migration check is wired into the standard gate and skips cleanly without Postgres", () => {
  const manifest = JSON.parse(pkg);
  assert.equal(manifest.scripts["check:migrations"], "node scripts/raye2-migration-check.mjs");
  assert.match(manifest.scripts.check, /validate-static-site\.mjs && node scripts\/raye2-migration-check\.mjs/);
  assert.match(runner, /Skipping the live migration check/);
  assert.match(runner, /process\.exit\(0\)/);
  assert.match(runner, /raye2-stub-supabase\.sql/);
  assert.match(runner, /raye2-migration-postchecks\.sql/);
});

test("the Supabase stub defines the roles and schemas migrations depend on", () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(stub, new RegExp(`rolname = '${role}'`));
  }
  assert.match(stub, /create or replace function auth\.uid\(\)/);
  assert.match(stub, /create or replace function auth\.jwt\(\)/);
  assert.match(stub, /owner_id text/);
  assert.match(stub, /create or replace function storage\.foldername/);
  assert.match(stub, /create or replace function realtime\.topic\(\)/);
  assert.match(stub, /pubname = 'supabase_realtime'/);
});

test("the post-checks assert the platform's core invariants", () => {
  assert.match(postchecks, /public tables without row level security/);
  assert.match(postchecks, /security definer functions without a pinned search_path/);
  assert.match(postchecks, /raye2_group_moderation_log/);
  assert.match(postchecks, /raye2_message_polls/);
  assert.match(postchecks, /storage reservation RPCs must be service-role only/);
});
