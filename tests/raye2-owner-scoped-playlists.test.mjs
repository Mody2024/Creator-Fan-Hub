import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261107190000_raye2_owner_scoped_video_playlists.sql",import.meta.url),"utf8");
const studio=await readFile(new URL("../src/app/creator/video-studio.tsx",import.meta.url),"utf8");

test("existing playlists are backfilled only when all linked media identifies one owner",()=>{
 assert.ok(migration.includes("count(distinct m.owner_id)=1"));
 assert.ok(migration.includes("bool_and(m.owner_id is not null)"));
 assert.ok(migration.includes("set owner_id=o.owner_id"));
});

test("playlist read and management policies are owner-scoped",()=>{
 assert.ok(migration.includes("owner_id=(select auth.uid())"));
 assert.ok(migration.includes("public.is_nhen_video_publisher()"));
 assert.ok(migration.includes("Publishers manage only their playlists"));
 assert.ok(migration.includes("Owners read their playlists and public playlists"));
});

test("playlist items can only reference the creator's own video media",()=>{
 assert.ok(migration.includes("m.owner_id=(select auth.uid())"));
 assert.ok(migration.includes("Publishers add only owned media to owned playlists"));
 assert.ok(migration.includes("Publishers remove only owned playlist items"));
});

test("studio assigns playlist ownership and continues using RLS for listing and changes",()=>{
 assert.ok(studio.includes('supabase.from("video_playlists").insert({owner_id:userData.user.id'));
 assert.ok(studio.includes('supabase.from("video_playlists").select'));
 assert.ok(studio.includes('supabase.from("video_playlists").update'));
});
