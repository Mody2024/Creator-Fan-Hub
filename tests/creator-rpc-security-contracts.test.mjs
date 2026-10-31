import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migrationPaths = [
  "../supabase/migrations/20261026000400_creator_admin_publish_functions.sql",
  "../supabase/migrations/20261026001100_creator_idea_moderation.sql",
  "../supabase/migrations/20261026001300_creator_poll_management.sql",
  "../supabase/migrations/20261026001500_creator_events_and_socials.sql",
  "../supabase/migrations/20261026001600_creator_media_library.sql",
  "../supabase/migrations/20261026001800_creator_publish_history_restore.sql",
  "../supabase/migrations/20261026001900_scope_media_metadata_to_owner.sql"
];
const migrations = (await Promise.all(migrationPaths.map(read))).join("\n");
const creatorFunctions = [
  "save_site_config_draft",
  "publish_site_config",
  "get_creator_idea_queue",
  "moderate_public_idea",
  "create_creator_poll",
  "set_creator_poll_status",
  "get_creator_events",
  "save_creator_event",
  "set_creator_event_status",
  "get_creator_social_links",
  "save_creator_social_link",
  "get_creator_media",
  "save_creator_media",
  "delete_creator_media",
  "get_creator_publish_history",
  "restore_site_config_version"
];

function functionBody(name) {
  const start = migrations.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing creator RPC: ${name}`);
  const end = migrations.indexOf("as $$", start);
  const close = migrations.indexOf("$$;", end + 5);
  assert.ok(end > start && close > end, `could not isolate SQL body for ${name}`);
  return migrations.slice(start, close + 3);
}

test("every creator SECURITY DEFINER RPC verifies an active creator inside the database", () => {
  for (const name of creatorFunctions) {
    const sql = functionBody(name);
    assert.match(sql, /security definer/i, `${name} must be SECURITY DEFINER for its guarded table operations`);
    assert.match(sql, /set search_path\s*=\s*''/i, `${name} must pin an empty search_path`);
    assert.match(sql, /auth\.uid\(\)/i, `${name} must require an authenticated identity`);
    assert.match(sql, /is_active_creator\(\)|creator_admins[\s\S]*?active\s*=\s*true/i,
      `${name} must enforce the active creator allowlist`);
  }
});

test("creator RPCs are never granted to anonymous or PUBLIC roles", () => {
  for (const name of creatorFunctions) {
    const grants = migrations.split("\n").filter(line => line.toLowerCase().includes(`function public.${name}(`));
    assert.ok(grants.some(line => /^revoke all on function/i.test(line) && /public/i.test(line) && /anon/i.test(line)),
      `${name} must revoke default PUBLIC and anon execution`);
    assert.ok(grants.some(line => /^grant execute on function/i.test(line) && /to authenticated/i.test(line)),
      `${name} must grant execution only to authenticated callers`);
    assert.ok(!grants.some(line => /^grant execute on function/i.test(line) && /to (public|anon)([,; ]|$)/i.test(line)),
      `${name} must not grant anonymous execution`);
  }
});

test("the active-creator helper itself is not publicly executable", () => {
  assert.match(migrations, /revoke all on function public\.is_active_creator\(\) from public, anon/i);
  assert.match(migrations, /grant execute on function public\.is_active_creator\(\) to authenticated/i);
});
