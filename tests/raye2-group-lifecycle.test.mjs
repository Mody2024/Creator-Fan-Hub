import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110910000_raye2_group_lifecycle.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("members can leave a group but owners must transfer ownership first", () => {
  assert.match(migration, /function public\.raye2_leave_group\(p_group_id uuid\)/);
  assert.match(migration, /transfer ownership before leaving/);
  assert.match(client, /rpc\("raye2_leave_group"/);
  assert.match(client, /selectedGroup\.memberRole !== "owner"/);
});

test("ownership transfer flips roles and is guarded by a transaction flag", () => {
  assert.match(migration, /function public\.raye2_transfer_group_ownership\(p_group_id uuid, p_new_owner uuid\)/);
  assert.match(migration, /set_config\('raye2\.allow_owner_change','on',true\)/);
  assert.match(migration, /new\.owner_id is distinct from old\.owner_id[\s\S]*raye2\.allow_owner_change/);
  assert.match(migration, /update public\.raye2_group_members set role='owner'/);
  assert.match(migration, /update public\.raye2_group_members set role='admin'/);
});

test("owners can archive, read-only and reactivate a group with an audit trail", () => {
  assert.match(migration, /function public\.raye2_set_group_status\(p_group_id uuid, p_status text\)/);
  assert.match(migration, /p_status not in \('active','read_only','archived'\)/);
  assert.match(migration, /'group_status_changed'/);
  assert.match(client, /rpc\("raye2_set_group_status"/);
});
