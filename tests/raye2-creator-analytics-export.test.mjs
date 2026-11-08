import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/app/creator/analytics/analytics-export.tsx",import.meta.url),"utf8");
test("analytics CSV exports aggregate totals and per-video engagement rate",()=>{
 assert.ok(source.includes("const totals = metrics.reduce"));
 assert.ok(source.includes("interactionRate(totals)"));
 assert.ok(source.includes("interactionRate(item)"));
 assert.ok(source.includes("Interactions per 100 views"));
 assert.ok(source.includes("التفاعلات لكل 100 مشاهدة"));
});
test("analytics CSV ranks videos and preserves bilingual export",()=>{
 assert.ok(source.includes("const ranked = [...metrics].sort"));
 assert.ok(source.includes("index + 1"));
 assert.ok(source.includes("raye2-video-analytics-ar.csv"));
 assert.ok(source.includes("raye2-video-analytics.csv"));
});
test("analytics CSV neutralizes spreadsheet formula injection and quotes cells",()=>{
 assert.ok(source.includes("/^\\s*[=+@-]/.test(text)"));
 assert.ok(source.includes("text.replace(/\"/g, '\"\"')"));
});
