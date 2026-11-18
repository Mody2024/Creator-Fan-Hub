import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, watchClient, css] = await Promise.all([
  read("../supabase/migrations/20261110360000_raye2_video_comment_threads.sql"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx"),
  read("../src/app/globals.css")
]);

test("threading is one level deep and enforced by a guard trigger", () => {
  assert.match(migration, /add column if not exists parent_comment_id uuid references public\.video_comments\(id\) on delete cascade/);
  assert.match(migration, /create or replace function public\.raye2_video_comment_parent_guard\(\)/);
  assert.match(migration, /replies are limited to one level/);
  assert.match(migration, /a comment cannot reply to itself/);
  assert.match(migration, /reply must belong to the same video/);
  assert.match(migration, /create trigger raye2_video_comment_parent_guard\s*\nbefore insert or update on public\.video_comments/);
});

test("reply visibility follows the parent comment and block rules", () => {
  assert.match(migration, /drop policy if exists "Published video comments visible" on public\.video_comments/);
  assert.match(migration, /or exists \(\s*select 1 from public\.video_comments p\s*where p\.id = video_comments\.parent_comment_id\s*and p\.status = 'published'/);
  assert.match(migration, /not public\.is_member_blocked\(p\.author_id\)/);
});

test("per-comment reactions are a member table with a guarded toggle", () => {
  assert.match(migration, /create table if not exists public\.video_comment_reactions/);
  assert.match(migration, /reaction text not null check\(reaction in \('spark','orbit','legend','laugh','mindblown','support'\)\)/);
  assert.match(migration, /create or replace function public\.raye2_toggle_comment_reaction\(p_comment_id uuid, p_reaction text\)/);
  assert.match(migration, /grant execute on function public\.raye2_toggle_comment_reaction\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.raye2_toggle_comment_reaction\(uuid,text\) to anon/);
});

test("thread and reply reads are pinned definer RPCs granted to anon", () => {
  assert.match(migration, /create or replace function public\.raye2_get_video_comment_thread\(p_media_id uuid, p_limit integer default 50\)/);
  assert.match(migration, /create or replace function public\.raye2_get_video_comment_replies\(p_parent_id uuid, p_limit integer default 50\)/);
  assert.match(migration, /grant execute on function public\.raye2_get_video_comment_thread\(uuid,integer\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_video_comment_replies\(uuid,integer\) to anon, authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /my_reaction/);
});

test("reply and comment-reaction notifications are added to the allowed types", () => {
  assert.match(migration, /'video_comment_reply','video_comment_reaction'/);
  assert.match(migration, /create or replace function public\.notify_video_comment_reply\(\)/);
  assert.match(migration, /create or replace function public\.notify_video_comment_reaction\(\)/);
});

test("the watch client renders threads, replies and comment reactions", () => {
  assert.match(watchClient, /raye2_get_video_comment_thread/);
  assert.match(watchClient, /raye2_get_video_comment_replies/);
  assert.match(watchClient, /raye2_toggle_comment_reaction/);
  assert.match(watchClient, /async function sendReply\(/);
  assert.match(watchClient, /async function reactToComment\(/);
  assert.match(watchClient, /className="raye2-detail-replies"/);
  assert.match(css, /\.raye2-detail-comment-actions button\.active\{/);
  assert.match(css, /\.raye2-detail-replies\{/);
});
