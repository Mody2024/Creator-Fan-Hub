import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261116230000_raye2_group_profile_and_moderation_log.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("group profile editing is manager-only and validated", () => {
  assert.match(migration, /create or replace function public\.raye2_update_group_profile\(/);
  assert.match(migration, /if auth\.uid\(\) is null or not public\.raye2_is_group_manager\(p_group_id\) then/);
  assert.match(migration, /raise exception 'group manager permission required' using errcode='42501'/);
  assert.match(migration, /group description must be at most 1000 characters/);
  assert.match(migration, /group rules must be at most 3000 characters/);
  assert.match(migration, /group image must be an https URL/);
  assert.match(migration, /at most 12 group topics are allowed/);
  assert.match(migration, /revoke all on function public\.raye2_update_group_profile\(uuid,text,text,text,text\[\]\) from public, anon/);
});

test("the moderation log is manager-readable only and RLS locked", () => {
  assert.match(migration, /create table if not exists public\.raye2_group_moderation_log \(/);
  assert.match(migration, /revoke all on public\.raye2_group_moderation_log from anon, authenticated/);
  assert.match(migration, /create policy "Raye2 group managers read the moderation log" on public\.raye2_group_moderation_log for select to authenticated/);
  assert.match(migration, /using \(public\.raye2_is_group_manager\(group_id\)\)/);
  assert.match(migration, /create or replace function public\.raye2_list_group_moderation_log\(p_group_id uuid, p_limit integer default 60\)/);
  assert.match(migration, /limit greatest\(1, least\(coalesce\(p_limit,60\), 200\)\)/);
});

test("moderation is captured by triggers for membership and group changes", () => {
  assert.match(migration, /create or replace function public\.raye2_log_group_moderation\(\)/);
  assert.match(migration, /create trigger raye2_group_members_moderation after insert or update or delete on public\.raye2_group_members/);
  assert.match(migration, /create trigger raye2_groups_moderation after update on public\.raye2_groups/);
  assert.match(migration, /v_action := 'member_added'/);
  assert.match(migration, /v_action := 'role_changed'/);
  assert.match(migration, /v_action := 'ownership_transferred'/);
  assert.match(migration, /v_action := 'group_status_changed'/);
});

test("the client edits the group profile and shows the moderation log", () => {
  assert.match(client, /rpc\("raye2_update_group_profile", \{/);
  assert.match(client, /rpc\("raye2_list_group_moderation_log", \{ p_group_id: selectedGroup\.id, p_limit: 60 \}\)/);
  assert.match(client, /className=\{styles\.moderationLog\}|t\.moderationLog/);
  assert.match(client, /slow_mode_seconds,rules,image_url,topics/);
  assert.match(client, /function moderationLabel\(action: string\)/);
});
