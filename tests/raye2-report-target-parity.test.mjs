import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
const sources = await Promise.all(files.map(name => readFile(new URL(name, dir), "utf8")));
const all = sources.join("\n");

const parse = value => value.split(",").map(item => item.trim().replace(/^'|'$/g, "")).filter(Boolean);
const lastOf = (re) => { let last = null; for (const m of all.matchAll(re)) last = m[1]; return last; };
const everyOf = (re) => [...all.matchAll(re)].map(m => m[1]);

test("the final report target list keeps every target any migration ever accepted", () => {
  // Migrations are append-only and each redefinition replaces the previous one. A later migration that
  // restates the list from memory silently drops a target an earlier feature added (this happened to
  // 'event_question'), so the final list must be a superset of every list ever declared.
  const finalList = lastOf(/p_target_type not in \(([^)]*)\) then raise exception 'invalid target type'/g);
  assert.ok(finalList, "expected the reporting RPC target list");
  const finalTargets = parse(finalList);
  for (const list of everyOf(/p_target_type not in \(([^)]*)\) then raise exception 'invalid target type'/g)) {
    for (const target of parse(list)) {
      assert.ok(finalTargets.includes(target), `final reporting RPC dropped previously supported target '${target}'`);
    }
  }
  const finalConstraint = lastOf(/content_reports_target_type_check\s+check \(target_type in \(([^)]*)\)\)/g);
  assert.ok(finalConstraint, "expected a content_reports target-type constraint");
  const constraintTargets = parse(finalConstraint);
  for (const list of everyOf(/content_reports_target_type_check\s+check \(target_type in \(([^)]*)\)\)/g)) {
    for (const target of parse(list)) {
      assert.ok(constraintTargets.includes(target), `final constraint dropped previously allowed target '${target}'`);
    }
  }
  for (const target of finalTargets) {
    assert.ok(constraintTargets.includes(target), `constraint is missing RPC target '${target}'`);
  }
});
