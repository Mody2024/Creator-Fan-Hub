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

test("analytics CSV safely handles invalid dates and non-finite or negative metric values",()=>{
 assert.ok(source.includes("function safeCount(value: unknown)"));
 assert.ok(source.includes("Number.isFinite(parsed)?Math.max(0,parsed):0"));
 assert.ok(source.includes("function safeDate(value: string | null)"));
 assert.ok(source.includes("Number.isFinite(timestamp)?new Date(timestamp).toISOString().slice(0,10):null"));
 assert.ok(source.includes("safeDate(item.publishedAt) ??"));
 assert.ok(source.includes("safeCount(item.views)"));
 assert.ok(source.includes("safeCount(item.reactions)"));
 assert.ok(source.includes("safeCount(item.comments)"));
});
