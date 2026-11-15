import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = p => readFile(new URL(p, import.meta.url), "utf8");
const [globals, designSystem, client, module] = await Promise.all([
  read("../src/app/globals.css"),
  read("../src/app/nhen-design-system.css"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/raye2.module.css")
]);

test("only one theme exists: no light or violet variant classes anywhere", () => {
  for (const css of [globals, designSystem, module]) {
    assert.doesNotMatch(css, /theme-(paper|violet|custom)/);
  }
});

test("the single theme carries the full semantic token set", () => {
  assert.match(globals, /--accent:#80b4ff/);
  assert.match(globals, /--success:/);
  assert.match(globals, /--warning:/);
  assert.match(globals, /--error:/);
  assert.match(globals, /--state-selected:/);
});

test("legacy lime-green and neon accents are purged", () => {
  for (const css of [globals, designSystem]) {
    assert.doesNotMatch(css, /216,255,117/);
    assert.doesNotMatch(css, /255,100,124/);
    assert.doesNotMatch(css, /165,139,255/);
  }
});

test("the chat client no longer offers a dark/light theme toggle", () => {
  assert.doesNotMatch(client, /themeToggle/);
  assert.doesNotMatch(client, /data-theme/);
  assert.doesNotMatch(module, /data-theme="light"/);
});
