import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261107180000_raye2_owner_scoped_video_publishing.sql",import.meta.url),"utf8");
const studio=await readFile(new URL("../src/app/creator/video-studio.tsx",import.meta.url),"utf8");

test("video catalog RPC requires authenticated official publisher role",()=>{
 assert.ok(migration.includes("v_user uuid:=auth.uid()"));
 assert.ok(migration.includes("not public.is_nhen_video_publisher()"));
 assert.ok(migration.includes("grant execute on function public.save_raye2_video_catalog"));
 assert.ok(migration.includes("from public,anon"));
});

test("video catalog writes are restricted to media owned by the caller",()=>{
 assert.ok(migration.includes("m.owner_id=v_user"));
 assert.ok(migration.includes("media_not_owned_or_not_video"));
 assert.ok(migration.includes("m.owner_id=(select auth.uid())"));
});

test("public watch pages require the underlying media to be published",()=>{
 assert.ok(migration.includes("if coalesce(p_publish,false) and not v_media.is_published"));
 assert.ok(migration.includes("publish the media asset before publishing its watch page"));
 assert.ok(migration.includes("published_at"));
});

test("creator studio saves through the guarded RPC, not direct table upsert",()=>{
 assert.ok(studio.includes('supabase.rpc("save_raye2_video_catalog"'));
 assert.ok(studio.includes("p_publish:publishedAt"));
 assert.ok(!studio.includes('supabase.from("video_catalog").upsert'));
});


test("video studio loads authoritative processing state before enabling publication",()=>{
 assert.ok(studio.includes('rpc("get_creator_media_processing_status"'));
 assert.ok(studio.includes('asset.processing_status!=="ready"'));
 assert.ok(studio.includes('disabled={!canPublish&&!publishedAt}'));
 assert.ok(studio.includes("processing_error"));
});

test("video studio supports removing the selected video from an owned playlist",()=>{
 assert.ok(studio.includes("async function removeFromPlaylist(playlistId:string)"));
 assert.ok(studio.includes('.from("video_playlist_items").delete().eq("playlist_id",playlistId).eq("media_id",selected)'));
 assert.ok(studio.includes("{t.remove}"));
});


test("video studio only offers assets returned by the owner-scoped processing status RPC",()=>{
 assert.ok(studio.includes("rawAssets.filter(asset=>processingById.has(asset.media_id))"));
 assert.ok(studio.includes('rpc("get_creator_media_processing_status"'));
});

test("video studio English and Arabic labels include processing and playlist actions",()=>{
 for(const label of ["processingError","processingReady","processingWaiting","processingRunning","processingFailed","remove","removed"]) assert.ok(studio.includes(label));
 assert.ok(studio.includes('removed:"Video removed from playlist.",savedPublic:'));
 assert.ok(studio.includes('removed:"تمت إزالة الفيديو من القائمة.",savedPublic:'));
});

test("public watch-page UI checks slug conflicts before invoking the guarded publishing RPC",()=>{
 assert.ok(studio.includes('eq("slug",safeSlug).neq("media_id",selected).maybeSingle()'));
 assert.ok(studio.includes("if(slugOwner)throw new Error(t.slugConflict)"));
 assert.ok(studio.includes('rpc("save_raye2_video_catalog"'));
});
