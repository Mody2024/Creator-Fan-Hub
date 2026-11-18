import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const PALETTE = new Set(["#0b0b0d","#141416","#1c1c1f","#242427","#4d8df6","#2f6fe0","#9dc0ff","#a1a1aa","#d6d6db","#f4f4f6","#5cc98f","#e0b878","#e87d85","#ffffff","#000000"]);

async function collectCss(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...(await collectCss(full)));
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

const cssFiles = await collectCss(new URL("../src", import.meta.url).pathname);

test("every stylesheet uses only the single black/grey/blue Raye2 palette", async () => {
  const stray = [];
  for (const file of cssFiles) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      if (!PALETTE.has(match[0].toLowerCase())) stray.push(file + " " + match[0]);
    }
  }
  assert.deepEqual(stray, []);
});

test("no light/dark theme switching exists (one theme only)", async () => {
  for (const file of cssFiles) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /prefers-color-scheme/);
  }
});

test("core tokens resolve to the shared palette", async () => {
  const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /--bg:#0b0b0d/);
  assert.match(globals, /--panel:#141416/);
  assert.match(globals, /--accent:#4d8df6/);
  assert.match(globals, /--muted:#a1a1aa/);
});
