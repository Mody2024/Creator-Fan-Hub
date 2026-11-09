import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const [migration,component]=await Promise.all([
 readFile(new URL("../supabase/migrations/20261107340000_raye2_creator_progression_levels.sql",import.meta.url),"utf8"),
 readFile(new URL("../src/app/creator/rewards-center.tsx",import.meta.url),"utf8")
]);
test("creator progression is calculated from the protected reward ledger",()=>{
 assert.ok(migration.includes("public.raye2_creator_reward_ledger"));
 assert.ok(migration.includes("ca.active=true"));
 assert.ok(migration.includes("ca.role in ('owner','admin','creator','editor','analyst')"));
 assert.ok(migration.includes("revoke all on function public.raye2_creator_progression_summary() from public,anon"));
});
test("seven progression levels have transparent thresholds and bounded progress",()=>{
 for(const threshold of ["100","300","700","1500","3000","6000"])assert.ok(migration.includes("v_points>="+threshold));
 assert.ok(migration.includes("'Starter'"));assert.ok(migration.includes("'Legend'"));
 assert.ok(migration.includes("least(100"));assert.ok(migration.includes("greatest(v_next-v_points,0)"));
});
test("creator rewards UI shows accessible level and progress meter",()=>{
 assert.ok(component.includes("raye2_creator_progression_summary"));
 assert.ok(component.includes("aria-valuenow"));
 assert.ok(component.includes("Progress to next creator level"));
});

test("creator progression UI handles Supabase table-return arrays and clamps progress",()=>{
 assert.ok(component.includes("const progressionRaw=progressionResult.data"));
 assert.ok(component.includes("Array.isArray(progressionRaw)?progressionRaw[0]:progressionRaw"));
 assert.ok(component.includes("Math.max(0,Math.min(100,rawPercent))"));
 assert.ok(component.includes("setProgression(null)"));
 assert.ok(component.includes("Creator progression returned an invalid summary"));
});
