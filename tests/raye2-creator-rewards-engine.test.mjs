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
 assert.ok(migration.split("ca.role in ('owner','admin')").length-1>=3);
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
 assert.ok(component.includes('.eq("creator_id",creatorId)'));
 assert.ok(component.includes("Revoked awards are excluded"));
});
test("creator dashboard mounts the rewards center",()=>{
 assert.ok(dashboard.includes("CreatorRewardsCenter"));
 assert.ok(dashboard.includes("<CreatorRewardsCenter />"));
});

test("creator reward summary normalization clamps malformed database counts",()=>{
 assert.ok(component.includes("normalizeCreatorRewardSummary"));
 assert.ok(component.includes("safeRewardCount"));
 assert.ok(component.includes("Math.max(0,Math.trunc(parsed))"));
});
test("creator reward center filters malformed ledger and milestone rows",()=>{
 assert.ok(component.includes('row.status==="awarded"||row.status==="revoked"'));
 assert.ok(component.includes('typeof row.code==="string"&&typeof row.title==="string"&&row.enabled===true'));
 assert.ok(component.includes('"Date unavailable"'));
});

test("creator reward normalizers handle malformed summaries, ledgers and rules",async()=>{
 const source=component;
 assert.ok(source.includes("export function normalizeCreatorRewardSummary"));
 assert.ok(source.includes("export function normalizeCreatorRewardHistory"));
 assert.ok(source.includes("export function normalizeCreatorRewardRules"));
 assert.ok(source.includes("typeof value===\"number\"||typeof value===\"string\""));
 assert.ok(source.includes("Math.max(0,Math.trunc(parsed))"));
});

test("creator rewards center displays only achievements earned by the signed-in creator",()=>{
 assert.ok(component.includes('from("member_achievements").select("achievement_code,earned_at").eq("user_id",creatorId)'));
 assert.ok(component.includes('from("achievement_catalog").select("code,title,description,icon")'));
 assert.ok(component.includes("normalizeCreatorAchievements"));
 assert.ok(component.includes("Your earned milestones"));
 assert.ok(component.includes("Only achievements recorded by Raye2 are shown here."));
});
test("achievement normalization ignores unknown and malformed achievement records",()=>{
 assert.ok(component.includes("if(typeof row.achievement_code!==\"string\"||typeof row.earned_at!==\"string\")return []"));
 assert.ok(component.includes("if(!detail)return []"));
 assert.ok(component.includes("export function normalizeCreatorProgression"));
 assert.ok(component.includes("Math.max(0,Math.min(100,Math.trunc(percent)))"));
});
