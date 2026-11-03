import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261103180000_raye2_community_chat_foundations.sql", import.meta.url), "utf8");

test("Raye2 foundations create private group, DM, message and preservation models", () => {
  for (const table of [
    "raye2_groups", "raye2_group_members", "raye2_conversations",
    "raye2_conversation_members", "raye2_group_invites", "raye2_messages",
    "raye2_message_reactions", "raye2_message_bookmarks", "raye2_shared_memories"
  ]) assert.match(migration, new RegExp("create table if not exists public\\." + table + "\\b"));
});

test("Raye2 private resources are protected by RLS and membership predicates", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /raye2_is_group_member/);
  assert.match(migration, /raye2_is_conversation_member/);
  assert.match(migration, /Raye2 conversation members read messages/);
  assert.match(migration, /Raye2 members send messages/);
  assert.match(migration, /raye2_groups.*visibility text not null default 'private'/s);
  assert.match(migration, /message_id uuid references public\.raye2_messages\(id\) on delete set null/);
  assert.match(migration, /saved_content jsonb not null/);
  assert.match(migration, /raye2_bookmark_message/);
  assert.match(migration, /group_id is null and created_by=\(select auth\.uid\(\)\) and retention_mode='preserved'/);
});

test("group and direct-conversation creation are authenticated guarded RPCs", () => {
  for (const fn of ["raye2_create_group", "raye2_create_direct_conversation", "raye2_join_public_group", "raye2_join_group_invite"]) {
    assert.match(migration, new RegExp("create or replace function public\\." + fn + "\\("));
    assert.match(migration, new RegExp("grant execute on function public\\." + fn));
    assert.match(migration, new RegExp("revoke all on function public\\." + fn + ".*from public,anon"));
  }
  assert.match(migration, /member_blocks/);
});

test("admin rules are proposed by default and require privileged audited updates", () => {
  assert.match(migration, /status text not null default 'proposed'/);
  assert.match(migration, /raye2_set_platform_rule/);
  assert.match(migration, /raye2_is_platform_admin/);
  assert.match(migration, /platform_rule_updated/);
  assert.match(migration, /'recording.enabled','recording','false'::jsonb,'proposed'/);
});

test("retention is independent by category and cleanup begins with a preview", () => {
  assert.match(migration, /raye2_retention_policies/);
  assert.match(migration, /direct_messages/);
  assert.match(migration, /group_messages/);
  assert.match(migration, /voice_recordings/);
  assert.match(migration, /shared_memories/);
  assert.match(migration, /raye2_create_cleanup_preview/);
  assert.match(migration, /preserve_chat_history boolean not null default true/);
  assert.match(migration, /preserve_shared_memories boolean not null default true/);
  assert.match(migration, /status text not null default 'preview'/);
});

test("audit history is append-only and direct writes to privileged tables are revoked", () => {
  assert.match(migration, /raye2_prevent_audit_mutation/);
  assert.match(migration, /before update or delete on public\.raye2_admin_audit_log/);
  assert.match(migration, /revoke insert,update,delete on public\.raye2_groups/);
  assert.match(migration, /revoke update,delete on public\.raye2_admin_audit_log/);
});
