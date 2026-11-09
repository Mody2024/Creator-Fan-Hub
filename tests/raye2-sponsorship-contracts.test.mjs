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

test("creative variants are bound to exactly one owner campaign and published owned media",()=>{
  assert.ok(migration.includes("raye2_sponsor_creative_variants"));
  assert.ok(migration.includes("num_nonnulls(creator_campaign_id,platform_campaign_id)=1"));
  assert.ok(migration.includes("creative variant must use a published image or video owned by the campaign owner"));
  assert.ok(migration.includes("category_exclusive"));
});

test("creator breakpoint review is owner-scoped and constrained to video duration",async()=>{
  const breakpointMigration=await read("../supabase/migrations/20261107140000_raye2_creator_sponsor_breakpoint_reviews.sql");
  assert.ok(breakpointMigration.includes("creator_id=(select auth.uid())"));
  assert.ok(breakpointMigration.includes("v_duration is null or new.at_seconds>=v_duration"));
  assert.ok(breakpointMigration.includes("decision in ('approve','exclude')"));
});

test("creators can edit only unused drafts and delete only unused drafts",()=>{
  assert.ok(component.includes("function editDraft(row:SponsorCampaign)"));
  assert.ok(component.includes('if(row.status!=="draft")return;'));
  assert.ok(component.includes('.eq("status","draft").select("id").maybeSingle()'));
  assert.ok(component.includes("This draft is no longer available to edit."));
  assert.ok(component.includes("This draft is no longer available to delete."));
  assert.ok(component.includes("Delete unused draft"));
  assert.ok(component.includes("Campaigns with delivery history are preserved."));
  assert.ok(component.includes('onClick={()=>editDraft(row)}'));
});

 
test("creator sponsor draft validates name, creative, disclosure and rights",async()=>{
 const component=await read("../src/app/creator/creator-video-sponsorship.tsx");
 assert.ok(component.includes("validateCreatorSponsorDraft"));
 assert.ok(component.includes("input.sponsorName.trim().length<2||input.sponsorName.trim().length>120"));
 assert.ok(component.includes("input.disclosure.trim().length<3||input.disclosure.trim().length>240"));
 assert.ok(component.includes("if(!input.confirmed)"));
});
test("creator sponsor draft validates frequency, category and calendar dates",async()=>{
 const component=await read("../src/app/creator/creator-video-sponsorship.tsx");
 assert.ok(component.includes("frequency<1||frequency>5"));
 assert.ok(component.includes("input.category.trim().length>40"));
 assert.ok(component.includes("/^\\d{4}-\\d{2}-\\d{2}$/"));
 assert.ok(component.includes("input.ends<input.starts"));
});
test("resetting creator sponsor editor restores the default placement",async()=>{
 const component=await read("../src/app/creator/creator-video-sponsorship.tsx");
 assert.ok(component.includes('setEditingCampaignId(null);setSponsorName("");setCreativeId("");setDisclosure("Sponsored");setPlacement("intro");'));
});

test("Raye2 design tokens use the approved blue neutral palette",async()=>{
 const design=await read("../src/app/nhen-design-system.css");
 assert.ok(design.includes("--nhen-bg:#080b12"));
 assert.ok(design.includes("--nhen-accent:#79b1ff"));
 assert.ok(design.includes("--nhen-ink:#f3f6fb"));
 assert.ok(!design.startsWith("/* NHEN Design System"));
});
test("root metadata uses Raye2 identity rather than predecessor branding",async()=>{
 const layout=await read("../src/app/layout.tsx");
 assert.ok(layout.includes('applicationName: "Raye2"'));
 assert.ok(layout.includes('title: { default: "Raye2", template: "%s | Raye2" }'));
 assert.ok(!layout.includes("Nhen?"));
});

test("pausing a creator sponsorship is scoped to the signed-in owner, video and active state",()=>{
 assert.ok(component.includes('supabase.auth.getUser()'));
 assert.ok(component.includes('.eq("id",row.id).eq("creator_id",userData.user.id).eq("media_id",mediaId).eq("status","active")'));
 assert.ok(component.includes('.select("id").maybeSingle()'));
 assert.ok(component.includes("This active campaign is no longer available to pause."));
});

test("creator sponsor campaign lifecycle is enforced by the database, not only the UI",async()=>{
 const guard=await read("../supabase/migrations/20261109300000_raye2_creator_sponsor_lifecycle_guard.sql");
 assert.ok(guard.includes("before insert or update or delete on public.raye2_creator_sponsor_campaigns"));
 assert.ok(guard.includes("new.status is distinct from 'draft'"));
 assert.ok(guard.includes("old.status='draft' and new.status='draft'"));
 assert.ok(guard.includes("old.status='active' and new.status='paused'"));
 assert.ok(guard.includes("invalid creator campaign lifecycle transition"));
 assert.ok(guard.includes("only your unused draft campaigns can be deleted"));
 assert.ok(guard.includes("campaign ownership and video binding are immutable"));
 assert.ok(guard.includes("to_jsonb(new)-'status'-'updated_at'"));
 assert.ok(guard.includes("to_jsonb(old)-'status'-'updated_at'"));
});

test("platform sponsor drafts are owner-bound and lifecycle transitions are database-enforced",async()=>{
 const guard=await read("../supabase/migrations/20261109400000_raye2_platform_sponsor_lifecycle_guard.sql");
 assert.ok(guard.includes("before insert or update or delete on public.raye2_platform_sponsor_campaigns"));
 assert.ok(guard.includes("platform sponsor campaigns must begin as owner-bound drafts"));
 assert.ok(guard.includes("only your unused platform sponsor drafts can be deleted"));
 assert.ok(guard.includes("platform campaign ownership is immutable"));
 assert.ok(guard.includes("old.status='active' and new.status in ('paused','completed')"));
 assert.ok(guard.includes("old.status='paused' and new.status in ('active','completed')"));
 assert.ok(guard.includes("invalid platform sponsor campaign lifecycle transition"));
});
test("platform sponsor management edits the selected creative and uses owner-scoped status changes",()=>{
 assert.ok(adminComponent.includes("setAssetId(row.sponsor_asset_media_id)"));
 assert.ok(adminComponent.includes("async function deleteDraft(row:Campaign)"));
 assert.ok(adminComponent.includes('.eq("id",row.id).eq("created_by",user.user.id).eq("status","draft")'));
 assert.ok(adminComponent.includes('.eq("id",row.id).eq("created_by",user.user.id).eq("status",row.status).select("id").maybeSingle()'));
 assert.ok(adminComponent.includes("Delete draft"));
 assert.ok(adminComponent.includes("automated delivery remains disabled"));
});
