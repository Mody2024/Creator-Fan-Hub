import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client, css] = await Promise.all([
  read("../supabase/migrations/20261110270000_raye2_notification_inbox.sql"),
  read("../src/app/notifications/page.tsx"),
  read("../src/app/notifications/notifications-client.tsx"),
  read("../src/app/notifications/raye2-notifications.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("notification inbox exposes pinned authenticated SECURITY DEFINER read RPCs", () => {
  for (const name of ["raye2_get_notifications", "raye2_get_notification_summary"]) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path\s*=\s*''/i);
    assert.match(body, /stable/i);
  }
  assert.match(migration, /grant execute on function public\.raye2_get_notifications\(integer,timestamptz,boolean\) to authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_notification_summary\(\) to authenticated/);
  assert.doesNotMatch(migration, /to anon/);
});

test("inbox is scoped to the caller, cursor-paged and unread-filterable", () => {
  const body = functionBody(migration, "raye2_get_notifications");
  assert.match(body, /n\.recipient_id = me\.uid/);
  assert.match(body, /p_before is null or n\.created_at < p_before/);
  assert.match(body, /not p_only_unread or n\.read_at is null/);
  assert.match(body, /order by n\.created_at desc/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 40\), 1\), 100\)/);
});

test("inbox and summary exclude blocked actors in both directions", () => {
  for (const name of ["raye2_get_notifications", "raye2_get_notification_summary"]) {
    const body = functionBody(migration, name);
    assert.match(body, /b\.blocker_id = me\.uid/);
    assert.match(body, /b\.blocked_id = me\.uid/);
    assert.match(body, /not exists \(select 1 from blocked bl where bl\.uid = n\.actor_id\)/);
  }
  const summary = functionBody(migration, "raye2_get_notification_summary");
  assert.match(summary, /count\(\*\) filter \(where read_at is null\)/);
  assert.match(summary, /notification_type in \('community_reaction', 'video_reaction'\)/);
  assert.match(summary, /notification_type in \('community_comment', 'video_comment'\)/);
});

test("notification surfaces use the inbox and summary RPCs with filters and paging", () => {
  assert.match(page, /rpc\("raye2_get_notifications",\{p_limit:40,p_before:null,p_only_unread:false\}\)/);
  assert.match(client, /rpc\("raye2_get_notification_summary"\)/);
  assert.match(client, /rpc\("raye2_get_notifications",\{p_limit:40,p_before:oldest,p_only_unread:false\}\)/);
  assert.match(client, /nhen-notification-filters/);
  assert.match(client, /matchesFilter/);
  assert.match(css, /nhen-notification-filters button\.active/);
});
