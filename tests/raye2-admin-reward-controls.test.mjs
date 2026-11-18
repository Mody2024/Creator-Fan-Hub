import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,component,dashboard]=await Promise.all([
 read("../supabase/migrations/20261107310000_raye2_admin_reward_controls.sql"),
 read("../src/app/creator/rewards-admin.tsx"),
 read("../src/app/creator/page.tsx")
]);
test("reward creator discovery is restricted to active owner and admin accounts",()=>{
 assert.ok(migration.includes("ca.active=true"));
 assert.ok(migration.includes("ca.role in ('owner','admin')"));
 assert.ok(migration.includes("ca.role in ('creator','editor')"));
 assert.ok(migration.includes("revoke all on function public.raye2_admin_list_reward_creators() from public,anon,authenticated"));
});
test("admin reward UI can configure rules, issue grants and revoke with confirmation",()=>{
 assert.ok(component.includes("raye2_admin_upsert_creator_reward_rule"));
 assert.ok(component.includes("raye2_admin_grant_creator_reward"));
 assert.ok(component.includes("raye2_admin_revoke_creator_reward"));
 assert.ok(component.includes("window.confirm"));
 assert.ok(component.includes("Recent reward ledger"));
});
test("admin reward controls mount only behind owner/admin dashboard gate",()=>{
 assert.ok(dashboard.includes("CreatorRewardsAdmin"));
 assert.ok(dashboard.includes('{["owner","admin"].includes(admin.role) && <CreatorRewardsAdmin />}'));
});
