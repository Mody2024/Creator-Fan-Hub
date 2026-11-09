import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261110100000_raye2_creator_sponsor_review_workflow.sql",import.meta.url),"utf8");
const auditMigration=await readFile(new URL("../supabase/migrations/20261110110000_raye2_preserve_creator_sponsor_review_audit.sql",import.meta.url),"utf8");
const guardMigration=await readFile(new URL("../supabase/migrations/20261110120000_raye2_fix_sponsor_review_rpc_guard.sql",import.meta.url),"utf8");
const creator=await readFile(new URL("../src/app/creator/creator-video-sponsorship.tsx",import.meta.url),"utf8");
const admin=await readFile(new URL("../src/app/creator/sponsor-reviews/sponsor-review-admin.tsx",import.meta.url),"utf8");
const route=await readFile(new URL("../src/app/creator/sponsor-reviews/page.tsx",import.meta.url),"utf8");
const dashboard=await readFile(new URL("../src/app/creator/page.tsx",import.meta.url),"utf8");
const videoStudio=await readFile(new URL("../src/app/creator/video-studio.tsx",import.meta.url),"utf8");

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

test("guarded review updates are allowed only inside the two trusted RPC transactions",()=>{
 assert.ok(guardMigration.includes("current_setting('app.raye2_sponsor_review_rpc',true)"));
 assert.ok(!guardMigration.includes("and not exists(select 1 from public.creator_admins"));
 assert.equal((guardMigration.match(/set_config\('app\.raye2_sponsor_review_rpc','on',true\)/g)||[]).length,2);
 assert.ok(guardMigration.includes("raye2_request_creator_sponsor_review"));
 assert.ok(guardMigration.includes("raye2_admin_review_creator_sponsor"));
});

test("creator dashboard imports remain valid and sponsor review navigation stays in JSX",()=>{
 assert.ok(dashboard.startsWith('import { redirect } from "next/navigation";'));
 assert.ok(!dashboard.startsWith('import { redirect } from "n{'));
 assert.ok(dashboard.includes('href="/creator/sponsor-reviews"'));
 assert.ok(dashboard.indexOf('href="/creator/sponsor-reviews"')>dashboard.indexOf('<nav className="module-grid creator-quick-nav"'));
});
test("sponsor review page and dashboard navigation enforce owner/admin access",()=>{
 assert.ok(route.includes('["owner","admin"].includes(admin.role)'));
 assert.ok(route.includes("access=restricted"));
 assert.ok(dashboard.includes('href="/creator/sponsor-reviews"'));
 assert.ok(dashboard.includes('["owner","admin"].includes(admin.role)'));
 assert.ok(dashboard.includes("Sponsor campaign reviews"));
});

test("campaign creators can see their own immutable sponsorship review timeline",()=>{
 assert.ok(creator.includes("type SponsorReviewEvent="));
 assert.ok(creator.includes('from("raye2_creator_sponsor_review_events")'));
 assert.ok(creator.includes(".in(\"campaign_id\",campaignIds)"));
 assert.ok(creator.includes("Review history"));
 assert.ok(creator.includes("event.event_type.replaceAll"));
 assert.ok(creator.includes("event.note"));
});
const notificationMigration=await readFile(new URL("../supabase/migrations/20261110130000_raye2_creator_sponsor_review_notifications.sql",import.meta.url),"utf8");
const notificationComponent=await readFile(new URL("../src/app/creator/creator-notifications.tsx",import.meta.url),"utf8");
const bulkReadMigration=await readFile(new URL("../supabase/migrations/20261110140000_raye2_creator_notification_bulk_read.sql",import.meta.url),"utf8");

test("sponsor review outcomes create private creator notifications atomically",()=>{
 assert.ok(notificationMigration.includes("review_event_id uuid not null unique"));
 assert.ok(notificationMigration.includes("insert into public.raye2_creator_notifications"));
 assert.ok(notificationMigration.includes("v_event_id"));
 assert.ok(notificationMigration.includes("delivery does not activate ad delivery")||notificationMigration.includes("does not activate ad delivery"));
 assert.ok(notificationMigration.includes("grant execute on function public.raye2_mark_creator_notification_read(uuid) to authenticated"));
 assert.ok(notificationMigration.includes("creator_id=(select auth.uid()) and public.is_nhen_video_publisher()"));
});

test("sponsor review administration and navigation include Arabic localization",()=>{
 assert.ok(admin.includes('ar?"طلبات قيد المراجعة":"Pending review"'));
 assert.ok(admin.includes('ar?"الموافقة على المراجعة":"Approve review"'));
 assert.ok(admin.includes('ar?"سجل القرارات":"Decision history"'));
 assert.ok(route.includes('locale==="ar"?"← مساحة المبدعين":"← Creator workspace"'));
});
test("creator dashboard exposes a private notification inbox with read actions",()=>{
 assert.ok(notificationComponent.includes('from("raye2_creator_notifications")'));
 assert.ok(notificationComponent.includes('rpc("raye2_mark_creator_notification_read"'));
 assert.ok(notificationComponent.includes("Mark as read"));
 assert.ok(dashboard.includes('import CreatorNotifications from "./creator-notifications";'));
 assert.ok(dashboard.includes('<CreatorNotifications locale={isArabic?"ar":"en"} />'));
 assert.ok(dashboard.includes('href="#creator-notifications"'));
 assert.ok(dashboard.includes('id="creator-notifications"'));
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

test("creator notification inbox supports scoped bulk read and all/unread filters",()=>{
 assert.ok(bulkReadMigration.includes("raye2_mark_all_creator_notifications_read"));
 assert.ok(bulkReadMigration.includes("where creator_id=(select auth.uid()) and read_at is null"));
 assert.ok(bulkReadMigration.includes("public.is_nhen_video_publisher()"));
 assert.ok(bulkReadMigration.includes("grant execute on function public.raye2_mark_all_creator_notifications_read() to authenticated"));
 assert.ok(notificationComponent.includes('rpc("raye2_mark_all_creator_notifications_read")'));
 assert.ok(notificationComponent.includes('filter==="unread"'));
 assert.ok(notificationComponent.includes("Mark all as read"));
 assert.ok(notificationComponent.includes("visibleItems.map"));
});

test("creator video studio can safely unpublish a watch page without changing its source asset",()=>{
 assert.ok(videoStudio.includes("async function unpublish()"));
 assert.ok(videoStudio.includes("if(!window.confirm(t.unpublishConfirm))return"));
 assert.ok(videoStudio.includes("p_publish:false"));
 assert.ok(videoStudio.includes("setPublishedAt(false)"));
 assert.ok(videoStudio.includes("setStatus(t.unpublished)"));
 assert.ok(videoStudio.includes("publishedAt&&<button"));
 assert.ok(videoStudio.includes("source file remains unchanged"));
 assert.ok(videoStudio.includes("سيظل ملف الفيديو الأصلي كما هو"));
});
