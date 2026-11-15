import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client, playlistPage] = await Promise.all([
  read("../supabase/migrations/20261111010000_raye2_profile_collections.sql"),
  read("../src/app/u/[handle]/page.tsx"),
  read("../src/app/u/[handle]/profile-client.tsx"),
  read("../src/app/watch/playlists/[slug]/page.tsx")
]);

test("profile collections RPC returns Moments and playlists with privacy gating", () => {
  assert.match(migration, /function public\.raye2_get_profile_collections\(p_handle text, p_limit integer/);
  assert.match(migration, /mp\.visibility = 'public' and not public\.is_member_blocked\(mp\.user_id\)/);
  assert.match(migration, /cp\.is_moment = true and cp\.status = 'published'/);
  assert.match(migration, /cp\.expires_at is null or cp\.expires_at > now\(\)/);
  assert.match(migration, /from public\.video_playlists p/);
  assert.match(migration, /p\.is_published = true/);
  assert.match(migration, /'moments', coalesce/);
  assert.match(migration, /'playlists', coalesce/);
});

test("the profile page fetches collections and the client renders the missing tabs", () => {
  assert.match(page, /rpc\("raye2_get_profile_collections",\{p_handle:handle,p_limit:24\}\)/);
  assert.match(client, /moments\?:ProfileMoment\[\];playlists\?:ProfilePlaylist\[\]/);
  assert.match(client, /id="profile-moments"/);
  assert.match(client, /id="profile-playlists"/);
  assert.match(client, /href="#profile-moments"/);
  assert.match(client, /href="#profile-playlists"/);
});

test("playlist cards link to a real published-playlist route", () => {
  assert.match(client, /href=\{"\/watch\/playlists\/"\+list\.slug\}/);
  assert.match(playlistPage, /\.eq\("slug", slug\)/);
  assert.match(playlistPage, /\.eq\("is_published", true\)/);
  assert.match(playlistPage, /creator-media-public\//);
});
