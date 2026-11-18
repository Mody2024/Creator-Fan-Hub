import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("social link management exposes confirmed deletion and persisted ordering", async () => {
  const source = await read("../src/app/creator/event-social-management.tsx");
  assert.ok(source.includes('s.rpc("delete_creator_social_link",{p_link_id:link.link_id})'));
  assert.ok(source.includes("window.confirm("));
  assert.ok(source.includes('s.rpc("reorder_creator_social_links",{p_link_ids:next.map(item=>item.link_id)})'));
  assert.ok(source.includes('s.rpc("get_creator_social_links",{p_limit:200})'));
  assert.ok(source.includes("Move up ↑"));
  assert.ok(source.includes("Move down ↓"));
  assert.ok(source.includes("Permanently remove"));
  assert.ok(source.includes("stale_order"));
  assert.ok(source.includes('finally {setWorking("");}'));
});

test("social link delete and reorder RPCs are active-creator-only and audit changes", async () => {
  const sql = (await Promise.all([
    read("../supabase/migrations/20261031211224_creator_social_link_management.sql"),
    read("../supabase/migrations/20261031211234_creator_social_link_ordering.sql")
  ])).join("\\n");
  for (const name of ["delete_creator_social_link","reorder_creator_social_links"]) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(start >= 0);
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end + 3);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path=''/i);
    assert.match(body, /auth\.uid\(\) is null or not public\.is_active_creator\(\)/i);
  }
  assert.match(sql,/revoke all on function public\.delete_creator_social_link\(uuid\) from public,anon/i);
  assert.match(sql,/revoke all on function public\.reorder_creator_social_links\(uuid\[\]\) from public,anon/i);
  assert.match(sql,/grant execute on function public\.delete_creator_social_link\(uuid\) to authenticated/i);
  assert.match(sql,/grant execute on function public\.reorder_creator_social_links\(uuid\[\]\) to authenticated/i);
  assert.ok(sql.includes("'social_link.deleted'"));
  assert.ok(sql.includes("'social_links.reordered'"));
  assert.ok(sql.includes("'stale_order'"));
});
