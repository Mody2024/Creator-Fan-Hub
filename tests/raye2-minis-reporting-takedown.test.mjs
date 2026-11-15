import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261111000000_raye2_minis_reporting_takedown.sql"),
  read("../src/app/minis/minis-client.tsx")
]);

test("Mini's are reportable through the community content report RPC", () => {
  assert.match(migration, /content_reports_target_type_check/);
  assert.match(migration, /check \(target_type in \('post','comment','profile','community_clip','mini'\)\)/);
  assert.match(migration, /if p_target_type = 'mini' and not exists/);
  assert.match(client, /rpc\("raye2_report_community_content", \{ p_target_type: "mini"/);
});

test("the takedown workflow covers Mini's and community clips", () => {
  assert.match(migration, /raye2_content_takedowns_target_type_check/);
  assert.match(migration, /check \(target_type in \('community_post','community_comment','media_item','mini','community_clip'\)\)/);
  assert.match(migration, /from public\.raye2_minis c where c\.id = p_target_id/);
  assert.match(migration, /update public\.raye2_minis set status = 'removed' where id = p_target_id/);
  assert.match(migration, /update public\.raye2_minis set status = coalesce\(v_row\.previous_state->>'status','published'\)/);
});

test("the moderation queue previews Mini reports", () => {
  assert.match(migration, /when 'mini' then coalesce\(\(select mn\.title from public\.raye2_minis mn where mn\.id::text = r\.target_id\), ''\)/);
  assert.match(migration, /function public\.raye2_get_moderation_queue\(/);
});

test("the feed exposes Mini ownership and the client offers report/remove", () => {
  assert.match(migration, /author_id uuid, author_handle text/);
  assert.match(client, /item\.author_id !== userId/);
  assert.match(client, /item\.author_id === userId/);
  assert.match(client, /from\("raye2_minis"\)\.update\(\{ status: "removed" \}\)/);
});
