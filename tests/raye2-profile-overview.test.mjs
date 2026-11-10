import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [overviewMigration, communityMigration, profilePage, profileClient, profileCss] = await Promise.all([
  read("../supabase/migrations/20261110340000_raye2_profile_overview.sql"),
  read("../supabase/migrations/20261110350000_raye2_restore_anon_block_helper.sql"),
  read("../src/app/u/[handle]/page.tsx"),
  read("../src/app/u/[handle]/profile-client.tsx"),
  read("../src/app/u/[handle]/profile.module.css")
]);

test("the profile overview RPC is a pinned, stable, definer read granted to anon and authenticated", () => {
  assert.match(overviewMigration, /create or replace function public\.raye2_get_profile_overview\(/);
  assert.match(overviewMigration, /security definer/);
  assert.match(overviewMigration, /stable/);
  assert.match(overviewMigration, /set search_path = ''/);
  assert.match(overviewMigration, /grant execute on function public\.raye2_get_profile_overview\(text\) to anon, authenticated/);
});

test("the profile overview matches profile visibility and never counts unpublished content", () => {
  assert.match(overviewMigration, /mp\.visibility = 'public' and not public\.is_member_blocked\(mp\.user_id\)/);
  assert.match(overviewMigration, /mp\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(overviewMigration, /b\.blocker_id = \(select auth\.uid\(\)\) and b\.blocked_id = mp\.user_id/);
  assert.match(overviewMigration, /mi\.is_published = true/);
  assert.match(overviewMigration, /where status = 'published' group by author_id/);
});

test("the profile page reads the overview RPC and the client shows real, labelled stats", () => {
  assert.match(profilePage, /rpc\("raye2_get_profile_overview",\{p_handle:handle\}\)/);
  assert.match(profilePage, /overview=\{overview\}/);
  assert.match(profilePage, /video_catalog!video_catalog_media_id_fkey!inner\(/);
  assert.match(profileClient, /overview\.published_videos/);
  assert.match(profileClient, /overview\.total_views/);
  assert.match(profileClient, /overview\.total_reactions/);
  assert.match(profileClient, /overview\.is_creator&&<span className=\{styles\.creatorBadge\}/);
  assert.doesNotMatch(profileClient, /posts\.length\+videos\.length\+communityShorts\.length/);
});

test("the creator badge and privacy tag are styled", () => {
  assert.match(profileCss, /\.creatorBadge\{/);
  assert.match(profileCss, /\.privateTag\{/);
});

test("the anon community outage is repaired for both helper layers", () => {
  assert.match(communityMigration, /grant execute on function public\.is_member_blocked\(uuid\) to anon/);
  assert.match(communityMigration, /grant usage on schema private to anon/);
  assert.match(communityMigration, /grant execute on function private\.can_moderate_community\(\) to anon/);
  assert.match(communityMigration, /create or replace function public\.raye2_viewer_blocked\(/);
  assert.match(communityMigration, /security definer/);
  assert.match(communityMigration, /or public\.raye2_viewer_blocked\(user_id\)/);
  assert.match(communityMigration, /drop policy if exists "Public profiles visible unless private" on public\.member_profiles/);
});
