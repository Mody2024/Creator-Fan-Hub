import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page] = await Promise.all([
  read("../supabase/migrations/20261110150000_raye2_community_post_comment_lifecycle.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/community/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const guardedFunctions = [
  "raye2_update_community_post",
  "raye2_delete_community_post",
  "raye2_delete_community_comment",
  "raye2_set_community_post_pin"
];

test("community lifecycle RPCs are guarded SECURITY DEFINER functions", () => {
  for (const name of guardedFunctions) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
    assert.match(body, /\(select auth\.uid\(\)\)\s+is\s+null/i, name);
    assert.match(body, /errcode\s*=\s*'42501'/i, name);
  }
});

test("ownership edits and deletes are scoped to the caller's own content", () => {
  assert.match(functionBody(migration, "raye2_update_community_post"), /author_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(functionBody(migration, "raye2_delete_community_post"), /author_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(functionBody(migration, "raye2_delete_community_comment"), /author_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /you can only edit your own post/);
  assert.match(migration, /you can only delete your own post/);
  assert.match(migration, /you can only delete your own comment/);
});

test("pinning is restricted to owner/admin/moderator roles", () => {
  const body = functionBody(migration, "raye2_set_community_post_pin");
  assert.match(body, /private\.can_moderate_community\(\)/);
  assert.match(migration, /moderator access required/);
});

test("lifecycle RPCs are granted to authenticated only, never anon or public", () => {
  for (const name of guardedFunctions) {
    const grantLine = migration.match(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`, "g")) || [];
    assert.equal(grantLine.length, 1, `${name}: expected exactly one authenticated grant`);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`), name);
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|public)`), name);
  }
});

test("editing a post refreshes updated_at via a pinned-search_path trigger", () => {
  assert.match(migration, /create or replace function public\.raye2_community_posts_touch_updated_at\(\)/);
  assert.match(migration, /before update on public\.community_posts/);
  assert.match(migration, /revoke all on function public\.raye2_community_posts_touch_updated_at\(\) from public, anon, authenticated/);
});

test("the community client wires the lifecycle RPCs with owner and moderator gating", () => {
  assert.match(client, /supabase\.rpc\("raye2_update_community_post"/);
  assert.match(client, /supabase\.rpc\("raye2_delete_community_post"/);
  assert.match(client, /supabase\.rpc\("raye2_delete_community_comment"/);
  assert.match(client, /supabase\.rpc\("raye2_set_community_post_pin"/);
  assert.match(client, /member\.id===post\.authorId/);
  assert.match(client, /member && canModerate/);
  assert.match(client, /member\.id===comment\.author_id/);
});

test("the community page loads pin state and moderator status server-side", () => {
  assert.match(page, /pinned: row\.pinned/);
  assert.match(page, /creator_admins/);
  assert.match(page, /canModerate=\{canModerate\}/);
  assert.match(page, /rpc\("raye2_get_community_feed"/);
});
