import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115194000_raye2_professional_storage_tiers_and_provider_registry.sql", import.meta.url), "utf8");
const quotaMigration = await readFile(new URL("../supabase/migrations/20261115193000_raye2_per_user_media_storage_quotas.sql", import.meta.url), "utf8");
const roleMigration = await readFile(new URL("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql", import.meta.url), "utf8");

test("storage tiers follow Creator, Streamer and combined roles without additive combined quotas", () => {
  assert.match(migration, /'creator','storage_bytes',21474836480/);
  assert.match(migration, /'streamer','storage_bytes',2147483648/);
  assert.match(migration, /'combined','storage_bytes',32212254720/);
  assert.match(migration, /else 1073741824 end/);
  assert.match(migration, /raye2_creator_tier\(v_user\)/);
  assert.match(roleMigration, /when 'owner' then 'combined'/);
  assert.match(roleMigration, /when 'admin' then 'combined'/);
});

test("the physical Supabase cap remains independent of a larger logical user allowance", () => {
  assert.match(migration, /v_quota bigint:=786432000/);
  assert.match(migration, /v_used\+v_reserved\+p_bytes>v_quota/);
  assert.match(migration, /Raye2 shared Supabase safety limit reached/);
  assert.match(quotaMigration, /between 0 and 1099511627776/);
});

test("only free-only providers can be registered and new R2 is disabled", () => {
  assert.match(migration, /billing_mode text not null default 'free_only' check \(billing_mode='free_only'\)/);
  assert.match(migration, /'cloudflare_r2','s3_compatible',false,'free_only',0,0,0,0/);
  assert.match(migration, /'backblaze_b2','s3_compatible',false,'free_only',0,0,0,0/);
  assert.match(migration, /'tigris','s3_compatible',false,'free_only',0,0,0,0/);
  assert.match(migration, /'filebase','s3_compatible',false,'free_only',5368709120,1000000,10000000,5368709120/);
  assert.match(migration, /hard_stop_percent numeric\(5,2\).*between 50 and 95/);
  assert.match(migration, /monthly_write_ops_limit bigint/);
  assert.match(migration, /monthly_read_ops_limit bigint/);
  assert.match(migration, /monthly_egress_bytes_limit bigint/);
});

test("provider registry is private and has no credential columns", () => {
  assert.match(migration, /revoke all on public\.raye2_storage_providers from public,anon,authenticated/);
  assert.match(migration, /grant select,insert,update,delete on public\.raye2_storage_providers to service_role/);
  const executableSql = migration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executableSql, /access_key|secret_key|api_token|credential/i);
});

test("upload reservations and worker outputs use the same role-based personal quota", () => {
  assert.match(migration, /public\.raye2_role_quota\(v_tier,'storage_bytes'\)/);
  assert.match(migration, /v_user_used\+v_user_reserved\+p_bytes>v_user_quota/);
  assert.match(migration, /Raye2 creator storage allowance reached/);
  assert.match(migration, /get_raye2_user_storage_capacity/);
});

test("platform admins can set or reset user quotas with audit and a 10 GiB hard ceiling", async () => {
  const adminMigration = await readFile(new URL("../supabase/migrations/20261115195000_raye2_admin_storage_quota_controls.sql", import.meta.url), "utf8");
  assert.match(adminMigration, /raye2_admin_set_user_storage_quota/);
  assert.match(adminMigration, /public\.raye2_is_platform_admin\(\)/);
  assert.match(adminMigration, /1099511627776/);
  assert.match(adminMigration, /reset_to_role_default/);
  assert.match(adminMigration, /raye2_admin_audit_log/);
  assert.match(adminMigration, /storage tier limit cannot exceed 1 TiB/);
  assert.match(adminMigration, /grant execute on function public\.raye2_admin_set_user_storage_quota\(uuid,bigint,text\) to authenticated/);
});
