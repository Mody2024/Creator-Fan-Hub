import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

// Next.js 15 uses middleware.ts (not proxy.ts). Keep the matcher scoped to
// the private creator workspace so public visitors do not make auth requests.
export async function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/creator/:path*"]
};
