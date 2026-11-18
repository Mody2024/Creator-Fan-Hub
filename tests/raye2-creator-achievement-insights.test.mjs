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
