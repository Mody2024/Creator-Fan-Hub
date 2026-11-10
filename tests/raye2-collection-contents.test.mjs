import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, css] = await Promise.all([
  read("../supabase/migrations/20261110290000_raye2_collection_contents.sql"),
  read("../src/app/saved/saved-client.tsx"),
  read("../src/app/nhen-design-system.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("collection contents RPC is owner-scoped, pinned and authenticated-only", () => {
  const body = functionBody(migration, "raye2_get_collection");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /where id = p_collection_id and owner_id = v_me/);
  assert.match(migration, /revoke all on function public\.raye2_get_collection\(uuid,integer\) from public, anon/);
  assert.match(migration, /grant execute on function public\.raye2_get_collection\(uuid,integer\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_get_collection\(uuid,integer\) to anon/);
});

test("collection contents resolve published posts and videos only", () => {
  const body = functionBody(migration, "raye2_get_collection");
  assert.match(body, /cp\.status = 'published'/);
  assert.match(body, /vc\.published_at is not null/);
  assert.match(body, /mi\.is_published = true/);
  assert.match(body, /left join public\.member_profiles mp on mp\.user_id = cp\.author_id/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/);
});

test("rename and delete RPCs re-check ownership and validate input", () => {
  const rename = functionBody(migration, "raye2_update_collection");
  assert.match(rename, /update public\.raye2_collections[\s\S]*where id = p_collection_id and owner_id = v_me/);
  assert.match(rename, /char_length\(btrim\(p_name\)\) < 1 or char_length\(btrim\(p_name\)\) > 60/);
  assert.match(rename, /if not found then/);
  const del = functionBody(migration, "raye2_delete_collection");
  assert.match(del, /delete from public\.raye2_collections where id = p_collection_id and owner_id = v_me/);
  assert.match(del, /if not found then/);
  assert.match(migration, /revoke all on function public\.raye2_update_collection\(uuid,text,text\) from public, anon/);
  assert.match(migration, /revoke all on function public\.raye2_delete_collection\(uuid\) from public, anon/);
});

test("saved client opens, renames, deletes and empties collections", () => {
  assert.match(client, /rpc\("raye2_get_collection",\{p_collection_id:col\.id,p_limit:200\}\)/);
  assert.match(client, /rpc\("raye2_update_collection",\{p_collection_id:open\.id,p_name:renameValue\.trim\(\),p_description:open\.description\}\)/);
  assert.match(client, /rpc\("raye2_delete_collection",\{p_collection_id:open\.id\}\)/);
  assert.match(client, /rpc\("raye2_remove_from_collection",\{p_collection_id:open\.id,p_kind:item\.item_kind,p_item_id:item\.item_id\}\)/);
  assert.match(css, /\.nhen-collection-detail-head/);
});
