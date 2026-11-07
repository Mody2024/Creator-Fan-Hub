import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mediaLibrary = await readFile(new URL("../src/app/creator/media-library.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261107250000_raye2_atomic_media_thumbnail_publication.sql", import.meta.url), "utf8");

test("creator publication saves media and its copied thumbnail through one RPC", () => {
  assert.match(mediaLibrary, /save_creator_media_with_thumbnail/);
  assert.match(mediaLibrary, /p_thumbnail_path:nextThumbnailPath/);
  assert.doesNotMatch(mediaLibrary, /rpc\("set_creator_media_thumbnail_path"/);
});

test("atomic publication wrapper rolls back invalid thumbnail pointer updates", () => {
  assert.match(migration, /public\.save_creator_media\(/);
  assert.match(migration, /if not coalesce\(v_result\.saved,false\) then/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /v_media\.owner_id=v_user/);
  assert.match(migration, /v_media\.is_published/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /update public\.media_items set thumbnail_path=p_thumbnail_path/);
  assert.match(migration, /security definer[\s\S]*set search_path=''/);
  assert.match(migration, /grant execute on function public\.save_creator_media_with_thumbnail/);
});
