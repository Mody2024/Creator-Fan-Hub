import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110450000_raye2_group_topic_threads.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("group topics are a group-scoped table readable by members only", () => {
  assert.match(migration, /create table if not exists public\.raye2_group_topics/);
  assert.match(migration, /unique \(group_id, slug\)/);
  assert.match(migration, /create policy "Raye2 group members read topics"/);
  assert.match(migration, /public\.raye2_is_group_member\(group_id\) or public\.raye2_is_group_manager\(group_id\)/);
  assert.match(migration, /revoke all on public\.raye2_group_topics from anon, authenticated/);
});

test("topic creation and deletion are manager-only with derived unique slugs", () => {
  assert.match(migration, /create or replace function public\.raye2_create_group_topic\(p_group_id uuid, p_name text\)/);
  assert.match(migration, /if not public\.raye2_is_group_manager\(p_group_id\) then/);
  assert.match(migration, /while exists \(select 1 from public\.raye2_group_topics gt where gt\.group_id = p_group_id and gt\.slug = v_slug\)/);
  assert.match(migration, /create or replace function public\.raye2_delete_group_topic\(p_topic_id uuid\)/);
  assert.match(migration, /grant execute on function public\.raye2_create_group_topic\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_create_group_topic\(uuid,text\) to anon/);
});

test("a message topic must belong to the same conversation and listing is membership-guarded", () => {
  assert.match(migration, /add column if not exists topic_id uuid/);
  assert.match(migration, /create or replace function public\.raye2_guard_message_topic\(\)/);
  assert.match(migration, /topic does not belong to this conversation/);
  assert.match(migration, /create trigger raye2_messages_guard_topic before insert or update/);
  assert.match(migration, /create or replace function public\.raye2_list_group_topics\(p_group_id uuid\)/);
  assert.match(migration, /grant execute on function public\.raye2_list_group_topics\(uuid\) to authenticated/);
});

test("the group chat client wires topic channels end to end", () => {
  assert.match(client, /rpc\("raye2_list_group_topics"/);
  assert.match(client, /rpc\("raye2_create_group_topic"/);
  assert.match(client, /rpc\("raye2_delete_group_topic"/);
  assert.match(client, /topic_id: activeTopicId \?\? null/);
  assert.match(client, /visibleMessages/);
  assert.match(client, /styles\.topicBar/);
  assert.match(client, /styles\.topicChip/);
});
