import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = p => readFile(new URL(p, import.meta.url), "utf8");
const [model, home, community, chat, rail] = await Promise.all([
  read("../src/lib/platform-nav.ts"),
  read("../src/app/page.tsx"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2-shell/shell-rail.tsx")
]);

test("there is one shared platform navigation model", () => {
  assert.match(model, /export const PLATFORM_NAV_PRIMARY/);
  assert.match(model, /export const PLATFORM_NAV_ACCOUNT/);
  assert.match(model, /export const PLATFORM_NAV_RAYE2/);
  assert.match(model, /export function isPlatformNavActive/);
  assert.match(model, /href: "\/watch"/);
  assert.match(model, /href: "\/community"/);
});

// Launch 1.0 (Communication Edition): the rail is one shared launch map (MAIN / PERSONAL / SOON), not per-page arrays.
test("every surface renders navigation from the shared model, not bespoke arrays", () => {
  assert.match(home, /<ShellRail/);
  assert.match(community, /<ShellRail/);
  assert.match(rail, /const MAIN: Entry\[\]/);
  assert.match(rail, /const SOON: Entry\[\]/);
  assert.match(chat, /<ShellTopBar/);
  assert.doesNotMatch(chat, /const platformNav = \[/);
});

test("navigation uses the shared active rule rather than ad-hoc comparisons", () => {
  assert.match(rail, /\(entry\.match \?\? starts\(entry\.href\)\)\(pathname\)/);
});
