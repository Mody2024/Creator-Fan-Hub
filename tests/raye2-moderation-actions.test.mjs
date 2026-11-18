import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, community] = await Promise.all([
  read("../supabase/migrations/20261110510000_raye2_moderation_actions_appeals.sql"),
  read("../src/app/community/community-client.tsx")
]);

test("moderators can apply warning/timeout/restriction/suspension/ban with an audit trail", () => {
  assert.match(migration, /create or replace function public\.raye2_apply_member_restriction\(/);
  assert.match(migration, /'warning','timeout','rate_reduction','feature_restriction','suspension','ban'/);
  assert.match(migration, /'moderation_'\|\|p_action/);
  assert.match(migration, /cannot restrict a platform administrator/);
});

test("restrictions are enforced on posts, comments and messages", () => {
  assert.match(migration, /create trigger raye2_posts_restriction_guard before insert on public\.community_posts/);
  assert.match(migration, /create trigger raye2_comments_restriction_guard before insert on public\.community_comments/);
  assert.match(migration, /create trigger raye2_messages_restriction_guard before insert on public\.raye2_messages/);
  assert.match(migration, /raye2_has_active_restriction/);
});

test("members can appeal and moderators can grant or deny", () => {
  assert.match(migration, /create or replace function public\.raye2_submit_moderation_appeal\(/);
  assert.match(migration, /create or replace function public\.raye2_review_moderation_appeal\(/);
  assert.match(migration, /'appeal_'\|\|p_decision/);
  assert.match(migration, /you can only appeal your own restriction/);
});

test("the moderation workspace surfaces restrictions and appeals", () => {
  assert.match(community, /rpc\("raye2_apply_member_restriction"/);
  assert.match(community, /rpc\("raye2_review_moderation_appeal"/);
  assert.match(community, /restrictions\.map/);
  assert.match(community, /appeals\.map/);
});
