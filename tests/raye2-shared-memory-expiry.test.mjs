import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110880000_raye2_shared_memory_expiry.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("preserved memories can never carry an expiry and temporary ones must", () => {
  assert.match(migration, /function public\.raye2_guard_memory_expiry\(/);
  assert.match(migration, /a temporary Shared Memory requires an expiry/);
  assert.match(migration, /before insert or update on public\.raye2_shared_memories/);
});

test("the expiry clock deletes only due temporary memories", () => {
  assert.match(migration, /function public\.raye2_expire_shared_memories\(/);
  assert.match(migration, /delete from public\.raye2_shared_memories\s+where retention_mode = 'temporary' and expires_at is not null and expires_at <= now\(\)/);
});

test("expiry and preservation are guarded to author or group manager", () => {
  assert.match(migration, /function public\.raye2_set_memory_expiry\(/);
  assert.match(migration, /function public\.raye2_preserve_memory\(/);
  assert.match(migration, /only the author or a group manager can set expiry/);
  assert.match(migration, /only the author or a group manager can preserve/);
});

test("memory expiry is folded into the maintenance runner", () => {
  assert.match(migration, /shared_memories_expired/);
  assert.match(migration, /v_memories := public\.raye2_expire_shared_memories\(\)/);
});

test("the chat client drives expiry and preservation through the guarded RPCs", () => {
  assert.match(client, /raye2_set_memory_expiry/);
  assert.match(client, /raye2_preserve_memory/);
  assert.match(client, /expireMemory/);
});
