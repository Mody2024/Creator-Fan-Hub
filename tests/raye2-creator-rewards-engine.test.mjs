import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,component,dashboard]=await Promise.all([
 read("../supabase/migrations/20261107290000_raye2_creator_achievement_insights.sql"),
 read("../src/app/creator/achievement-insights.tsx"),
 read("../src/app/creator/page.tsx")
]);
test("achievement insights expose aggregate counts only to authorized creator workspace roles",()=>{
 assert.ok(migration.includes("security definer"));
 assert.ok(migration.includes("ca.active=true"));
 assert.ok(migration.includes("ca.role in ('owner','admin','creator','editor','analyst')"));
 assert.ok(migration.includes("count(distinct ma.user_id)"));
 assert.ok(migration.includes("revoke all on function public.raye2_creator_achievement_insights() from public,anon"));
 assert.ok(migration.includes("grant execute on function public.raye2_creator_achievement_insights() to authenticated"));
 assert.ok(!migration.includes("returns table (\n  user_id"));
});
test("creator achievement panel reports milestones without rendering member identities",()=>{
 assert.ok(component.includes("Aggregate achievement activity"));
 assert.ok(component.includes("Individual member identities are not exposed"));
 assert.ok(component.includes("Achievement awards"));
 assert.ok(component.includes("Community achievements"));
 assert.ok(!component.includes("user_id"));
});
test("creator dashboard includes achievement insights",()=>{
 assert.ok(dashboard.includes("AchievementInsights"));
 assert.ok(dashboard.includes("<AchievementInsights />"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,component,dashboard]=await Promise.all([
 read("../supabase/migrations/20261107300000_raye2_creator_rewards_engine.sql"),
 read("../src/app/creator/rewards-center.tsx"),
 read("../src/app/creator/page.tsx")
]);
test("creator rewards ledger records recognition credits with auditable status and duplicate protection",()=>{
 assert.ok(migration.includes("unique nulls not distinct (creator_id,reward_code,source_ref)"));
 assert.ok(migration.includes("status text not null default 'awarded' check (status in ('awarded','revoked'))"));
 assert.ok(migration.includes("granted_by uuid"));
 assert.ok(migration.includes("revoked_by uuid"));
 assert.ok(migration.includes("points integer not null check (points between 1 and 1000000)"));
});
test("only owner/admin may configure, grant, or revoke rewards",()=>{
 for(const fn of ["raye2_admin_upsert_creator_reward_rule","raye2_admin_grant_creator_reward","raye2_admin_revoke_creator_reward"]){
  assert.ok(migration.includes("function public."+fn));
 }
 assert.equal((migration.match(/ca.role in \('owner','admin'\)/g)||[]).length,3);
 assert.ok(migration.includes("target must be an active creator or editor"));
});
test("creator reward summary and history are scoped to the signed-in creator",()=>{
 assert.ok(migration.includes("l.creator_id=(select auth.uid())"));
 assert.ok(migration.includes("creator_id=(select auth.uid())"));
 assert.ok(migration.includes("revoke all on public.raye2_creator_reward_rules,public.raye2_creator_reward_ledger from public,anon,authenticated"));
});
test("creator rewards UI clearly distinguishes points from cash and displays history",()=>{
 assert.ok(component.includes("recognition credits, not cash"));
 assert.ok(component.includes("Reward history"));
 assert.ok(component.includes("raye2_creator_reward_summary"));
 assert.ok(component.includes("raye2_creator_reward_ledger"));
 assert.ok(component.includes('.eq("creator_id",userData.user.id)'));
 assert.ok(component.includes("Revoked awards are excluded"));
});
test("creator dashboard mounts the rewards center",()=>{
 assert.ok(dashboard.includes("CreatorRewardsCenter"));
 assert.ok(dashboard.includes("<CreatorRewardsCenter />"));
});
