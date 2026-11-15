import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115193000_raye2_per_user_media_storage_quotas.sql", import.meta.url), "utf8");
const library = await readFile(new URL("../src/app/creator/media-library.tsx", import.meta.url), "utf8");
const upload = await readFile(new URL("../src/lib/supabase/resumable-upload.ts", import.meta.url), "utf8");

test("every authenticated account gets a logical owner-scoped storage allowance", () => {
  assert.match(migration, /get_raye2_user_storage_capacity/);
  assert.match(migration, /split_part\(o\.name,'\/',1\)=v_user::text/);
  assert.match(migration, /104857600/);
  assert.match(migration, /262144000/);
  assert.match(migration, /r\.user_id=v_user/);
});

test("admins can only change per-user quotas through a trusted service-role function", () => {
  assert.match(migration, /raye2_user_storage_quota_overrides/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(migration, /grant execute on function public\.set_raye2_user_storage_quota\(uuid,bigint,text\) to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.set_raye2_user_storage_quota\(uuid,bigint,text\) to authenticated/);
});

test("member and creator uploads enforce both personal and shared project ceilings", () => {
  assert.match(migration, /v_user_used\+v_user_reserved\+p_bytes>v_user_quota/);
  assert.match(migration, /v_used\+v_reserved\+p_bytes>v_quota/);
  assert.match(migration, /Raye2 account storage allowance is full/);
  assert.match(migration, /Raye2 managed storage safety limit reached/);
});

test("worker-generated media counts against the owner's allowance and the shared ceiling", () => {
  assert.match(migration, /reserve_raye2_worker_thumbnail_capacity/);
  assert.match(migration, /split_part\(o\.name,'\/',1\)=p_owner_id::text/);
  assert.match(migration, /Raye2 creator storage allowance reached/);
});

test("Creator Media Library displays personal and shared storage capacity separately", () => {
  assert.match(library, /get_raye2_user_storage_capacity/);
  assert.match(library, /Your personal Raye2 storage/);
  assert.match(library, /Raye2 project safety limit/);
});

test("media upload code does not expose provider credentials", () => {
  assert.doesNotMatch(upload, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(upload, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});
