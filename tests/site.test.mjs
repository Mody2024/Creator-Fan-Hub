import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSiteConfig } from "../src/lib/site-config.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const sql = await readFile(new URL("../supabase/rls-policies.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../docs/BACKEND-SECURITY.md", import.meta.url), "utf8");

test("public page contains the expected primary sections", () => {
  for (const id of ["home", "ideas", "vote", "community", "latest"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing section: ${id}`);
  }
});

test("demo interactions clearly disclose that data is not persisted", () => {
  assert.match(html, /not sent or stored/i);
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
  identity: { siteName: "Creator Community", tagline: "Help shape what comes next.", logoMediaId: null, mascotMediaId: null },
  appearance: { theme: "obsidian", accent: "#d6ff72", colorMode: "dark", motion: "full" },
  layout: {
    sectionOrder: ["hero", "ideas", "poll", "latest", "events", "community"],
    visibleSections: ["hero", "ideas", "poll", "latest", "events", "community"]
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

test("configuration validator rejects malformed feature flags and invalid overlay", () => {
  const invalid = structuredClone(validConfig);
  invalid.featureFlags.polls = "yes";
  invalid.hero.overlay = 2;
  const result = validateSiteConfig(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.path === "featureFlags.polls"));
  assert.ok(result.errors.some((error) => error.path === "hero.overlay"));
});
