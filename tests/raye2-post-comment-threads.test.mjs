import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, css] = await Promise.all([
  read("../supabase/migrations/20261110380000_raye2_community_post_comment_threads.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/globals.css")
]);

test("post comment threading is one level deep and guarded", () => {
  assert.match(migration, /alter table public\.community_comments\s*\n\s*add column if not exists parent_comment_id uuid references public\.community_comments\(id\) on delete cascade/);
  assert.match(migration, /create or replace function public\.raye2_community_comment_parent_guard\(\)/);
  assert.match(migration, /replies are limited to one level/);
  assert.match(migration, /a comment cannot reply to itself/);
  assert.match(migration, /reply must belong to the same post/);
});

test("post reply visibility follows the parent comment and block rules", () => {
  assert.match(migration, /drop policy if exists "Published comments visible" on public\.community_comments/);
  assert.match(migration, /or exists \(\s*select 1 from public\.community_comments parent/);
  assert.match(migration, /not public\.is_member_blocked\(parent\.author_id\)/);
});

test("per-comment reactions on posts are member-only with a guarded toggle", () => {
  assert.match(migration, /create table if not exists public\.community_comment_reactions/);
  assert.match(migration, /create or replace function public\.raye2_toggle_post_comment_reaction\(p_comment_id uuid, p_reaction text\)/);
  assert.match(migration, /grant execute on function public\.raye2_toggle_post_comment_reaction\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_toggle_post_comment_reaction\(uuid,text\) to anon/);
});

test("the post comment thread read keeps its existing shape and adds counts", () => {
  assert.match(migration, /drop function if exists public\.raye2_get_post_comments\(uuid,integer\)/);
  assert.match(migration, /reply_count integer,\s*\n\s*reaction_count integer,\s*\n\s*my_reaction text/);
  assert.match(migration, /and cc\.parent_comment_id is null/);
  assert.match(migration, /not public\.is_member_blocked\(cc\.author_id\)/);
  assert.match(migration, /grant execute on function public\.raye2_get_post_comments\(uuid,integer\) to anon, authenticated/);
});

test("post comment reply read is a pinned definer RPC granted to anon", () => {
  assert.match(migration, /create or replace function public\.raye2_get_post_comment_replies\(p_parent_id uuid, p_limit integer default 50\)/);
  assert.match(migration, /grant execute on function public\.raye2_get_post_comment_replies\(uuid,integer\) to anon, authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
});

test("post comment notifications are added to the allowed types", () => {
  assert.match(migration, /'community_comment_reply','community_comment_reaction'/);
  assert.match(migration, /create or replace function public\.notify_community_comment_reply\(\)/);
  assert.match(migration, /create or replace function public\.notify_community_comment_reaction\(\)/);
});

test("the community client renders threads, replies and comment reactions", () => {
  assert.match(client, /raye2_get_post_comment_replies/);
  assert.match(client, /raye2_toggle_post_comment_reaction/);
  assert.match(client, /async function submitReply\(/);
  assert.match(client, /async function reactToComment\(/);
  assert.match(client, /className="nhen-comment-replies"/);
  assert.match(css, /\.nhen-comment-actions \.nhen-action\.is-active\{/);
  assert.match(css, /\.nhen-comment-replies\{/);
});
