import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ClipsClient from "./clips-client";
import "./clips-raye2.css";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: claims } = await supabase.auth.getClaims();
    if (typeof claims?.claims?.sub === "string") {
      const { data: isPlatformAdmin } = await supabase.rpc("raye2_is_platform_admin");
      if (isPlatformAdmin === true) await supabase.rpc("raye2_run_maintenance");
    }
  }
  return (
    <main className="raye2-clips-page" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <div className="raye2-clips-heading">
        <span className="raye2-section-label">RAYE2 / {isArabic ? "مقاطع المجتمع" : "COMMUNITY CLIPS"}</span>
        <h1>{isArabic ? <>مقاطع <em>المجتمع.</em></> : <>Community <em>clips.</em></>}</h1>
        <p className="raye2-muted">
          {isArabic
            ? "اختر جزءًا مسموحًا من فيديو منشور وشاركه كمقطع خاص بك، مع الإشارة إلى المصدر. تنتهي الصلاحية بعد ٣٠ يومًا."
            : "Pick an allowed moment from a published Raye2 video and share it as your own clip, with source attribution. Clips expire after 30 days."}
        </p>
      </div>
      <ClipsClient />
    </main>
  );
}
