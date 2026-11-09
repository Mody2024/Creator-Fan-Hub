import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261107170000_raye2_creator_sponsorship_analytics.sql",import.meta.url),"utf8");
const component=await readFile(new URL("../src/app/creator/sponsor-analytics.tsx",import.meta.url),"utf8");
const studio=await readFile(new URL("../src/app/creator/creator-video-sponsorship.tsx",import.meta.url),"utf8");

test("creator analytics RPC is authenticated and publisher-role scoped",()=>{
 assert.ok(migration.includes("v_user uuid := auth.uid()"));
 assert.ok(migration.includes("not public.is_nhen_video_publisher()"));
 assert.ok(migration.includes("grant execute on function public.raye2_creator_sponsorship_analytics(uuid) to authenticated"));
 assert.ok(migration.includes("revoke all on function public.raye2_creator_sponsorship_analytics(uuid) from public,anon"));
});

test("creator analytics only aggregates campaigns owned by the current creator",()=>{
 assert.ok(migration.includes("where c.creator_id=v_user"));
 assert.ok(migration.includes("where c.creator_id=v_user and c.media_id=p_media_id"));
 assert.ok(migration.includes("join owned_campaigns c on c.id=e.campaign_id"));
 assert.ok(migration.includes("join owned_campaigns c on c.id=r.campaign_id"));
 assert.ok(migration.includes("'platform_campaigns_excluded',true"));
});

test("financial report distinguishes received from estimated and provider-reported amounts",()=>{
 assert.ok(migration.includes("r.status='received' then r.creator_share"));
 assert.ok(migration.includes("r.status in ('estimated','provider_reported') then r.creator_share"));
 assert.ok(migration.includes("'viewer_identity_data_exposed',false"));
 assert.ok(migration.includes("'contract_sponsorship_reporting','delivery_activity_only_no_platform_payout_attribution'"));
});

test("creator dashboard labels delivery as events and does not invent earnings",()=>{
 assert.ok(component.includes("Recorded events, not unique viewers"));
 assert.ok(component.includes("Creator share received"));
 assert.ok(component.includes("Unconfirmed"));
 assert.ok(component.includes("No earnings are assumed."));
 assert.ok(component.includes("Raye2 platform-wide campaigns are excluded."));
 assert.ok(studio.includes("<SponsorAnalytics mediaId={mediaId}/>"));
});

test("creator sponsorship CSV export is aggregate-only and formula-injection safe",()=>{
 assert.ok(component.includes("const exportReport=useCallback"));
 assert.ok(component.includes("raye2-sponsorship-analytics.csv"));
 assert.ok(component.includes("text.replace(/\"/g,'\"\"')"));
 assert.ok(component.includes("/^[\\s]*[=+\\-@]/"));
 assert.ok(component.includes("No viewer identities were included."));
 assert.ok(component.includes("Creator share unconfirmed"));
 assert.ok(component.includes("disabled={!report}"));
});

test("creator sponsorship accepts same-day contracts and rejects impossible calendar dates",()=>{
 assert.ok(studio.includes("parsed.toISOString().slice(0,10)===value"));
 assert.ok(studio.includes("input.ends<input.starts"));
 assert.ok(!studio.includes("new Date(ends)<=new Date(starts)"));
});
test("creator sponsorship save uses the shared complete validation contract",()=>{
 assert.ok(studio.includes("validateCreatorSponsorDraft({sponsorName,creativeId,disclosure,confirmed,starts,ends,frequency,category})"));
 assert.ok(studio.includes("eligibleAssets.some(asset=>asset.media_id===creativeId)"));
});
