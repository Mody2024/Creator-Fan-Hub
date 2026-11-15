import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel + "/")));
    else out.push(rel);
  }
  return out;
}

const TEXT_EXT = /\.(tsx?|mjs|cjs|js|css)$/;

// Predecessor *branding* forms. Applied database identifiers (nhen_* migrations,
// storage buckets, advisory locks) are immutable and intentionally excluded.
const PREDECESSOR = /\bNHEN\b|Nhen\?|Nhenbit|nhen-|NhenReactionArt|nhen_locale/;

test("no predecessor nhen branding remains in the product source", async () => {
  const files = await walk("src/");
  const offenders = [];
  for (const file of files) {
    if (!TEXT_EXT.test(file)) continue;
    const source = await readFile(new URL(file, root), "utf8");
    if (PREDECESSOR.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `predecessor branding leaked into: ${offenders.join(", ")}`);
});

test("the design system and reaction art use Raye2 names", async () => {
  const layout = await readFile(new URL("src/app/layout.tsx", root), "utf8");
  assert.match(layout, /raye2-design-system\.css/);
  const art = await readFile(new URL("src/app/watch/[slug]/raye2-reaction-art.tsx", root), "utf8");
  assert.match(art, /export default function Raye2ReactionArt/);
});
