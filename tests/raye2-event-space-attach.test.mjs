import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, ui] = await Promise.all([
  read("../supabase/migrations/20261111080000_raye2_creator_event_space_attach.sql"),
  read("../src/app/creator/event-social-management.tsx")
]);

test("creators can list rooms they may attach and the event exposes its space", () => {
  assert.match(migration, /create or replace function public\.raye2_creator_attachable_spaces\(\)/);
  assert.match(migration, /join public\.raye2_conversation_members m on m\.conversation_id = c\.id/);
  assert.match(migration, /where m\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /and public\.is_active_creator\(\)/);
  // get_creator_events now returns the attached space slug.
  assert.match(migration, /drop function if exists public\.get_creator_events\(integer\)/);
  assert.match(migration, /space_group_slug text/);
  assert.match(migration, /left join public\.raye2_groups g on g\.id = c\.group_id/);
});

test("the creator workspace wires attach and detach through the guarded RPC", () => {
  assert.match(ui, /s\.rpc\("raye2_creator_attachable_spaces"\)/);
  assert.match(ui, /s\.rpc\("raye2_attach_event_space",\{p_event_id:eventId,p_conversation_id:conversationId\}\)/);
  assert.match(ui, /attachSpace\(e\.event_id,spaceChoice\)/);
  assert.match(ui, /attachSpace\(e\.event_id,null\)/);
});
