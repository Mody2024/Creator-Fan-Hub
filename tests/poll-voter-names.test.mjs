import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("public voting collects a nickname without requiring visitor authentication", async () => {
  const [form, migration] = await Promise.all([
    read("../src/app/vote/poll-vote-form.tsx"),
    read("../supabase/migrations/20261031213221_poll_display_names_and_creator_voter_list.sql")
  ]);
  assert.ok(form.includes("Your nickname"));
  assert.ok(form.includes("NO ACCOUNT NEEDED"));
  assert.ok(form.includes("p_display_name: displayName.trim()"));
  assert.ok(form.includes("maxLength={32}"));
  assert.ok(form.includes("required minLength={1}"));
  assert.ok(migration.includes("voter_display_name text not null"));
  assert.ok(migration.includes("length(v_name) not between 1 and 32"));
});

test("public poll result RPC returns aggregates only, never voter nicknames", async () => {
  const migration = await read("../supabase/migrations/20261031213116_restore_open_poll_discovery_without_tallies.sql");
  assert.ok(migration.includes("vote_count bigint"));
  assert.ok(!migration.includes("voter_display_name"));
  assert.ok(!migration.includes("voter_token_hash"));
});

test("voter nicknames are readable only through an active-creator RPC", async () => {
  const [migration, admin] = await Promise.all([
    read("../supabase/migrations/20261031213221_poll_display_names_and_creator_voter_list.sql"),
    read("../src/app/creator/poll-management.tsx")
  ]);
  const start = migration.indexOf("create or replace function public.get_creator_poll_voters(");
  const end = migration.indexOf("$$;", start);
  const body = migration.slice(start, end);
  assert.ok(body.includes("public.is_active_creator()"));
  assert.ok(body.includes("auth.uid() is null"));
  assert.ok(body.includes("where v.poll_id=p_poll_id"));
  assert.ok(migration.includes("revoke all on function public.get_creator_poll_voters(uuid, integer) from public, anon, authenticated"));
  assert.ok(migration.includes("grant execute on function public.get_creator_poll_voters(uuid, integer) to authenticated"));
  assert.ok(admin.includes('s.rpc("get_creator_poll_voters"'));
  assert.ok(admin.includes("VOTER NICKNAMES · PRIVATE"));
  assert.ok(admin.includes("View voter names"));
});
