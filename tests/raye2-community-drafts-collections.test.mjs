import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, communityClient, communityPage, savedClient] = await Promise.all([
  read("../supabase/migrations/20261110180000_raye2_community_drafts_scheduling_collections.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/community/page.tsx"),
  read("../src/app/saved/saved-client.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const schedulingFunctions = [
  "raye2_publish_due_community_posts",
  "raye2_save_community_draft",
  "raye2_schedule_community_post",
  "raye2_publish_community_post"
];
const collectionFunctions = [
  "raye2_create_collection",
  "raye2_add_to_collection",
  "raye2_remove_from_collection",
  "raye2_get_my_collections"
];

test("draft/scheduling RPCs are guarded SECURITY DEFINER functions with pinned search_path", () => {
  for (const name of schedulingFunctions) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
  }
  // The caller-bound staging functions require authentication.
  for (const name of ["raye2_save_community_draft", "raye2_schedule_community_post", "raye2_publish_community_post"]) {
    assert.match(functionBody(migration, name), /v_me uuid := \(select auth\.uid\(\)\)/i, name);
    assert.match(functionBody(migration, name), /v_me is null/i, name);
    assert.match(functionBody(migration, name), /errcode\s*=\s*'42501'/i, name);
  }
});

test("drafts and scheduling only ever touch the caller's own posts", () => {
  for (const name of ["raye2_save_community_draft", "raye2_schedule_community_post", "raye2_publish_community_post"]) {
    assert.match(functionBody(migration, name), /author_id\s*=\s*v_me/i, name);
  }
  assert.match(functionBody(migration, "raye2_schedule_community_post"), /p_publish_at\s*<=\s*now\(\)/i);
  assert.match(migration, /scheduled time must be in the future/);
});

test("the scheduled status and publish time are constrained at the schema level", () => {
  assert.match(migration, /check \(status in \('pending','scheduled','published','rejected','removed'\)\)/);
  assert.match(migration, /add column if not exists publish_at timestamptz/);
  assert.match(migration, /community_posts_publish_at_check[\s\S]*publish_at is null or status = 'scheduled'/);
  assert.match(migration, /create index if not exists community_posts_publish_idx/);
});

test("due scheduled posts are promoted only when their publish time has arrived", () => {
  const body = functionBody(migration, "raye2_publish_due_community_posts");
  assert.match(body, /status = 'scheduled' and publish_at is not null and publish_at <= now\(\)/i);
  assert.match(body, /set status = 'published'/i);
  // The lazy promoter is readable by any visitor so a public feed can self-heal.
  assert.match(migration, /grant execute on function public\.raye2_publish_due_community_posts\(\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_publish_due_community_posts\(\) from public/);
});

test("staging RPCs are granted to authenticated only", () => {
  for (const name of ["raye2_save_community_draft", "raye2_schedule_community_post", "raye2_publish_community_post"]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`), name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`), name);
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|public)`), name);
  }
});

test("collections are owner-scoped tables with RLS and no anon access", () => {
  assert.match(migration, /alter table public\.raye2_collections enable row level security/);
  assert.match(migration, /alter table public\.raye2_collection_items enable row level security/);
  assert.match(migration, /revoke all on public\.raye2_collections, public\.raye2_collection_items from anon, authenticated/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /create policy "Members manage their own collections"/);
});

test("collection items may only reference the caller's own bookmarks", () => {
  const add = functionBody(migration, "raye2_add_to_collection");
  assert.match(add, /community_bookmarks where post_id = p_item_id and user_id = v_me/);
  assert.match(add, /video_bookmarks where media_id = p_item_id and user_id = v_me/);
  assert.match(add, /collection not found/);
  assert.match(migration, /save the post before adding it to a collection/);
  assert.match(migration, /save the video before adding it to a collection/);
});

test("collection RPCs are granted to authenticated only", () => {
  for (const name of collectionFunctions) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`), name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`), name);
  }
});

test("the community client wires drafts, scheduling and collection RPCs", () => {
  assert.match(communityClient, /supabase\.rpc\("raye2_schedule_community_post"/);
  assert.match(communityClient, /supabase\.rpc\("raye2_publish_community_post"/);
  assert.match(communityClient, /supabase\.rpc\("raye2_create_collection"/);
  assert.match(communityClient, /supabase\.rpc\("raye2_add_to_collection"/);
  assert.match(communityClient, /supabase\.rpc\("raye2_get_my_collections"/);
  assert.match(communityClient, /status:\s*"scheduled"/);
  assert.match(communityClient, /t\.saveDraft/);
  assert.match(communityClient, /t\.schedulePost/);
});

test("the community page promotes due scheduled posts before reading the feed", () => {
  assert.match(communityPage, /supabase\.rpc\("raye2_publish_due_community_posts"\)/);
  assert.match(communityPage, /\.eq\("status", "published"\)/);
});

test("the saved library groups items into collections via the guarded RPCs", () => {
  assert.match(savedClient, /supabase\.rpc\("raye2_get_my_collections"/);
  assert.match(savedClient, /supabase\.rpc\("raye2_create_collection"/);
  assert.match(savedClient, /supabase\.rpc\("raye2_add_to_collection"/);
  assert.match(savedClient, /p_kind:item\.kind/);
});
