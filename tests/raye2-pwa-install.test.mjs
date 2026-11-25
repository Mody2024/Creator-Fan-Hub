import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/app/raye2-shell/pwa-install.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/app/raye2-shell/pwa-install.module.css", import.meta.url), "utf8");

test("PWA install prompt waits for browser support and a user action", () => {
  assert.match(component, /beforeinstallprompt/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /onClick=\{\(\) => void install\(\)\}/);
  assert.match(component, /await promptEvent\.prompt\(\)/);
  assert.doesNotMatch(component, /promptEvent\.prompt\(\)\.then/);
});

test("PWA install prompt is bilingual and safely dismissible", () => {
  assert.match(component, /Keep Raye2 close/);
  assert.match(component, /خلّي Raye2 على جهازك/);
  assert.match(component, /aria-label=/);
  assert.match(component, /appinstalled/);
});

test("PWA install prompt is mounted globally and has responsive branded styling", () => {
  assert.match(layout, /<PwaInstall \/>/);
  assert.match(styles, /#0b0b0d/);
  assert.match(styles, /#4d8df6/);
  assert.match(styles, /@media\(min-width:768px\)/);
  assert.match(styles, /:focus-visible/);
});

test("launch communication surfaces use the shared Raye2 chalk typography", async () => {
  const groupStyles = await readFile(new URL("../src/app/groups/groups.css", import.meta.url), "utf8");
  const chatStyles = await readFile(new URL("../src/app/raye2/raye2.module.css", import.meta.url), "utf8");
  const adminStyles = await readFile(new URL("../src/app/creator/raye2/admin.module.css", import.meta.url), "utf8");
  assert.match(groupStyles, /font-family:var\(--raye2-font-chalk/);
  assert.match(groupStyles, /font:600 12px\/1\.5 var\(--raye2-font-chalk/);
  assert.match(chatStyles, /font-family:var\(--raye2-font-chalk/);
  assert.match(adminStyles, /font-family:var\(--raye2-font-chalk/);
});
