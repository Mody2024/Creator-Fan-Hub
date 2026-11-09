import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261109480000_raye2_exclude_revoked_awards_from_progression.sql",import.meta.url),"utf8");

test("creator reward balance counts awarded points only and reports revoked awards separately",()=>{
 assert.match(migration,/sum\(l\.points\) filter\(where l\.status='awarded'\)/);
 assert.match(migration,/count\(\*\) filter\(where l\.status='revoked'\)/);
 assert.doesNotMatch(migration,/then -l\.points/);
});

test("creator progression level counts awarded points only",()=>{
 assert.match(migration,/sum\(points\) filter\(where status='awarded'\)/);
 assert.match(migration,/from public\.raye2_creator_reward_ledger\s+where creator_id=v_user/);
 assert.doesNotMatch(migration,/case when status='awarded' then points else -points end/);
});

test("reward summary and progression keep authenticated execution boundaries",()=>{
 assert.match(migration,/revoke all on function public\.raye2_creator_reward_summary\(\) from public,anon/);
 assert.match(migration,/grant execute on function public\.raye2_creator_reward_summary\(\) to authenticated/);
 assert.match(migration,/revoke all on function public\.raye2_creator_progression_summary\(\) from public,anon/);
});
