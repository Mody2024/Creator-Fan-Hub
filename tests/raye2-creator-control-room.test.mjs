import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");
const page=await readFile(new URL("../src/app/creator/page.tsx",import.meta.url),"utf8");
test("Raye2 creator control room has a scoped consistent dashboard redesign",()=>{
 assert.ok(page.includes('className="dashboard-shell raye2-creator-shell"'));
 for(const selector of [".raye2-creator-shell .dashboard-topbar",".raye2-creator-shell .dashboard-welcome",".raye2-creator-shell .dashboard-stats",".raye2-creator-shell .creator-quick-nav",".raye2-creator-shell .dashboard-disclaimer"])assert.ok(css.includes(selector));
});
test("Raye2 creator control room supports mobile, RTL and reduced motion",()=>{
 assert.ok(css.includes("@media(max-width:620px){.raye2-creator-shell"));
 assert.ok(css.includes(".raye2-creator-shell[dir=rtl]"));
 assert.ok(css.includes("@media(prefers-reduced-motion:reduce){.raye2-creator-shell"));
});
