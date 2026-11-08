import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const migration=await readFile(new URL("../supabase/migrations/20261107320000_raye2_creator_achievement_reward_bridge.sql",import.meta.url),"utf8");
test("verified creator achievements automatically create idempotent reward ledger awards",()=>{
 assert.ok(migration.includes("after insert on public.member_achievements"));
 assert.ok(migration.includes("ca.role in ('creator','editor')"));
 assert.ok(migration.includes("ca.active=true"));
 assert.ok(migration.includes("where code=new.achievement_code and enabled=true"));
 assert.ok(migration.includes("'achievement:'||new.achievement_code"));
 assert.ok(migration.includes("on conflict(creator_id,reward_code,source_ref) do nothing"));
});
test("default achievement reward rules are seeded without overwriting admin configuration",()=>{
 assert.ok(migration.includes("on conflict(code) do nothing"));
 for(const code of ["first_post","five_posts","first_follow","five_follows","first_video_comment"])assert.ok(migration.includes("'"+code+"'"));
});
test("reward bridge trigger function cannot be called by browser roles",()=>{
 assert.ok(migration.includes("revoke all on function public.raye2_award_creator_points_for_achievement() from public,anon,authenticated"));
});
