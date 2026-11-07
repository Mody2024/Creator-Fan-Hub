import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

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
 assert.ok(page.includes('parts.length<2||!parts.slice(1).every(part=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))'));
});

test("public video catalog rejects malformed or traversal-like storage object segments",()=>{
 assert.ok(catalog.includes('parts.length < 2 || !parts.slice(1).every((part: string) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))'));
});
