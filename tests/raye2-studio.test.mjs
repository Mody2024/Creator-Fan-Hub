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
  assert.ok(page.includes('["owner", "admin", "creator", "editor"].includes(role)'));
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
