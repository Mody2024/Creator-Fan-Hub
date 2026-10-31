import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Next.js 15 wires Supabase session refresh into the creator workspace", async () => {
  const [entrypoint, helper, serverClient] = await Promise.all([
    read("../src/middleware.ts"),
    read("../src/lib/supabase/middleware.ts"),
    read("../src/lib/supabase/server.ts")
  ]);

  assert.ok(entrypoint.includes('from "@/lib/supabase/middleware"'));
  assert.ok(entrypoint.includes("refreshSupabaseSession(request)"));
  assert.ok(entrypoint.includes('matcher: ["/creator/:path*"]'));
  assert.ok(helper.includes("createServerClient"));
  assert.ok(helper.includes("request.cookies.getAll()"));
  assert.ok(helper.includes("request.cookies.set(name, value)"));
  assert.ok(helper.includes("response.cookies.set(name, value, options)"));
  assert.ok(helper.includes("supabase.auth.getClaims()"));
  assert.ok(!helper.includes("supabase.auth.getSession()"));
  assert.ok(serverClient.includes("Server Components cannot write cookies"));
});
