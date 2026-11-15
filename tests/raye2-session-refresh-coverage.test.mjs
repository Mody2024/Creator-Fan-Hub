import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
const middleware = await readFile(root + "middleware.ts", "utf8");
const libMiddleware = await readFile(root + "src/lib/supabase/middleware.ts", "utf8");

test("session refresh covers creator routes and their protected API", () => {
  assert.match(middleware, /"\/creator\/:path\*"/);
  assert.match(middleware, /"\/api\/creator\/:path\*"/);
});

test("session refresh also covers member-aware public pages", () => {
  for (const route of ["/account/:path*", "/saved/:path*", "/notifications/:path*", "/community/:path*", "/groups/:path*", "/watch/:path*", "/raye2/home/:path*"]) {
    assert.ok(middleware.includes(`"${route}"`), `middleware must refresh sessions for ${route}`);
  }
});

test("refresh validates the token with getClaims rather than trusting unverified session data", () => {
  assert.match(libMiddleware, /await supabase\.auth\.getClaims\(\)/);
  assert.doesNotMatch(libMiddleware, /supabase\.auth\.getSession\(\)/);
});
