import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

/**
 * Shared server-side platform-admin check for Launch 1.0 feature visibility.
 * Fails closed: missing auth, inactive rows, query errors, and thrown errors are not admins.
 */
export async function isRaye2PlatformAdmin(supabase: ServerSupabaseClient | null): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (claimsError || typeof userId !== "string") return false;

    const { data: admin, error: adminError } = await supabase
      .from("creator_admins")
      .select("role")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();

    return !adminError && (admin?.role === "owner" || admin?.role === "admin");
  } catch {
    return false;
  }
}
