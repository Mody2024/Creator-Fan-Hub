import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AccountSettings from "./account-settings";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [supabase, cookieStore] = await Promise.all([createSupabaseServerClient(), cookies()]);
  const isArabic = cookieStore.get("raye2_locale")?.value === "ar";
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || typeof claims?.claims?.sub !== "string") redirect("/creator/login");
  return (
    <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6 }}>RAYE2 / ACCOUNT</span>
      </header>
      <AccountSettings locale={isArabic ? "ar" : "en"} />
    </main>
  );
}
