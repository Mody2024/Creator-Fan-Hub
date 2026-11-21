import ShellTopBar from "@/app/raye2-shell/shell-top";
import ShellRail from "@/app/raye2-shell/shell-rail";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MinisClient from "./minis-client";
import "./minis-raye2.css";

export const dynamic = "force-dynamic";

export default async function MinisPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const supabase = await createSupabaseServerClient();
  // Best-effort expiry sweep so clips past their lifetime drop out of the feed.
  if (supabase) await supabase.rpc("raye2_run_maintenance");
  const labels = isArabic
    ? { watch: "شاهد", community: "المجتمع", eyebrow: "RAYE2 / مينيز", title: "مقاطع <em>سريعة.</em>", intro: "مقاطع قصيرة من الصنّاع والمجتمع، تعيش ٣٠ يومًا ثم تنتهي صلاحيتها." }
    : { watch: "Watch", community: "Community", eyebrow: "RAYE2 / MINI'S", title: "Quick <em>Mini's.</em>", intro: "Short clips from creators and the community — live for 30 days, then they expire." };
  return (
    <main className="raye2-minis-page" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <ShellTopBar locale={locale} />
      <div className="raye2-frame">
      <ShellRail locale={locale} showVideos />
      <div className="raye2-frame-main">
      <div className="raye2-minis-heading">
        <span className="raye2-section-label">{labels.eyebrow}</span>
        <h1>{isArabic ? <>مقاطع <em>مينيز.</em></> : <>Quick <em>Mini&apos;s.</em></>}</h1>
        <p className="raye2-muted">{labels.intro}</p>
      </div>
      <MinisClient />
      </div>
      </div>
    </main>
  );
}
