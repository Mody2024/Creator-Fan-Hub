import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115196000_raye2_dynamic_storage_capacity_and_monthly_upload_budgets.sql", import.meta.url), "utf8");
const roleMigration = await readFile(new URL("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql", import.meta.url), "utf8");
const adminMigration = await readFile(new URL("../supabase/migrations/20261115195000_raye2_admin_storage_quota_controls.sql", import.meta.url), "utf8");
const providerMigration = await readFile(new URL("../supabase/migrations/20261115194000_raye2_professional_storage_tiers_and_provider_registry.sql", import.meta.url), "utf8");

test("global storage and monthly upload target are capped at 10 GiB", () => {
  assert.match(migration, /target_total_capacity_bytes bigint not null default 10737418240/);
  assert.match(migration, /monthly_upload_target_bytes bigint not null default 10737418240/);
  assert.match(migration, /monthly_upload_hard_limit_bytes bigint not null default 10737418240/);
  assert.match(migration, /free_only boolean not null default true check \(free_only\)/);
});

test("actual storage capacity is calculated only from enabled, verified free providers", () => {
  assert.match(migration, /adapter_ready=true and v\.zero_cost_verified=true/);
  assert.match(migration, /billing_mode='free_only'/);
  assert.match(migration, /raye2_storage_effective_capacity_bytes/);
  assert.match(migration, /least\(/);
  assert.match(providerMigration, /'cloudflare_r2','s3_compatible',false,'free_only',0,0,0,0/);
});

test("provider failover requires fresh reconciled capacity and request/egress headroom", () => {
  assert.match(migration, /s\.reconciled_at>=now\(\)-interval '15 minutes'/);
  assert.match(migration, /s\.monthly_egress_bytes<v\.monthly_egress_bytes_limit/);
  assert.match(migration, /s\.monthly_read_ops<v\.monthly_read_ops_limit/);
  assert.match(migration, /No verified free storage provider currently has sufficient capacity/);
});

test("monthly ingestion is reserved and atomically accounted globally and per user", () => {
  assert.match(migration, /raye2_storage_monthly_usage/);
  assert.match(migration, /v_user_monthly_reserved/);
  assert.match(migration, /v_global_reserved/);
  assert.match(migration, /Raye2 monthly upload hard limit reached/);
  assert.match(migration, /Raye2 monthly upload hard stop reached/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("dynamic quotas use role weights and never exceed real shared capacity", () => {
  assert.match(migration, /when 'creator' then 3/);
  assert.match(migration, /when 'streamer' then 3/);
  assert.match(migration, /when 'combined' then 5/);
  assert.match(migration, /return greatest\(v_used,least\(v_requested,v_share\)\)/);
  assert.match(migration, /raye2_effective_monthly_upload_quota/);
});

test("storage byte quotas use bigint so 2 GiB and 3 GiB role allowances cannot overflow", () => {
  assert.match(roleMigration, /limit_value bigint not null/);
  assert.match(roleMigration, /returns bigint language sql stable security definer/);
  assert.match(providerMigration, /'combined','storage_bytes',3221225472/);
  assert.match(adminMigration, /p_tier text,p_metric text,p_limit bigint/);
  assert.match(adminMigration, /drop function if exists public\.raye2_set_role_quota\(text,text,bigint\)/);
});

test("legacy bucket id is migrated safely while current Raye2 bucket is accepted", () => {
  assert.match(migration, /'nhen-community-shorts','raye2-community-shorts'/);
  assert.match(migration, /drop constraint if exists nhen_media_upload_reservations_bucket_id_check/);
});

test("no provider credentials are stored in the registry or browser-side configuration", () => {
  const executableSql = providerMigration.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executableSql, /access_key|secret_key|api_token|credential/i);
  assert.match(migration, /adapter_ready boolean not null default false/);
  assert.match(migration, /zero_cost_verified boolean not null default false/);
});
