import Link from "next/link";
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
  // Best-effort expiry sweep so clips past their lifetime drop out of the feed.
  if (supabase) await supabase.rpc("raye2_run_maintenance");
  return (
    <main className="raye2-clips-page" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <header className="raye2-watch-top">
        <Link className="raye2-brand" href="/raye2/home" aria-label="Raye2 home"><span className="raye2-mini-brand-glyph">R</span></Link>
        <nav><Link href="/watch">{isArabic ? "شاهد" : "Watch"}</Link><Link href="/minis">{isArabic ? "مينيز" : "Mini's"}</Link></nav>
      </header>
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
