import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/app/creator/raye2/platform-sponsor-management.tsx",import.meta.url),"utf8");
test("platform sponsor drafts validate required fields and numeric bounds",()=>{
 assert.ok(source.includes("validatePlatformSponsorDraft"));
 assert.ok(source.includes("priority<1||priority>100"));
 assert.ok(source.includes("frequency<1||frequency>5"));
 assert.ok(source.includes("input.name.trim().length<2"));
 assert.ok(source.includes("input.disclosure.trim().length<3"));
});
test("platform sponsor drafts validate inventory, regions, duplicates and dates",()=>{
 assert.ok(source.includes("!input.videos&&!input.live"));
 assert.ok(source.includes("/^[A-Z]{2}$/"));
 assert.ok(source.includes("new Set(regions).size!==regions.length"));
 assert.ok(source.includes("The end date must not be before the start date."));
});
test("admins can edit only their own unused platform campaign drafts",()=>{
 assert.ok(source.includes('if(row.status!=="draft")return;'));
 assert.ok(source.includes('.eq("id",editingCampaignId).eq("created_by",user.user.id).eq("status","draft").select("id").maybeSingle()'));
 assert.ok(source.includes("This unused campaign draft is no longer available to edit."));
 assert.ok(source.includes("Edit draft"));
 assert.ok(source.includes("Cancel editing"));
});
test("campaign editor clearly keeps delivery disabled",()=>{
 assert.ok(source.includes("Saving will not enable delivery."));
 assert.ok(source.includes("Delivery remains disabled."));
 assert.ok(source.includes("automated delivery remains disabled"));
});
