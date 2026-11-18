
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const page=await readFile(new URL("../src/app/raye2/studio/page.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/raye2/studio/studio.module.css",import.meta.url),"utf8");
test("Raye2 Creator Studio has direct role-aware publishing workflow shortcuts",()=>{
 assert.ok(page.includes('href="/creator#creator-media"'));
 assert.ok(page.includes('href="/creator#creator-video-studio"'));
 assert.ok(page.includes('href="/creator/analytics"'));
 assert.ok(page.includes("{canPublish &&"));
 assert.ok(page.includes("{canAnalyze &&"));
});
test("Creator Studio recent media uses server-authorized library data and shows processing state",()=>{
 assert.ok(page.includes("get_creator_media"));
 assert.ok(page.includes("recentMedia"));
 assert.ok(page.includes("processing_status"));
 assert.ok(page.includes("statusFailed"));
 assert.ok(page.includes("statusWaiting"));
});
test("Creator Studio workflow is responsive and reduced-motion aware",()=>{
 assert.ok(css.includes(".workflow"));
 assert.ok(css.includes("@media(max-width:850px)"));
 assert.ok(css.includes("@media(max-width:560px)"));
 assert.ok(css.includes("prefers-reduced-motion"));
});

const workspace=await readFile(new URL("../src/app/creator/raye2-creator-workspace.css",import.meta.url),"utf8");
const home=await readFile(new URL("../src/app/creator/page.tsx",import.meta.url),"utf8");
test("creator workspace command center redesign has a responsive hero, clear system states and compact module grid",()=>{
 assert.ok(workspace.includes(".raye2-creator-shell .dashboard-welcome:after"));
 assert.ok(workspace.includes("grid-template-columns:repeat(4,minmax(0,1fr))"));
 assert.ok(workspace.includes("@media(max-width:1120px)"));
 assert.ok(workspace.includes("@media(max-width:650px)"));
 assert.ok(workspace.includes("prefers-reduced-motion"));
 assert.ok(workspace.includes(".dashboard-stats article:before"));
});
test("creator workspace home keeps role-gated modules and English/Arabic layout while using the redesigned surface",()=>{
 assert.ok(home.includes('dir={isArabic?"rtl":"ltr"}'));
 assert.ok(home.includes('["owner","admin"].includes(admin.role)'));
 assert.ok(home.includes('admin.role === "owner"'));
 assert.ok(home.includes('className="dashboard-welcome"'));
 assert.ok(home.includes("creator-quick-nav"));
});

test("creator reward administration is directly discoverable only to owner and admin roles",()=>{
 assert.ok(home.includes('href="#creator-rewards-admin"'));
 assert.ok(home.includes('{["owner","admin"].includes(admin.role) && <a className="module-card" href="#creator-rewards-admin">'));
 assert.ok(home.includes('rewardsAdmin:"Creator reward administration"'));
 assert.ok(home.includes('rewardsAdmin:"إدارة مكافآت المبدعين"'));
 assert.ok(home.includes('10 + (["owner","admin"].includes(admin.role) ? 5 : 0) + (admin.role === "owner" ? 1 : 0)'));
});
