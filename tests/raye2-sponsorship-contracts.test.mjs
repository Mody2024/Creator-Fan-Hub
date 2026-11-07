import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, component, studio, adminComponent] = await Promise.all([
  read("../supabase/migrations/20261107120000_raye2_creator_video_sponsorships.sql"),
  read("../src/app/creator/creator-video-sponsorship.tsx"),
  read("../src/app/creator/video-studio.tsx"),
  read("../src/app/creator/raye2/platform-sponsor-management.tsx")
]);

test("creator sponsorship records are private and owner-scoped", () => {
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("creator_id=(select auth.uid())"));
  assert.ok(migration.includes("public.is_nhen_video_publisher()"));
  assert.ok(migration.includes("for insert"));
  assert.ok(migration.includes("for update"));
  assert.ok(migration.includes("for delete"));
});

test("campaign trigger validates the creator's own published video and creative", () => {
  assert.ok(migration.includes("v_content_owner is distinct from new.creator_id"));
  assert.ok(migration.includes("sponsorship must attach to your own published Raye2 video"));
  assert.ok(migration.includes("v_sponsor_owner is distinct from new.creator_id"));
  assert.ok(migration.includes("v_sponsor_type not in ('video','image')"));
  assert.ok(migration.includes("creator_confirmed_rights"));
});

test("campaign configuration includes disclosure, dates, placement and frequency limits", () => {
  for (const field of ["disclosure_text","starts_at","ends_at","placement","max_per_viewer","status"]) {
    assert.ok(migration.includes(field), `missing campaign field: ${field}`);
  }
  assert.ok(component.includes("Disclosure shown to viewers"));
  assert.ok(component.includes("Maximum planned exposures per viewer"));
});

test("creator UI is attached to the selected published video and never claims playback delivery", () => {
  assert.ok(studio.includes("<CreatorVideoSponsorship mediaId={selected}"));
  assert.ok(component.includes("automatic ad delivery is not enabled yet"));
  assert.ok(component.includes("delivery is still disabled"));
  assert.ok(!component.includes("ad insertion"));
});

test("platform sponsor campaigns have a separate admin-only ownership boundary", () => {
  assert.ok(migration.includes("raye2_platform_sponsor_campaigns"));
  assert.ok(migration.includes("public.raye2_is_platform_admin()"));
  assert.ok(migration.includes("new.created_by<>(select auth.uid())"));
  assert.ok(migration.includes("platform sponsor creative must be a published image or video owned by this admin"));
  assert.ok(adminComponent.includes("Platform-wide sponsor director setup"));
  assert.ok(adminComponent.includes("automated delivery remains disabled"));
});
