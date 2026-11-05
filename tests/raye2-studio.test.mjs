import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Raye2 Creator Studio is authenticated and role-gated on the server", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.ok(page.includes("supabase.auth.getClaims()"));
  assert.ok(page.includes('.from("creator_admins")'));
  assert.ok(page.includes('.eq("active", true)'));
  assert.ok(page.includes('["owner", "admin", "creator", "editor", "moderator", "analyst"]'));
  assert.ok(page.includes('redirect("/creator/login?access=restricted")'));
});

test("Creator Studio metrics use real creator media and published video catalog data", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.ok(page.includes('rpc("get_creator_media", { p_limit: 200 })'));
  assert.ok(page.includes('.from("video_catalog")'));
  assert.ok(page.includes("publishedMedia"));
  assert.ok(page.includes("draftMedia"));
  assert.ok(page.includes("publishedVideos"));
  assert.ok(page.includes("mediaUnavailable"));
  assert.ok(page.includes("catalogUnavailable"));
});

test("Creator Studio only exposes tools permitted by the assigned role", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.ok(page.includes('["owner", "admin", "creator"].includes(role)'));
  assert.ok(!page.includes('["owner", "admin", "creator", "editor"].includes(role)'));
  assert.ok(page.includes('role === "editor"'));
  assert.ok(page.includes("Editorial review"));
  assert.ok(page.includes("official uploads and publishing remain restricted"));
  assert.ok(page.includes('["owner", "admin", "moderator"].includes(role)'));
  assert.ok(page.includes('["owner", "admin", "analyst"].includes(role)'));
  assert.ok(page.includes('href="/creator"'));
  assert.ok(page.includes('href="/creator/analytics"'));
  assert.ok(page.includes('href="/creator/community"'));
});

test("Creator Studio supports Arabic RTL and responsive Raye2 styling", async () => {
  const [page, css] = await Promise.all([
    read("../src/app/raye2/studio/page.tsx"),
    read("../src/app/raye2/studio/studio.module.css")
  ]);
  assert.ok(page.includes('dir={isArabic ? "rtl" : "ltr"}'));
  assert.ok(page.includes('lang={locale}'));
  assert.ok(css.includes("@media(max-width:560px)"));
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(!page.includes("NHEN"));
});


test("Raye2 Creator Studio grants publishing access to the assigned creator role", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.ok(page.includes('"creator"'));
  assert.ok(page.includes('["owner", "admin", "creator", "editor"].includes(role)'));
});

test("legacy creator management tools now inherit the Raye2 workspace theme and navigation", async () => {
  const [dashboard, analytics, moderation, css] = await Promise.all([
    read("../src/app/creator/page.tsx"),
    read("../src/app/creator/analytics/page.tsx"),
    read("../src/app/creator/community/page.tsx"),
    read("../src/app/globals.css")
  ]);
  assert.ok(dashboard.includes('className="dashboard-shell raye2-creator-shell"'));
  assert.ok(dashboard.includes('href="/raye2/studio"'));
  assert.ok(analytics.includes('className="dashboard-shell raye2-creator-shell"'));
  assert.ok(analytics.includes('href="/raye2/studio"'));
  assert.ok(moderation.includes('className="dashboard-shell raye2-creator-shell"'));
  assert.ok(moderation.includes('href="/raye2/studio"'));
  assert.ok(css.includes(".raye2-creator-shell{"));
  assert.ok(css.includes("--accent:#79b1ff"));
  assert.ok(css.includes("@media(max-width:480px){.raye2-creator-shell"));
});

test("creator workspace entry pages no longer display the obsolete NHEN identity", async () => {
  const [dashboard, analytics, moderation] = await Promise.all([
    read("../src/app/creator/page.tsx"),
    read("../src/app/creator/analytics/page.tsx"),
    read("../src/app/creator/community/page.tsx")
  ]);
  assert.ok(!dashboard.includes("NHEN"));
  assert.ok(!analytics.includes("NHEN"));
  assert.ok(!moderation.includes("NHEN"));
});


test("Raye2 media, video studio and team surfaces use the new platform identity", async () => {
  const [media, video, team, analyticsExport, css] = await Promise.all([
    read("../src/app/creator/media-library.tsx"),
    read("../src/app/creator/video-studio.tsx"),
    read("../src/app/creator/team/page.tsx"),
    read("../src/app/creator/analytics/analytics-export.tsx"),
    read("../src/app/globals.css")
  ]);
  assert.ok(media.includes("Raye2 free storage safety limit"));
  assert.ok(media.includes("Raye2 manages its watch page"));
  assert.ok(!media.includes("NHEN"));
  assert.ok(video.includes('className="nhen-video-studio raye2-video-studio"'));
  assert.ok(video.includes("Mini's"));
  assert.ok(team.includes('className="dashboard-shell raye2-creator-shell"'));
  assert.ok(team.includes("Raye2"));
  assert.ok(!team.includes("Nhen?"));
  assert.ok(analyticsExport.includes("raye2-video-analytics.csv"));
  assert.ok(css.includes(".raye2-creator-shell .nhen-team-workspace"));
});


test("editor workspace copy does not grant official media publishing controls", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.ok(page.includes('const canPublish = ["owner", "admin", "creator"].includes(role)'));
  assert.ok(page.includes('{canPublish && <article'));
  assert.ok(page.includes('role === "editor"'));
  assert.ok(page.includes("Editorial workspace is being prepared"));
});


test("video publishing studio validates metadata before writing to the catalog", async () => {
  const video = await read("../src/app/creator/video-studio.tsx");
  assert.ok(video.includes("Number.isSafeInteger(parsedDuration)"));
  assert.ok(video.includes("parsedDuration<1||parsedDuration>86400"));
  assert.ok(video.includes("cleanDescription.length>5000"));
  assert.ok(video.includes("cleanCategory.length>40"));
  assert.ok(video.includes("cleanTags.length>12||cleanTags.some(tag=>tag.length>40)"));
  assert.ok(video.includes("[...new Set(tags.split"));
  assert.ok(video.includes("duration_seconds:parsedDuration"));
  assert.ok(video.includes("durationError:"));
  assert.ok(video.includes("tagsError:"));
});
