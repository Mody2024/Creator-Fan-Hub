import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [gateMigration, ideaSubmissionMigration] = await Promise.all([
  read("../supabase/migrations/20261027000300_fail_closed_public_feature_gates.sql"),
  read("../supabase/migrations/20261027000400_fail_closed_public_idea_submissions.sql")
]);

test("public idea reads fail closed without primary published config", () => {
  const fn = gateMigration.split("create or replace function public.get_public_poll_results()")[0];
  assert.ok(fn.includes("and exists ("));
  assert.ok(fn.includes("from public.published_site_config c"));
  assert.ok(fn.includes("config_key = 'primary'"));
  assert.ok(fn.includes("featureFlags,ideas"));
  assert.ok(fn.includes("status in ('approved', 'featured')"));
});

test("public poll reads fail closed and do not reveal open-poll tallies", () => {
  const start = gateMigration.indexOf("create or replace function public.get_public_poll_results()");
  const end = gateMigration.indexOf("create or replace function public.cast_public_poll_vote()");
  assert.ok(start >= 0 && end > start);
  const fn = gateMigration.slice(start, end);
  assert.ok(fn.includes("and exists ("));
  assert.ok(fn.includes("featureFlags,polls"));
  assert.ok(fn.includes("case when p.status = 'closed' then count(v.id)::bigint else 0::bigint end"));
});

test("public voting requires enabled feature and an active poll window", () => {
  const start = gateMigration.indexOf("create or replace function public.cast_public_poll_vote()");
  const fn = gateMigration.slice(start);
  assert.ok(fn.includes("if not exists ("));
  assert.ok(fn.includes("featureFlags,polls"));
  assert.ok(fn.includes("p.status = 'open'"));
  assert.ok(fn.includes("p.starts_at <= now()"));
  assert.ok(fn.includes("p.ends_at > now()"));
  assert.ok(fn.includes("on conflict (poll_id, voter_token_hash) do nothing"));
});

test("public idea submission requires enabled feature and returns a safe unavailable result", () => {
  assert.ok(ideaSubmissionMigration.includes("if not exists ("));
  assert.ok(ideaSubmissionMigration.includes("config_key = 'primary'"));
  assert.ok(ideaSubmissionMigration.includes("featureFlags,ideas"));
  assert.ok(ideaSubmissionMigration.includes("return query select false, 'ideas_unavailable'"));
  assert.ok(ideaSubmissionMigration.includes("revoke all on function public.submit_public_idea(text,text,text,text) from public"));
});
