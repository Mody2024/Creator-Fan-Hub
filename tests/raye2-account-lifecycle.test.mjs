import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, settings] = await Promise.all([
  read("../supabase/migrations/20261110630000_raye2_account_lifecycle.sql"),
  read("../src/app/account/account-settings.tsx")
]);

test("accounts support deactivation, deletion and data export server-side", () => {
  assert.match(migration, /create or replace function public\.raye2_deactivate_account\(/);
  assert.match(migration, /create or replace function public\.raye2_request_account_deletion\(/);
  assert.match(migration, /create or replace function public\.raye2_reactivate_account\(\)/);
  assert.match(migration, /create or replace function public\.raye2_request_data_export\(\)/);
});

test("account deletion is logical first with a durable purge job", () => {
  assert.match(migration, /'account\.deletion_grace_days'/);
  assert.match(migration, /'account\.purge'/);
  assert.match(migration, /account_purge:/);
  assert.match(migration, /raye2_background_jobs/);
});

test("account lifecycle and preferences are owner-scoped", () => {
  assert.match(migration, /Members read their own lifecycle/);
  assert.match(migration, /Members read their own preferences/);
  assert.match(migration, /create or replace function public\.raye2_set_my_preferences\(/);
});

test("the account page exposes lifecycle, preferences and export", () => {
  assert.match(settings, /rpc\("raye2_request_account_deletion"/);
  assert.match(settings, /rpc\("raye2_request_data_export"/);
  assert.match(settings, /rpc\("raye2_set_my_preferences"/);
});
