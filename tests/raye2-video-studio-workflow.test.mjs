
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/app/creator/video-studio.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");
test("Raye2 video studio shows asset readiness metrics and catalog filtering",()=>{
 assert.ok(source.includes("raye2-video-overview"));
 assert.ok(source.includes("readySources"));
 assert.ok(source.includes("processingSources"));
 assert.ok(source.includes("draftVideos"));
 assert.ok(source.includes("catalogSearch"));
 assert.ok(source.includes("catalogFilter"));
 assert.ok(source.includes("aria-pressed={selected===v.media_id}"));
});
test("video catalog filtering searches title metadata and keeps draft/public filters distinct",()=>{
 assert.ok(source.includes("searchable.includes(query)"));
 assert.ok(source.includes('catalogFilter==="published"?!!video.published_at:!video.published_at'));
 assert.ok(css.includes(".raye2-video-filters button.active"));
 assert.ok(css.includes("@media(max-width:850px){.raye2-creator-shell .raye2-video-overview"));
});

test("publishing readiness makes source visibility, processing and slug uniqueness explicit",()=>{
 assert.ok(source.includes("publicationChecks"));
 assert.ok(source.includes("canPublish"));
 assert.ok(source.includes("sourceIsPublic"));
 assert.ok(source.includes("sourceIsReady"));
 assert.ok(source.includes('eq("slug",safeSlug).neq("media_id",selected).maybeSingle()'));
 assert.ok(source.includes("raye2-publish-readiness"));
 assert.ok(source.includes('disabled={!canPublish&&!publishedAt}'));
 assert.ok(css.includes(".raye2-publish-readiness li[data-ready=\"true\"]"));
});

test("video studio resolves owner-safe source and managed thumbnail previews",()=>{
 assert.ok(source.includes("createSignedUrl(objectPath,300)"));
 assert.ok(source.includes("getPublicUrl(objectPath)"));
 assert.ok(source.includes("thumbnail_url"));
 assert.ok(source.includes("raye2-watch-preview"));
 assert.ok(source.includes("raye2-video-row-thumb"));
});
test("video metadata editor exposes live watch URL and bounded character counters",()=>{
 assert.ok(source.includes("description.length.toLocaleString(locale)"));
 assert.ok(source.includes(" / 5,000 "));
 assert.ok(source.includes("tags.split(",").map(x=>x.trim()).filter(Boolean).length"));
 assert.ok(source.includes("/watch/{normalizedSlug||"));
});

test("video studio separates private draft saving from publication",()=>{
 assert.ok(source.includes("saveDraft:"));
 assert.ok(source.includes("publishNow:"));
 assert.ok(source.includes("onClick={()=>void save(false)}"));
 assert.ok(source.includes("onClick={()=>void save(true)}"));
 assert.ok(source.includes("disabled={busy||!selected||!canPublish}"));
 assert.ok(source.includes("disabled={busy||!selected||publishedAt}"));
});
