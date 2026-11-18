import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, player, watchPage, studio] = await Promise.all([
  read("../supabase/migrations/20261110990000_raye2_media_captions.sql"),
  read("../src/app/videos/public-video-player.tsx"),
  read("../src/app/watch/[slug]/page.tsx"),
  read("../src/app/creator/video-studio.tsx")
]);

test("captions live in their own table with a .vtt constraint and no direct access", () => {
  assert.match(migration, /create table if not exists public\.raye2_media_captions/);
  assert.match(migration, /language text not null check \(language in \('en','ar'\)\)/);
  assert.match(migration, /storage_path text not null check \(storage_path ~ '\^creator-media-public\/'\)/);
  assert.match(migration, /revoke all on public\.raye2_media_captions from anon, authenticated/);
});

test("caption management is owner-only and validates the path", () => {
  assert.match(migration, /function public\.raye2_set_media_caption\(/);
  assert.match(migration, /where id = p_media_id and owner_id = v_uid/);
  assert.match(migration, /v_path !~ \('\^creator-media-public\/' \|\| v_uid::text \|\| '\/'\)/);
  assert.match(migration, /function public\.raye2_remove_media_caption\(/);
  assert.match(studio, /rpc\("raye2_set_media_caption"/);
  assert.match(studio, /rpc\("raye2_remove_media_caption"/);
});

test("captions are readable only for published, ready media", () => {
  assert.match(migration, /function public\.raye2_get_media_captions\(p_media_id uuid\)/);
  assert.match(migration, /m\.is_published = true/);
  assert.match(migration, /m\.processing_status = 'ready'/);
  assert.match(migration, /grant execute on function public\.raye2_get_media_captions\(uuid\) to anon, authenticated/);
});

test("the player renders WebVTT tracks and the watch page resolves them", () => {
  assert.match(player, /<track key=\{track\.language\} kind="subtitles"/);
  assert.match(player, /srcLang=\{track\.language\}/);
  assert.match(player, /captions\?: CaptionTrack\[\]/);
  assert.match(watchPage, /rpc\("raye2_get_media_captions",\{p_media_id:data\.media_id\}\)/);
  assert.match(watchPage, /captions=\{captions\}/);
});
