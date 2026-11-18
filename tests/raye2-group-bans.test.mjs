import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110410000_raye2_group_bans.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("bans add an authenticated ban and unban RPC and a manager-only banned list", () => {
  assert.match(migration, /create or replace function public\.raye2_ban_group_member\(p_group_id uuid, p_user_id uuid\)/);
  assert.match(migration, /create or replace function public\.raye2_unban_group_member\(p_group_id uuid, p_user_id uuid\)/);
  assert.match(migration, /create or replace function public\.raye2_get_group_bans\(p_group_id uuid, p_limit integer default 100\)/);
  assert.match(migration, /grant execute on function public\.raye2_ban_group_member\(uuid,uuid\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_ban_group_member\(uuid,uuid\) to anon/);
  assert.match(migration, /where public\.raye2_is_group_manager\(p_group_id\)/);
});

test("a ban sets the banned status and refuses owner and self targets", () => {
  assert.match(migration, /set status = 'banned', restricted_at = now\(\)/);
  assert.match(migration, /v_target_role = 'owner'/);
  assert.match(migration, /p_user_id = auth\.uid\(\)/);
  assert.match(migration, /insufficient group moderation permissions/);
});

test("ban and unban are audited and pin the search path", () => {
  assert.match(migration, /'group_member_banned'/);
  assert.match(migration, /'group_member_unbanned'/);
  assert.match(migration, /set search_path = ''/);
});

test("unbanning clears the ban so membership can resume", () => {
  assert.match(migration, /set status = 'removed', restricted_at = null/);
  assert.match(migration, /member is not banned/);
});

test("the group manager surface bans, unbans and lists banned members", () => {
  assert.match(client, /supabase\.rpc\("raye2_ban_group_member"/);
  assert.match(client, /supabase\.rpc\("raye2_unban_group_member"/);
  assert.match(client, /supabase\.rpc\("raye2_get_group_bans"/);
  assert.match(client, /bannedMembers\.map/);
  assert.match(client, /\{t\.banMember\}/);
  assert.match(client, /\{t\.unbanMember\}/);
});
