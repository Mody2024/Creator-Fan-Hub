import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/app/api/creator/sponsorship/preview/route.ts",import.meta.url),"utf8");
const ui=await readFile(new URL("../src/app/creator/sponsor-breakpoint-preview.tsx",import.meta.url),"utf8");
const studio=await readFile(new URL("../src/app/creator/creator-video-sponsorship.tsx",import.meta.url),"utf8");

test("creator sponsorship preview authenticates and validates campaign identifiers",()=>{
 assert.ok(route.includes("supabase.auth.getClaims()"));
 assert.ok(route.includes("readBoundedJson(request, 4096)"));
 assert.ok(route.includes("maybeSingle()"));
 assert.ok(route.includes("Cache-Control"));
});

test("preview loads only the creator's own campaign and approved media evidence",()=>{
 assert.ok(route.includes('.eq("creator_id", userId)'));
 assert.ok(route.includes('.eq("campaign_id", campaign.id)'));
 assert.ok(route.includes('.eq("creator_id", userId)'));
 assert.ok(route.includes("selectSponsorBreakpoints"));
 assert.ok(route.includes("creatorExcluded: row.decision === \"exclude\""));
});

test("preview is explicitly non-delivering and returns clear limitations",()=>{
 assert.ok(route.includes("previewOnly: true"));
 assert.ok(route.includes("deliveryEnabled: false"));
 assert.ok(route.includes("No advertisement is loaded, played, inserted or counted as an impression."));
 assert.ok(route.includes("Cache-Control"));
});

test("creator studio exposes the preview control for each owned campaign",()=>{
 assert.ok(ui.includes("/api/creator/sponsorship/preview"));
 assert.ok(ui.includes("Preview reviewed breakpoints"));
 assert.ok(ui.includes("No advertisement was loaded or played."));
 assert.ok(ui.includes("Creator review markers"));
 assert.ok(ui.includes("Excluded by creator"));
 assert.ok(ui.includes("Approved candidate"));
 assert.ok(studio.includes("<SponsorBreakpointPreview campaignId={row.id}/>"));
});
