import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {readFileSync} from "node:fs";

const page=await readFile(new URL("../src/app/watch/[slug]/page.tsx",import.meta.url),"utf8");
const catalog=await readFile(new URL("../src/app/videos/public-videos.tsx",import.meta.url),"utf8");

test("public watch pages require native media processing to be ready",()=>{
 assert.ok(page.includes("processing_status"));
 assert.ok(page.includes('media.media_type==="video"&&media.processing_status!=="ready"'));
 assert.ok(catalog.includes('.eq("media_items.processing_status", "ready")'));
});

test("public native watch pages only resolve media from the public creator bucket",()=>{
 assert.ok(page.includes('media.storage_path?.startsWith("creator-media-public/")'));
 assert.ok(page.includes('supabase.storage.from(parts[0]).getPublicUrl'));
});

test("external YouTube embeds remain isolated from native media storage and use privacy-enhanced embeds",()=>{
 assert.ok(page.includes("youtube-nocookie.com/embed/"));
 assert.ok(page.includes('media.media_type==="video"&&media.processing_status!=="ready"'));
 assert.ok(!page.includes('supabase.storage.from("youtube")'));
});

test("public native watch pages reject malformed or traversal-like storage object segments",()=>{
 assert.ok(page.includes('parts.length<2||!parts.slice(1).every((part: string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))'));
});

test("public video catalog rejects malformed or traversal-like storage object segments",()=>{
 assert.ok(catalog.includes('parts.length < 2 || !parts.slice(1).every((part: string) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))'));
});

test("native watch URLs are restricted to the configured HTTPS Supabase origin",()=>{
 assert.ok(page.includes('parsedPublicUrl.protocol!=="https:"'));
 assert.ok(page.includes('parsedPublicUrl.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"https://invalid.local").origin'));
});

const player=await readFile(new URL("../src/app/videos/public-video-player.tsx",import.meta.url),"utf8");
const watchClient=await readFile(new URL("../src/app/watch/[slug]/watch-detail-client.tsx",import.meta.url),"utf8");

test("worker-generated public thumbnails reach the native watch player",()=>{
 assert.ok(page.includes("thumbnail_path"));
 assert.ok(page.includes('media.thumbnail_path?.startsWith("creator-media-public/")'));
 assert.ok(page.includes('parsedPoster.origin===parsedPublicUrl.origin'));
 assert.ok(page.includes("poster={poster}"));
 assert.ok(watchClient.includes("poster={props.poster}"));
 assert.ok(player.includes("poster={poster || undefined}"));
});

test("public video cards use only safe same-origin generated thumbnails",()=>{
 assert.ok(catalog.includes("thumbnail_path"));
 assert.ok(catalog.includes('media.thumbnail_path?.startsWith("creator-media-public/")'));
 assert.ok(catalog.includes("parsedPosterUrl.origin === parsedVideoUrl.origin"));
 assert.ok(catalog.includes("poster={video.poster}"));
});

test("Raye2 watch library uses the new brand shell and responsive discovery cards",()=>{
 const page=readFileSync(new URL("../src/app/watch/page.tsx",import.meta.url),"utf8");
 assert.ok(page.includes("raye2-watch-header"));
 assert.ok(page.includes("raye2-watch-hero"));
 assert.ok(page.includes("raye2-watch-grid"));
 assert.ok(page.includes("Raye2"));
 assert.ok(!page.includes("Nhen?"));
});
test("watch library only lists processed native videos and validates public storage URLs",()=>{
 const page=readFileSync(new URL("../src/app/watch/page.tsx",import.meta.url),"utf8");
 assert.ok(page.includes("processing_status"));
 assert.ok(page.includes('media.processing_status!=="ready"'));
 assert.ok(page.includes("parts.slice(1).every"));
 assert.ok(page.includes('parsed.protocol!=="https:"'));
});
