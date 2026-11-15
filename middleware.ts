import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

// Refresh sessions for creator pages, their protected API routes, and the member-aware public pages that
// read the signed-in member on the server. Without a refresh here an expired access token makes those pages
// treat a signed-in member as signed out. Fully anonymous pages and static assets stay off the matcher to
// avoid unnecessary auth round-trips.
export async function middleware(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/creator/:path*",
    "/api/creator/:path*",
    "/account/:path*",
    "/saved/:path*",
    "/notifications/:path*",
    "/community/:path*",
    "/groups/:path*",
    "/watch/:path*",
    "/raye2/home/:path*"
  ]
};
