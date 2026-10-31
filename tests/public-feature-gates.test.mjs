import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [pollVisibilityMigration, gateMigration, ideaSubmissionMigration, initialSchema, pollReadMigration, pollVotingMigration] = await Promise.all([
  read("../supabase/migrations/20261027000200_public_poll_visibility_gates.sql"),
  read("../supabase/migrations/20261027000300_fail_closed_public_feature_gates.sql"),
  read("../supabase/migrations/20261031213109_fail_closed_optional_idea_submissions.sql"),
  read("../supabase/migrations/20261026000100_initial_schema.sql"),
  read("../supabase/migrations/20261031213116_restore_open_poll_discovery_without_tallies.sql"),
  read("../supabase/migrations/20261031213221_poll_display_names_and_creator_voter_list.sql")
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
  const start = pollReadMigration.indexOf("create or replace function public.get_public_poll_results()");
  const end = pollReadMigration.length;
  assert.ok(start >= 0 && end > start);
  const fn = pollReadMigration.slice(start, end);
  assert.ok(fn.includes("and exists ("));
  assert.ok(fn.includes("featureFlags,polls"));
  assert.ok(fn.includes("case when p.status = 'closed' then count(v.id)::bigint else 0::bigint end"));
  assert.ok(pollVisibilityMigration.includes("featureFlags,polls"));
  assert.ok(pollVisibilityMigration.includes("maintenance_mode"));
});

test("public voting requires enabled feature and an active poll window", () => {
  const start = pollVotingMigration.indexOf("create or replace function public.cast_public_poll_vote(");
  const fn = pollVotingMigration.slice(start);
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


test("public voting hashes anonymous tokens and binds options to the selected poll", () => {
  const start = pollVotingMigration.indexOf("create or replace function public.cast_public_poll_vote(");
  const fn = pollVotingMigration.slice(start);
  assert.ok(fn.includes("set search_path = ''"));
  assert.ok(fn.includes("o.id = p_option_id and o.poll_id = p_poll_id"));
  assert.ok(fn.includes("extensions.digest(convert_to(p_voter_token, 'UTF8'), 'sha256')"));
  assert.ok(fn.includes("voter_token_hash"));
  assert.ok(!fn.includes("values (p_poll_id, p_option_id, p_voter_token)"));
  assert.ok(fn.includes("revoke all on function public.cast_public_poll_vote(uuid, uuid, text, text) from public"));
  assert.ok(fn.includes("grant execute on function public.cast_public_poll_vote(uuid, uuid, text, text) to anon, authenticated"));
});

test("public voting rejects malformed anonymous tokens before any vote insert", () => {
  const start = gateMigration.indexOf("create or replace function public.cast_public_poll_vote(");
  const fn = gateMigration.slice(start);
  const validationEnd = fn.indexOf("if not exists (");
  const validation = fn.slice(0, validationEnd);
  assert.ok(validation.includes("length(p_voter_token) < 32"));
  assert.ok(validation.includes("length(p_voter_token) > 160"));
  assert.ok(validation.includes("p_voter_token !~ '^[A-Za-z0-9_-]+$'"));
  assert.ok(validation.includes("raise exception 'invalid vote request'"));
});


test("database uniqueness makes duplicate-vote prevention safe under concurrent requests", () => {
  assert.ok(initialSchema.includes("unique (poll_id, voter_token_hash)"));
  assert.ok(pollVotingMigration.includes("on conflict (poll_id, voter_token_hash) do nothing"));
  assert.ok(pollVotingMigration.includes("get diagnostics v_inserted = row_count"));
  assert.ok(pollVotingMigration.includes("return query select false, 'already_voted'::text"));
});

test("poll option foreign key prevents votes from pairing an option with another poll", () => {
  assert.ok(initialSchema.includes("constraint poll_votes_option_matches_poll"));
  assert.ok(initialSchema.includes("foreign key (poll_id, option_id)"));
  assert.ok(initialSchema.includes("references public.poll_options(poll_id, id) on delete cascade"));
  const start = gateMigration.indexOf("create or replace function public.cast_public_poll_vote(");
  const fn = gateMigration.slice(start);
  assert.ok(fn.includes("o.id = p_option_id and o.poll_id = p_poll_id"));
});

test("public poll result RPC exposes no voter token or token hash fields", () => {
  const start = gateMigration.indexOf("create or replace function public.get_public_poll_results()");
  const end = pollReadMigration.length;
  const fn = pollReadMigration.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(!/voter_token|token_hash|poll_votes\.id/i.test(fn.slice(0, fn.indexOf("language sql"))));
  assert.ok(fn.includes("vote_count bigint"));
  assert.ok(fn.includes("case when p.status = 'closed' then count(v.id)::bigint else 0::bigint end"));
});


test("public voting requires a nickname but no visitor account and keeps names private", () => {
  assert.ok(pollVotingMigration.includes("length(v_name) not between 1 and 32"));
  assert.ok(pollVotingMigration.includes("voter_display_name"));
  assert.ok(pollVotingMigration.includes("p_display_name text"));
  assert.ok(pollVotingMigration.includes("drop function if exists public.cast_public_poll_vote(uuid, uuid, text)"));
  assert.ok(pollVotingMigration.includes("get_creator_poll_voters"));
  assert.ok(pollVotingMigration.includes("public.is_active_creator()"));
  assert.ok(pollVotingMigration.includes("revoke all on function public.get_creator_poll_voters(uuid, integer) from public, anon, authenticated"));
  assert.ok(pollVotingMigration.includes("grant execute on function public.get_creator_poll_voters(uuid, integer) to authenticated"));
});
