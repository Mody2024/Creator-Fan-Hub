import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { validateSiteConfig } from "../src/lib/site-config.mjs";
import { publishSiteConfig } from "../src/lib/publish-site-config.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/rls-policies.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../docs/BACKEND-SECURITY.md", import.meta.url), "utf8");
const publicGateMigration = await readFile(new URL("../supabase/migrations/20261031213109_fail_closed_optional_idea_submissions.sql", import.meta.url), "utf8");
const communityRoleMigration = await readFile(new URL("../supabase/migrations/20261101001700_nhen_moderation_role_hardening.sql", import.meta.url), "utf8");

test("public page contains the expected primary sections", () => {
  for (const id of ["home", "ideas", "vote", "community", "latest"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing section: ${id}`);
  }
});

test("demo interactions clearly disclose that data is not persisted", () => {
  assert.match(html, /no vote is sent or stored/i);
  assert.match(html, /does not send or save your idea/i);
  assert.match(html, /not been sent or saved/i);
});

test("creator signature exists in the shared footer", () => {
  assert.match(html, /MADE BY ALMUDDATHTHIR/);
});

test("page supports responsive layout and reduced motion", () => {
  assert.match(html, /@media\s*\(max-width:\s*520px\)/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
});

test("database policies do not grant public write access", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on/i);
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)\s+on\s+public\.poll_votes\s+to\s+anon/i);
});

test("security plan forbids exposing server-only secrets to the browser", () => {
  assert.match(security, /Never expose a Supabase secret\/service key/i);
  assert.match(security, /server-verified session/i);
});


test("unpublished drafts are separated from the public snapshot", () => {
  assert.match(schema, /create table if not exists public\.site_config_drafts/i);
  assert.match(schema, /create table if not exists public\.published_site_config/i);
  assert.match(sql, /site_config_drafts intentionally has no client-facing policies/i);
  assert.match(sql, /on public\.published_site_config for select/i);
});

test("a vote option must belong to the same poll", () => {
  assert.match(schema, /foreign key \(poll_id, option_id\)[\s\S]*references public\.poll_options\(poll_id, id\)/i);
});


const validConfig = {
  schemaVersion: 1,
  identity: { siteName: "Creator Community", tagline: "Help shape what comes next.", logoMediaId: null, mascotMediaId: null, narrationMediaId: null, narrationText: "Welcome to the community.", narrationAutoPlay: true },
  appearance: { theme: "obsidian", accent: "#d6ff72", colorMode: "dark", motion: "full" },
  layout: {
    sectionOrder: ["hero", "ideas", "poll", "events", "community"],
    visibleSections: ["hero", "ideas", "poll", "events", "community"]
  },
  hero: { title: "Your next favorite video starts here.", body: "Vote on ideas.", mediaId: null, overlay: 0.4, muted: true, loop: true },
  socialLinkIds: [],
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false },
  maintenance: { enabled: false, message: "We will be back soon." }
};

test("valid site configuration is accepted", () => {
  const result = validateSiteConfig(validConfig);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("configuration validator rejects unsupported theme and unsafe layout keys", () => {
  const invalid = structuredClone(validConfig);
  invalid.appearance.theme = "untrusted-css";
  invalid.layout.visibleSections = ["hero", "admin-script"];
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "appearance.theme"));
  assert.ok(result.errors.some((error) => error.path === "layout.visibleSections"));
});

test("configuration validator accepts narration preferences and rejects invalid narration values", () => {
  const invalid = structuredClone(validConfig);
  invalid.identity.narrationText = "x".repeat(1601);
  invalid.identity.narrationAutoPlay = "yes";
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "identity.narrationText"));
  assert.ok(result.errors.some((error) => error.path === "identity.narrationAutoPlay"));
});

test("configuration validator rejects malformed feature flags and invalid overlay", () => {
  const invalid = structuredClone(validConfig);
  invalid.featureFlags.polls = "yes";
  invalid.hero.overlay = 2;
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "featureFlags.polls"));
  assert.ok(result.errors.some((error) => error.path === "hero.overlay"));
});


test("configuration validator rejects unknown properties and malformed media IDs", () => {
  const invalid = structuredClone(validConfig);
  invalid.adminScript = "not allowed";
  invalid.identity.logoMediaId = "   ";
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "$.adminScript"));
  assert.ok(result.errors.some((error) => error.path === "identity.logoMediaId"));
});

test("configuration validator rejects duplicate social link IDs", () => {
  const invalid = structuredClone(validConfig);
  invalid.socialLinkIds = ["social-1", "social-1"];
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "socialLinkIds"));
});

test("published configuration history is private to server operations", async () => {
  const policy = await readFile(new URL("../supabase/rls-policies.sql", import.meta.url), "utf8");
  assert.match(policy, /alter table public\.published_site_config_versions enable row level security/i);
  assert.match(policy, /revoke all on[\s\S]*published_site_config_versions[\s\S]*from anon, authenticated/i);
});


test("publishing refuses missing actor identity", async () => {
  const result = await publishSiteConfig({
    repository: { getDraftRevision: async () => ({ revision: 1 }), publishAtomically: async () => ({ publishedVersion: 1 }) },
    config: validConfig,
    expectedDraftRevision: 1,
    actorId: ""
  });
  assert.deepEqual(result, { ok: false, code: "unauthorized" });
});

test("publishing rejects invalid configuration before database writes", async () => {
  let writes = 0;
  const invalid = structuredClone(validConfig);
  invalid.appearance.theme = "unknown";
  const result = await publishSiteConfig({
    repository: {
      getDraftRevision: async () => ({ revision: 1 }),
      publishAtomically: async () => { writes += 1; return { publishedVersion: 1 }; }
    },
    config: invalid,
    expectedDraftRevision: 1,
    actorId: "trusted-user-id"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_config");
  assert.equal(writes, 0);
});

test("publishing rejects stale draft revisions", async () => {
  let writes = 0;
  const result = await publishSiteConfig({
    repository: {
      getDraftRevision: async () => ({ revision: 3 }),
      publishAtomically: async () => { writes += 1; return { publishedVersion: 2 }; }
    },
    config: validConfig,
    expectedDraftRevision: 2,
    actorId: "trusted-user-id"
  });
  assert.deepEqual(result, { ok: false, code: "revision_conflict", currentRevision: 3 });
  assert.equal(writes, 0);
});

test("publishing reports transaction conflicts instead of claiming success", async () => {
  const result = await publishSiteConfig({
    repository: {
      getDraftRevision: async () => ({ revision: 3 }),
      publishAtomically: async () => ({ conflict: true, currentRevision: 4 })
    },
    config: validConfig,
    expectedDraftRevision: 3,
    actorId: "trusted-user-id"
  });
  assert.deepEqual(result, { ok: false, code: "revision_conflict", currentRevision: 4 });
});

test("publishing returns success only after the adapter reports a committed version", async () => {
  let received;
  const result = await publishSiteConfig({
    repository: {
      getDraftRevision: async () => ({ revision: 7 }),
      publishAtomically: async (input) => {
        received = input;
        return { publishedVersion: 4, publishedAt: "2026-10-26T16:00:00.000Z" };
      }
    },
    config: validConfig,
    expectedDraftRevision: 7,
    actorId: "trusted-user-id"
  });
  assert.equal(result.ok, true);
  assert.equal(result.publishedVersion, 4);
  assert.equal(received.expectedDraftRevision, 7);
  assert.equal(received.actorId, "trusted-user-id");
});

test("public idea submission fails closed without a primary published config", () => {
  assert.ok(publicGateMigration.includes("if not exists ("));
  assert.ok(publicGateMigration.includes("from public.published_site_config c"));
  assert.ok(publicGateMigration.includes("config_key = 'primary'"));
  assert.ok(publicGateMigration.includes("maintenance_mode"));
  assert.ok(publicGateMigration.includes("featureFlags,ideas"));
  assert.ok(publicGateMigration.includes("ideas_unavailable"));
  assert.ok(publicGateMigration.includes("revoke all on function public.submit_public_idea(text,text,text,text) from public"));
});


test("security-definer migration functions pin search_path and explicitly manage grants", async () => {
  const files = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const migrations = files.filter((name) => name.endsWith(".sql"));
  let functionCount = 0;
  for (const name of migrations) {
    const sql = await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
    const lower = sql.toLowerCase();
    let cursor = 0;
    while ((cursor = lower.indexOf("security definer", cursor)) !== -1) {
      const start = lower.lastIndexOf("create or replace function", cursor);
      assert.ok(start >= 0, name + ": SECURITY DEFINER must belong to a function definition");
      const bodyStart = lower.indexOf("$$", cursor);
      const bodyEnd = bodyStart < 0 ? -1 : lower.indexOf("$$;", bodyStart + 2);
      const statement = sql.slice(start, bodyEnd < 0 ? undefined : bodyEnd + 3);
      const signatureStart = start + "create or replace function".length;
      const signatureEnd = lower.indexOf("(", signatureStart);
      assert.ok(signatureEnd > signatureStart, name + ": function signature must be parseable");
      const functionName = sql.slice(signatureStart, signatureEnd).trim();
      functionCount += 1;
      assert.match(statement, /set\s+search_path\s*=\s*\x27\x27/i, name + ": " + functionName + " must pin empty search_path");
      assert.ok(lower.includes("revoke all on function " + functionName.toLowerCase()), name + ": " + functionName + " must revoke default grants");
      assert.ok(lower.includes("grant execute on function " + functionName.toLowerCase()), name + ": " + functionName + " must grant execution explicitly");
      cursor += "security definer".length;
    }
  }
  assert.ok(functionCount >= 15, "expected broad RPC coverage, found " + functionCount);
});
test("Supabase migration versions are unique and sortable", async () => {
  const files = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const migrations = files.filter((name) => /^\\d{14}_.+\\.sql$/.test(name));
  const versions = migrations.map((name) => name.slice(0, 14));
  assert.equal(new Set(versions).size, versions.length, "duplicate migration version found");
  assert.deepEqual(versions, [...versions].sort(), "migration filenames must sort chronologically");
});




test("Nhen bilingual identity and logo studio are wired into public and creator experiences", async () => {
  const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const config = await readFile(new URL("../src/lib/public-site-config.ts", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/app/creator/creator-settings.tsx", import.meta.url), "utf8");
  const studio = await readFile(new URL("../src/app/creator/logo-studio.tsx", import.meta.url), "utf8");
  const design = await readFile(new URL("../src/app/nhen-design-system.css", import.meta.url), "utf8");
  assert.match(page, /Nhen\?/);
  assert.match(page, /نهين؟/);
  assert.match(page, /portal-wordmark/);
  assert.match(config, /siteName: "Nhen\?"/);
  assert.match(settings, /LogoStudio/);
  assert.match(settings, /Nhen\? \/ نهين؟/);
  assert.match(studio, /backgroundRemoved/);
  assert.match(studio, /creator-media-private/);
  assert.match(studio, /removeBackground/);
  assert.match(design, /nhen-wordmark-copy/);
  assert.match(design, /nhen-logo-preview/);
});


test("Nhen theme accent reaches the bilingual brand and creator defaults", async () => {
  const settings = await readFile(new URL("../src/app/creator/creator-settings.tsx", import.meta.url), "utf8");
  const design = await readFile(new URL("../src/app/nhen-design-system.css", import.meta.url), "utf8");
  assert.match(settings, /accent: "#C8FF4D"/);
  assert.match(design, /\.site, \.maintenance\s*\{\s*--nhen-accent: var\(--accent, #C8FF4D\)/);
  assert.match(design, /site \.nhen-wordmark \.site-logo-image/);
  assert.match(design, /Noto Kufi Arabic/);
});


test("deleting a prepared logo also cleans up its private original backup safely", async () => {
  const media = await readFile(new URL("../src/app/creator/media-library.tsx", import.meta.url), "utf8");
  const studio = await readFile(new URL("../src/app/creator/logo-studio.tsx", import.meta.url), "utf8");
  assert.match(media, /originalStoragePath/);
  assert.match(media, /originalObjectPath\.split\("\/"\)\[0\] === userData\.user\.id/);
  assert.match(media, /backupCleanupError/);
  assert.match(studio, /removeBackground \? "png" : \(file\.type === "image\/jpeg" \? "jpg" : "webp"\)/);
});


test("uploaded logo preview shows both themes while bilingual identity remains visible in the hero portal", async () => {
  const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const studio = await readFile(new URL("../src/app/creator/logo-studio.tsx", import.meta.url), "utf8");
  const design = await readFile(new URL("../src/app/nhen-design-system.css", import.meta.url), "utf8");
  assert.ok(page.includes('config.logoUrl && <img className="site-logo-image" src={config.logoUrl} alt="" />'));
  assert.ok(page.includes('<span className="portal-wordmark"><strong>Nhen?</strong><small lang="ar" dir="rtl">نهين؟</small></span>'));
  assert.match(page, /<small lang="ar" dir="rtl">نهين؟<\/small>/);
  assert.match(studio, /DARK THEME/);
  assert.match(studio, /LIGHT THEME/);
  assert.match(design, /nhen-logo-theme-previews/);
});


test("creator appearance preferences control public color mode and motion safely", async () => {
  const config = await readFile(new URL("../src/lib/public-site-config.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/app/creator/creator-settings.tsx", import.meta.url), "utf8");
  const design = await readFile(new URL("../src/app/nhen-design-system.css", import.meta.url), "utf8");
  assert.match(config, /colorMode: "dark" \| "light" \| "system"/);
  assert.match(config, /motion: "full" \| "reduced" \| "off"/);
  assert.match(config, /appearance\.colorMode === "light" \|\| appearance\.colorMode === "system"/);
  assert.match(config, /appearance\.motion === "reduced" \|\| appearance\.motion === "off"/);
  assert.match(page, /data-color-mode=\{config\.colorMode\} data-motion=\{config\.motion\}/);
  assert.match(settings, /Follow device/);
  assert.match(settings, /Reduced motion/);
  assert.match(design, /\[data-motion="off"\]/);
  assert.match(design, /--nhen-surface: #ffffff/);
  assert.match(design, /\[data-color-mode="system"\]/);
  assert.match(design, /prefers-color-scheme: light/);
  assert.match(design, /\[data-color-mode="light"\]/);
});


test("all creator entry points use the fixed Nhen bilingual identity", async () => {
  const paths = [
    "../src/app/creator/analytics/page.tsx",
    "../src/app/creator/community/page.tsx",
    "../src/app/creator/team/page.tsx",
    "../src/app/creator/login/page.tsx",
    "../src/app/creator/accept-invite/page.tsx"
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /Nhen\?/);
    assert.match(source, /نهين؟/);
  }
});


test("creator analytics exports ranked aggregate metrics as safe CSV", async () => {
  const page = await readFile(new URL("../src/app/creator/analytics/page.tsx", import.meta.url), "utf8");
  const exportComponent = await readFile(new URL("../src/app/creator/analytics/analytics-export.tsx", import.meta.url), "utf8");
  assert.match(page, /rankedMetrics/);
  assert.match(page, /AnalyticsExport/);
  assert.match(exportComponent, /nhen-video-analytics\.csv/);
  assert.match(exportComponent, /text\.replace\(\/"\/g, '""'\)/);
  assert.ok(exportComponent.includes("if (/^[\\s]*[=+\\-@]/.test(text))"));
  assert.match(exportComponent, /Approved comments/);
  assert.match(exportComponent, /URL\.createObjectURL/);
  assert.match(exportComponent, /anchor\.remove\(\)/);
});


test("community moderation confirms database updates and guards destructive actions", async () => {
  const moderation = await readFile(new URL("../src/app/creator/community/moderation-client.tsx", import.meta.url), "utf8");
  assert.match(moderation, /window\.confirm\(status==="removed"/);
  assert.match(moderation, /window\.confirm\(status==="resolved"/);
  assert.match(moderation, /\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(moderation, /!result\.data\?\.id/);
  assert.match(moderation, /finally \{setBusy\(null\);\}/);
  assert.match(moderation, /No update was confirmed/);
});


test("community moderation writes are restricted to owner admin and moderator roles", () => {
  assert.match(communityRoleMigration, /function public\.can_moderate_community\(\)/i);
  assert.match(communityRoleMigration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(communityRoleMigration, /ca\.role in \('owner', 'admin', 'moderator'\)/i);
  assert.match(communityRoleMigration, /drop policy if exists "Creators moderate posts"/i);
  assert.match(communityRoleMigration, /drop policy if exists "Creators moderate comments"/i);
  assert.match(communityRoleMigration, /drop policy if exists "Creators update reports"/i);
  assert.doesNotMatch(communityRoleMigration, /role in \([^)]*'editor'|role in \([^)]*'analyst'/i);
  assert.match(communityRoleMigration, /revoke all on function public\.can_moderate_community\(\) from public, anon/i);
  assert.match(communityRoleMigration, /grant execute on function public\.can_moderate_community\(\) to authenticated/i);
  assert.match(communityRoleMigration, /grant update on public\.content_reports to authenticated/i);
});
