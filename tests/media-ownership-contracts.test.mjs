import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [storage, metadata] = await Promise.all([
  read("../supabase/migrations/20261026001700_scope_media_storage_ownership.sql"),
  read("../supabase/migrations/20261026001900_scope_media_metadata_to_owner.sql")
]);

test("storage policies bind mutations to the active creator folder", () => {
  assert.ok(storage.includes("(storage.foldername(name))[1]=(select auth.uid())::text"));
  assert.ok(storage.includes("a.user_id=auth.uid() and a.active=true"));
  assert.ok(storage.includes("bucket_id='creator-media-private'"));
  assert.ok(storage.includes("bucket_id='creator-media-public'"));
  assert.ok(storage.includes("with check"));
});

test("media metadata backfill guards UUID casts and leaves malformed legacy paths unowned", () => {
  assert.ok(metadata.includes("set owner_id = case"));
  assert.ok(metadata.includes("then split_part(storage_path, '/', 2)::uuid"));
  assert.ok(metadata.includes("where owner_id is null"));
  assert.ok(metadata.includes("storage_path ~ '^creator-media-(private|public)/[^/]+/'"));
});

test("media listing is owner-scoped and bounded", () => {
  assert.ok(metadata.includes("where m.owner_id=auth.uid()"));
  assert.ok(metadata.includes("limit least(greatest(coalesce(p_limit,100),1),200)"));
  assert.ok(metadata.includes("create index if not exists media_items_owner_created_idx"));
});

test("media save and delete RPCs reject cross-owner paths and unsafe publication states", () => {
  assert.ok(metadata.includes("split_part(p_storage_path,'/',2) <> auth.uid()::text"));
  assert.ok(metadata.includes("storage visibility does not match publication state"));
  assert.ok(metadata.includes("where id=p_media_id and owner_id=auth.uid() returning id into v_id"));
  assert.ok(metadata.includes("m.owner_id=auth.uid() and m.is_published=false"));
  assert.ok(metadata.includes("m.storage_path like 'creator-media-private/%'"));
});

test("media RPC execution is revoked from public roles before authenticated-only grants", () => {
  for (const signature of [
    "public.get_creator_media(integer)",
    "public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean)",
    "public.delete_creator_media(uuid)"
  ]) {
    assert.ok(metadata.includes(`revoke all on function ${signature} from public,anon,authenticated`));
    assert.ok(metadata.includes(`grant execute on function ${signature} to authenticated`));
  }
});
