import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, shortsClient, css] = await Promise.all([
  read("../supabase/migrations/20261110370000_raye2_community_short_comment_threads.sql"),
  read("../src/app/shorts/community-shorts-client.tsx"),
  read("../src/app/globals.css")
]);

test("short comment threading is one level deep and guarded", () => {
  assert.match(migration, /alter table public\.community_short_comments\s*\n\s*add column if not exists parent_comment_id uuid references public\.community_short_comments\(id\) on delete cascade/);
  assert.match(migration, /create or replace function public\.raye2_community_short_comment_parent_guard\(\)/);
  assert.match(migration, /replies are limited to one level/);
  assert.match(migration, /a comment cannot reply to itself/);
  assert.match(migration, /reply must belong to the same short/);
});

test("short reply visibility follows the parent comment and block rules", () => {
  assert.match(migration, /drop policy if exists "Published comments visible on community shorts" on public\.community_short_comments/);
  assert.match(migration, /or exists\(\s*select 1 from public\.community_short_comments p\s*where p\.id = community_short_comments\.parent_comment_id/);
  assert.match(migration, /not public\.is_member_blocked\(p\.author_id\)/);
});

test("per-comment reactions on shorts are member-only with a guarded toggle", () => {
  assert.match(migration, /create table if not exists public\.community_short_comment_reactions/);
  assert.match(migration, /create or replace function public\.raye2_toggle_short_comment_reaction\(p_comment_id uuid, p_reaction text\)/);
  assert.match(migration, /grant execute on function public\.raye2_toggle_short_comment_reaction\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_toggle_short_comment_reaction\(uuid,text\) to anon/);
});

test("short thread and reply reads are pinned definer RPCs granted to anon", () => {
  assert.match(migration, /create or replace function public\.raye2_get_short_comment_thread\(p_short_id uuid, p_limit integer default 40\)/);
  assert.match(migration, /create or replace function public\.raye2_get_short_comment_replies\(p_parent_id uuid, p_limit integer default 40\)/);
  assert.match(migration, /grant execute on function public\.raye2_get_short_comment_thread\(uuid,integer\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_short_comment_replies\(uuid,integer\) to anon, authenticated/);
  assert.match(migration, /my_reaction/);
});

test("short comment notifications are added to the allowed types", () => {
  assert.match(migration, /'community_short_comment_reply','community_short_comment_reaction'/);
  assert.match(migration, /create or replace function public\.notify_short_comment_reply\(\)/);
  assert.match(migration, /create or replace function public\.notify_short_comment_reaction\(\)/);
});

test("the shorts client renders threads, replies and comment reactions", () => {
  assert.match(shortsClient, /raye2_get_short_comment_thread/);
  assert.match(shortsClient, /raye2_get_short_comment_replies/);
  assert.match(shortsClient, /raye2_toggle_short_comment_reaction/);
  assert.match(shortsClient, /async function sendReply\(/);
  assert.match(shortsClient, /async function reactToComment\(/);
  assert.match(shortsClient, /className="nhen-short-replies"/);
  assert.match(css, /\.nhen-short-comment-actions button\.is-active\{/);
  assert.match(css, /\.nhen-short-replies\{/);
});
