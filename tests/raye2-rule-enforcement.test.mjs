import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110480000_raye2_rule_enforcement_quotas.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("the rules engine exposes a guarded integer reader and activates the seeded caps", () => {
  assert.match(migration, /create or replace function public\.raye2_rule_int\(p_key text, p_default integer\)/);
  assert.match(migration, /grant execute on function public\.raye2_rule_int\(text,integer\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_rule_int\(text,integer\) to anon/);
  assert.match(migration, /set status = 'active'/);
});

test("group creation and membership are capped by active rules", () => {
  assert.match(migration, /groups\.created\.normal_user\.monthly/);
  assert.match(migration, /monthly group creation limit reached/);
  assert.match(migration, /create trigger raye2_group_members_limit before insert on public\.raye2_group_members/);
  assert.match(migration, /group member limit reached/);
});

test("group messages respect the character cap while direct messages keep the column limit", () => {
  assert.match(migration, /create trigger raye2_messages_length before insert on public\.raye2_messages/);
  assert.match(migration, /message exceeds the group character limit/);
  assert.match(migration, /if v_type = 'group' then/);
  assert.match(migration, /chat\.message\.max_characters/);
});

test("new direct conversations are capped per day", () => {
  assert.match(migration, /chat\.dm\.new_conversations\.daily/);
  assert.match(migration, /daily new conversation limit reached/);
  assert.match(migration, /create or replace function public\.raye2_create_direct_conversation\(p_other_user uuid\)/);
});

test("active rules are readable by members only", () => {
  assert.match(migration, /create or replace function public\.raye2_list_active_rules\(\)/);
  assert.match(migration, /where r\.status = 'active'/);
  assert.match(migration, /grant execute on function public\.raye2_list_active_rules\(\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_list_active_rules\(\) to anon/);
});

test("the group management modal surfaces active platform limits", () => {
  assert.match(client, /rpc\("raye2_list_active_rules"/);
  assert.match(client, /activeRules\.map/);
  assert.match(client, /limitsLabel/);
});
