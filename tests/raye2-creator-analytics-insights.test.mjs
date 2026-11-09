import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const page=await readFile(new URL("../src/app/creator/analytics/page.tsx",import.meta.url),"utf8");
test("creator analytics derives interaction rate only from aggregate published metrics",()=>{
 assert.ok(page.includes("(totals.reactions+totals.comments)/totals.views"));
 assert.ok(page.includes("INTERACTIONS / 100 VIEWS"));
 assert.ok(page.includes("Combined reactions and comments per 100 views"));
});
test("content highlights rank videos by actual views and interactions per view",()=>{
 assert.ok(page.includes("const topViewed=rankedMetrics[0]"));
 assert.ok(page.includes("Most viewed"));
 assert.ok(page.includes("Most interactions per view"));
 assert.ok(page.includes("rankedMetrics.slice(0,5)"));
 assert.ok(page.includes("maxViews"));
});
test("analytics insights remain aggregate and avoid quality or reach guarantees",()=>{
 assert.ok(page.includes("Aggregate only"));
 assert.ok(page.includes("not a quality score or a promise of reach"));
 assert.ok(page.includes("Viewer identities are not exposed."));
});

test("analytics distinguishes unavailable data from a genuinely empty account",()=>{assert.ok(page.includes("Analytics could not be loaded."));assert.ok(page.includes("Performance highlights could not load."));assert.ok(page.includes("Publish your first video to start building performance insights."));});
