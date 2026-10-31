import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

// Refresh sessions only for creator pages and their protected API routes.
// Public pages and static assets avoid unnecessary auth round-trips.
export async function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/creator/:path*", "/api/creator/:path*"]
};
