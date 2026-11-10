import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, watchPage, continueClient, player, watchDetailClient] = await Promise.all([
  read("../supabase/migrations/20261110220000_raye2_continue_watching.sql"),
  read("../src/app/watch/page.tsx"),
  read("../src/app/watch/continue-watching.tsx"),
  read("../src/app/videos/public-video-player.tsx"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("watch progress is a member-private table with RLS restricted to the caller", () => {
  assert.match(migration, /create table if not exists public\.watch_progress/);
  assert.match(migration, /alter table public\.watch_progress enable row level security/);
  assert.match(migration, /primary key \(user_id, media_id\)/);
  const policies = migration.match(/user_id = \(select auth\.uid\(\)\)/g) ?? [];
  assert.ok(policies.length >= 4, "expected owner-scoped policies for select/insert/update/delete");
});

test("the record RPC is guarded, authenticated-only and clamps position to duration", () => {
  const body = functionBody(migration, "raye2_record_watch_progress");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path\s*=\s*''/i);
  assert.match(body, /if v_me is null then\s*raise exception 'authentication required'/);
  assert.match(body, /if v_published is not true then\s*raise exception 'video is not published'/);
  assert.match(body, /v_pos := greatest\(coalesce\(p_position, 0\), 0\)/);
  assert.match(body, /if v_dur > 0 and v_pos > v_dur then\s*v_pos := v_dur/);
  assert.match(migration, /grant execute on function public\.raye2_record_watch_progress\(uuid,integer,integer\) to authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_record_watch_progress\(uuid,integer,integer\) from public/);
});

test("continue-watching only returns the caller's unfinished published videos", () => {
  const body = functionBody(migration, "raye2_get_continue_watching");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path\s*=\s*''/i);
  assert.match(body, /wp\.user_id = auth\.uid\(\)/);
  assert.match(body, /mi\.is_published = true/);
  assert.match(body, /mi\.media_type in \('video','youtube'\)/);
  assert.match(body, /wp\.position_seconds > 0/);
  assert.match(body, /wp\.position_seconds < least\(wp\.duration_seconds - 30, floor\(wp\.duration_seconds \* 0\.95\)\)/);
  assert.match(body, /order by wp\.updated_at desc/);
  assert.match(migration, /grant execute on function public\.raye2_get_continue_watching\(integer\) to authenticated/);
});

test("clear-watch-progress is owner-scoped and authenticated", () => {
  const body = functionBody(migration, "raye2_clear_watch_progress");
  assert.match(body, /if v_me is null then\s*raise exception 'authentication required'/);
  assert.match(body, /delete from public\.watch_progress where user_id = v_me and media_id = p_media_id/);
  assert.match(migration, /grant execute on function public\.raye2_clear_watch_progress\(uuid\) to authenticated/);
});

test("the player reports progress on time/pause/end and the watch page mounts the rail", () => {
  assert.match(player, /onProgress\?: \(position: number, duration: number\) => void/);
  assert.match(player, /onTimeUpdate=\{reportProgress\}/);
  assert.match(player, /onPause=\{reportProgress\}/);
  assert.match(player, /onEnded=\{reportProgress\}/);
  assert.match(watchPage, /import ContinueWatching from "\.\/continue-watching"/);
  assert.match(watchPage, /<ContinueWatching\/>/);
});

test("the watch detail client persists progress through the guarded RPC", () => {
  assert.match(continueClient, /raye2_get_continue_watching/);
  assert.match(continueClient, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(continueClient, /\/watch\/"\+item\.slug\+"\?t="\+item\.position_seconds/);
  assert.match(watchDetailClient, /raye2_record_watch_progress/);
  assert.match(watchDetailClient, /onProgress=\{saveProgress\}/);
});
