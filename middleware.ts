import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

// Refresh sessions only for the private creator workspace. Public pages do
// not need an auth round-trip on every request.
export async function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/creator/:path*"]
};
