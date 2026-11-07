import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mediaLibrary = await readFile(new URL("../src/app/creator/media-library.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261107240000_raye2_creator_thumbnail_visibility_binding.sql", import.meta.url), "utf8");

test("publication copies the generated thumbnail into the matching visibility bucket", () => {
  assert.match(mediaLibrary, /Move the worker-generated thumbnail with its source object/);
  assert.match(mediaLibrary, /reserve_nhen_media_upload[\s\S]*p_bytes:thumbnailBlob\.size[\s\S]*p_bucket:nextBucket/);
  assert.match(mediaLibrary, /set_creator_media_thumbnail_path/);
  assert.match(mediaLibrary, /previousThumbnailPath/);
});

test("thumbnail pointer RPC is creator-owned and validates managed object existence", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /m\.owner_id=v_user/);
  assert.match(migration, /creator_admins/);
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /v_media\.is_published/);
  assert.match(migration, /revoke all on function public\.set_creator_media_thumbnail_path/);
  assert.match(migration, /grant execute on function public\.set_creator_media_thumbnail_path\(uuid,text\) to authenticated/);
});
