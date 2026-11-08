import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [page, client, styles, migration, plan] = await Promise.all([
  read("../src/app/raye2/page.tsx"), read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/raye2.module.css"), read("../supabase/migrations/20261103180000_raye2_community_chat_foundations.sql"),
  read("../docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md")
]);
test("Raye2 workspace is a real authenticated app route", () => {
  assert.match(page, /Raye2Client/); assert.match(client, /getSupabaseBrowserClient/);
  assert.match(client, /supabase\.auth\.getUser\(\)/); assert.match(client, /raye2_create_direct_conversation/);
});
test("messaging UI covers group creation, public discovery, replies and reactions", () => {
  assert.match(client, /raye2_create_group/); assert.match(client, /raye2_join_public_group/);
  assert.match(client, /parent_message_id/); assert.match(client, /raye2_message_reactions/);
  assert.match(client, /raye2_bookmark_message/);
  assert.match(client, /baseSlug.length >= 2 \? baseSlug : "group"/);
});
test("messages are bounded and realtime refresh is published", () => {
  assert.match(client, /maxLength=\{5000\}/); assert.match(client, /limit\(600\)/);
  assert.match(client, /postgres_changes/); assert.match(migration, /alter publication supabase_realtime add table/);
});
test("saved message snapshots remain visible after source deletion", () => {
  assert.match(migration, /saved_content jsonb not null/);
  assert.match(client, /item\.saved_content\?\.body/);
  assert.match(client, /Preserved saved copy/);
});
test("read-only groups cannot submit messages from the client", () => {
  assert.match(client, /canSend: conversation\.conversation_type === "direct" \|\| group\?\.status === "active"/);
  assert.match(client, /disabled=\{!selected\.canSend\}/);
  assert.match(migration, /g\.status in \('active','read_only'\)/);
});
test("recording consent and production restrictions remain confirmed requirements", () => {
  assert.match(plan, /Recording is \*\*off by default\*\*/);
  assert.match(plan, /every participant has actively consented/);
  assert.match(plan, /private groups remain private/);
  assert.match(plan, /No deployment or merge to \x60main\x60 is authorized/);
});
test("workspace has responsive mobile and reduced-motion styling", () => {
  assert.match(styles, /@media\(max-width:680px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
