import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261110100000_raye2_creator_sponsor_review_workflow.sql",import.meta.url),"utf8");
const auditMigration=await readFile(new URL("../supabase/migrations/20261110110000_raye2_preserve_creator_sponsor_review_audit.sql",import.meta.url),"utf8");
const creator=await readFile(new URL("../src/app/creator/creator-video-sponsorship.tsx",import.meta.url),"utf8");
const admin=await readFile(new URL("../src/app/creator/sponsor-reviews/sponsor-review-admin.tsx",import.meta.url),"utf8");
const route=await readFile(new URL("../src/app/creator/sponsor-reviews/page.tsx",import.meta.url),"utf8");
const dashboard=await readFile(new URL("../src/app/creator/page.tsx",import.meta.url),"utf8");

test("creator sponsorship review is an explicit, authenticated workflow",()=>{
 assert.ok(migration.includes("approval_status text not null default 'not_submitted'"));
 assert.ok(migration.includes("raye2_request_creator_sponsor_review"));
 assert.ok(migration.includes("public.is_nhen_video_publisher()"));
 assert.ok(migration.includes("raye2_admin_review_creator_sponsor"));
 assert.ok(migration.includes("a.role in ('owner','admin')"));
 assert.ok(migration.includes("grant execute on function public.raye2_request_creator_sponsor_review(uuid) to authenticated"));
 assert.ok(migration.includes("grant execute on function public.raye2_admin_review_creator_sponsor(uuid,text,text) to authenticated"));
});

test("review decisions never activate delivery or reward draft campaigns",()=>{
 assert.ok(migration.includes("'delivery_enabled',false"));
 assert.ok(migration.includes("v_campaign.status<>'draft'"));
 assert.ok(migration.includes("only pending draft campaigns can be reviewed"));
 assert.ok(creator.includes("raye2_request_creator_sponsor_review"));
 assert.ok(creator.includes("data?.delivery_enabled!==false"));
 assert.ok(admin.includes("delivery_enabled!==false"));
 assert.ok(admin.includes("Delivery stays disabled."));
});

test("sponsor review history is append-only and reviewed campaigns are retained",()=>{
 assert.ok(auditMigration.includes("before update or delete on public.raye2_creator_sponsor_review_events"));
 assert.ok(auditMigration.includes("sponsor review history is append-only"));
 assert.ok(auditMigration.includes("before delete on public.raye2_creator_sponsor_campaigns"));
 assert.ok(auditMigration.includes("reviewed campaigns must be retained for audit history"));
});

test("sponsor review page and dashboard navigation enforce owner/admin access",()=>{
 assert.ok(route.includes('["owner","admin"].includes(admin.role)'));
 assert.ok(route.includes("access=restricted"));
 assert.ok(dashboard.includes('href="/creator/sponsor-reviews"'));
 assert.ok(dashboard.includes('["owner","admin"].includes(admin.role)'));
 assert.ok(dashboard.includes("Sponsor campaign reviews"));
});

test("creator can request review only for editable draft campaigns and sees review outcome",()=>{
 assert.ok(creator.includes('row.status!=="draft"'));
 assert.ok(creator.includes('["not_submitted","rejected"].includes(row.approval_status)'));
 assert.ok(creator.includes("Review: {row.approval_status.replaceAll"));
 assert.ok(creator.includes("Reviewer note: {row.approval_note}"));
 assert.ok(creator.includes('row.approval_status==="pending"||row.approval_status==="approved"'));
});

test("admin review queue records a required rejection reason and exposes decision history",()=>{
 assert.ok(admin.includes('decision==="rejected"&&note.length<3'));
 assert.ok(admin.includes("raye2_admin_review_creator_sponsor"));
 assert.ok(admin.includes("Decision history"));
 assert.ok(admin.includes("raye2_creator_sponsor_review_events"));
});
