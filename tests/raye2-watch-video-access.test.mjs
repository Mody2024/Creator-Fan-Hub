import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [page,player]=await Promise.all([
 readFile(new URL("../src/app/watch/[slug]/page.tsx",import.meta.url),"utf8"),
 readFile(new URL("../src/app/videos/public-video-player.tsx",import.meta.url),"utf8")
]);

test("public watch route only resolves published catalog entries",()=>{
 assert.ok(page.includes('.not("published_at","is",null)'));
 assert.ok(page.includes("if(!media?.is_published"));
 assert.ok(page.includes('["video","youtube"].includes(media.media_type)'));
});

test("native video is never exposed until the processing worker marks it ready",()=>{
 assert.ok(page.includes('media.media_type==="video"&&media.processing_status!=="ready"'));
 assert.ok(page.includes('media.storage_path?.startsWith("creator-media-public/")'));
});

test("native video storage paths are constrained to safe object segments",()=>{
 assert.ok(page.includes("parts.length<2"));
 assert.ok(page.includes("/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/"));
 assert.ok(page.includes('parsedPublicUrl.protocol!=="https:"'));
 assert.ok(page.includes("parsedPublicUrl.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL"));
});

test("poster URLs must use the same trusted Supabase origin as the video",()=>{
 assert.ok(page.includes('media.thumbnail_path?.startsWith("creator-media-public/")'));
 assert.ok(page.includes("parsedPoster.origin===parsedPublicUrl.origin"));
});

test("YouTube embeds use an explicit hostname allowlist and privacy-enhanced origin",()=>{
 assert.ok(page.includes('["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(source.hostname)'));
 assert.ok(page.includes('"https://www.youtube-nocookie.com/embed/"+id'));
 assert.ok(page.includes("/^[A-Za-z0-9_-]{11}$/"));
});

test("native player provides controls, metadata preload, inline playback and retry feedback",()=>{
 assert.ok(player.includes("controls preload=\"metadata\" playsInline"));
 assert.ok(player.includes('onError={() => setFailed(true)}'));
 assert.ok(player.includes("setAttempt(value => value + 1)"));
 assert.ok(player.includes("loadedmetadata"));
 assert.ok(player.includes("Math.min(startAt"));
});

test("player exposes loading and failure states to assistive technology",()=>{
 assert.ok(player.includes('role="status"'));
 assert.ok(player.includes('aria-live="polite"'));
 assert.ok(player.includes("Preparing your video"));
});
