import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, index, detail, css] = await Promise.all([
  read("../supabase/migrations/20261110280000_raye2_group_spaces.sql"),
  read("../src/app/groups/page.tsx"),
  read("../src/app/groups/[slug]/page.tsx"),
  read("../src/app/groups/groups.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("group directory exposes pinned public SECURITY DEFINER read RPCs", () => {
  for (const name of ["raye2_list_public_groups", "raye2_get_group"]) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path\s*=\s*''/i);
    assert.match(body, /stable/i);
  }
  assert.match(migration, /grant execute on function public\.raye2_list_public_groups\(integer,text\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_group\(text\) to anon, authenticated/);
});

test("the roster RPC is authenticated-only and member-gated", () => {
  const body = functionBody(migration, "raye2_get_group_members");
  assert.match(body, /security definer/i);
  assert.match(body, /raye2_is_group_member\(p_group_id\) or public\.raye2_is_group_manager\(p_group_id\)/);
  assert.match(migration, /revoke all on function public\.raye2_get_group_members\(uuid,integer\) from public, anon/);
  assert.match(migration, /grant execute on function public\.raye2_get_group_members\(uuid,integer\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_get_group_members\(uuid,integer\) to anon/);
});

test("directory lists only public joinable groups with counts and search", () => {
  const body = functionBody(migration, "raye2_list_public_groups");
  assert.match(body, /g\.visibility = 'public'/);
  assert.match(body, /g\.status in \('active', 'read_only'\)/);
  assert.match(body, /g\.expires_at is null or g\.expires_at > now\(\)/);
  assert.match(body, /g\.name ilike '%' \|\| btrim\(p_search\) \|\| '%'/);
  assert.match(body, /coalesce\(mem\.member_count, 0\)/);
  assert.match(body, /coalesce\(msg\.message_count, 0\)/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 40\), 1\), 100\)/);
});

test("group detail hides private groups from non-members and reports membership", () => {
  const body = functionBody(migration, "raye2_get_group");
  assert.match(body, /t\.visibility = 'public' and t\.status in \('active', 'read_only'\)/);
  assert.match(body, /public\.raye2_is_group_member\(t\.id\)/);
  assert.match(body, /mine\.role as my_role/);
  assert.match(body, /mine\.user_id = \(select auth\.uid\(\)\)/);
});

test("group surfaces are bilingual, RTL-aware and member-aware", () => {
  assert.match(index, /rpc\("raye2_list_public_groups",\{p_limit:48,p_search:search\|\|null\}\)/);
  assert.match(index, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(detail, /rpc\("raye2_get_group",\{p_slug:slug\}\)/);
  assert.match(detail, /rpc\("raye2_get_group_members",\{p_group_id:group\.id,p_limit:100\}\)/);
  assert.match(detail, /canViewRoster=isMember\|\|isManager/);
  assert.match(detail, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(css, /\.raye2-groups-grid/);
});
