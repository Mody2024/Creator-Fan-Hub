import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [admin, creatorRead, polls, moderation, events, media, history, publicGates, ideas, helper] = await Promise.all([
  read("../supabase/migrations/20261026000400_creator_admin_publish_functions.sql"),
  read("../supabase/migrations/20261026000600_harden_creator_draft_read.sql"),
  read("../supabase/migrations/20261026001300_creator_poll_management.sql"),
  read("../supabase/migrations/20261026001100_creator_idea_moderation.sql"),
  read("../supabase/migrations/20261026001500_creator_events_and_socials.sql"),
  read("../supabase/migrations/20261026001900_scope_media_metadata_to_owner.sql"),
  read("../supabase/migrations/20261026001800_creator_publish_history_restore.sql"),
  read("../supabase/migrations/20261027000300_fail_closed_public_feature_gates.sql"),
  read("../supabase/migrations/20261027000400_fail_closed_public_idea_submissions.sql"),
  read("../supabase/migrations/20261026000501_restrict_internal_auth_helper.sql")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 3);
}

const creatorFunctions = [
  [admin, "save_site_config_draft"],
  [admin, "publish_site_config"],
  [creatorRead, "get_site_config_draft"],
  [polls, "create_creator_poll"],
  [polls, "set_creator_poll_status"],
  [moderation, "get_creator_idea_queue"],
  [moderation, "moderate_public_idea"],
  [events, "get_creator_events"],
  [events, "save_creator_event"],
  [events, "set_creator_event_status"],
  [events, "get_creator_social_links"],
  [events, "save_creator_social_link"],
  [media, "get_creator_media"],
  [media, "save_creator_media"],
  [media, "delete_creator_media"],
  [history, "get_creator_publish_history"],
  [history, "restore_site_config_version"]
];

test("every creator mutation/read RPC is SECURITY DEFINER with an active-creator check", () => {
  for (const [sql, name] of creatorFunctions) {
    const body = functionBody(sql, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
    assert.match(body, /auth\.uid\(\)\s+is\s+null/i, name);
    assert.ok(/is_active_creator\(\)/i.test(body) || /public\.creator_admins/i.test(body), name + ": missing active creator allowlist check");
    assert.match(body, /errcode\s*=\s*'42501'/i, name);
  }
});

test("the internal creator authorization helper is not directly executable by client roles", () => {
  assert.ok(helper.includes("revoke all on function public.is_active_creator() from public, anon, authenticated"));
  assert.ok(helper.includes("grant execute on function public.is_active_creator() to postgres, service_role"));
});

test("anonymous SECURITY DEFINER RPCs are an explicit public-feature allowlist", () => {
  for (const [sql, name] of [
    [publicGates, "get_public_approved_ideas"],
    [publicGates, "get_public_poll_results"],
    [publicGates, "cast_public_poll_vote"],
    [ideas, "submit_public_idea"]
  ]) {
    const body = functionBody(sql, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
    assert.match(body, /revoke all on function public\./i, name);
    assert.match(body, /grant execute on function public\./i, name);
  }
});

test("public voting and idea submissions fail closed behind published feature flags", () => {
  const vote = functionBody(publicGates, "cast_public_poll_vote");
  const submit = functionBody(ideas, "submit_public_idea");
  assert.ok(vote.includes("featureFlags,polls"));
  assert.ok(vote.includes("polls_unavailable"));
  assert.ok(vote.includes("already_voted"));
  assert.ok(submit.includes("featureFlags,ideas"));
  assert.ok(submit.includes("ideas_unavailable"));
  assert.ok(submit.includes("daily_limit"));
  assert.ok(submit.includes("cooldown"));
});

test("media metadata and storage paths remain scoped to the signed-in owner", () => {
  assert.ok(media.includes("where m.owner_id=auth.uid()"));
  assert.ok(media.includes("split_part(p_storage_path,'/',2) <> auth.uid()::text"));
  assert.ok(media.includes("where id=p_media_id and owner_id=auth.uid() returning id into v_id"));
  assert.ok(media.includes("m.owner_id=auth.uid() and m.is_published=false"));
});
