import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MomentsClient from "./moments-client";
import "./moments-raye2.css";

export const dynamic = "force-dynamic";

type MomentRow = {
  id: string; body: string; linked_video_id: string | null; video_slug: string | null;
  moment_start_seconds: number | null; moment_end_seconds: number | null;
  created_at: string; expires_at: string | null;
  author_handle: string | null; author_display_name: string | null; author_avatar_url: string | null;
};

export default async function MomentsPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const labels = isArabic
    ? { watch: "شاهد", community: "المجتمع", eyebrow: "RAYE2 / لحظات", intro: "مقاطع مختارة من فيديوهات الصنّاع، تبقى في المجتمع ٧ أيام.", open: "شاهد الفيديو ↗", empty: "لا توجد لحظات حالية.", expires: "تنتهي" }
    : { watch: "Watch", community: "Community", eyebrow: "RAYE2 / MOMENTS", intro: "Highlights clipped from creator videos — live in the community for 7 days.", open: "Watch the video ↗", empty: "No Moments are live right now.", expires: "Expires" };
  const supabase = await createSupabaseServerClient();
  let moments: MomentRow[] = [];
  if (supabase) {
    await supabase.rpc("raye2_run_maintenance");
    const { data } = await supabase.rpc("raye2_list_moments", { p_limit: 40 });
    moments = (Array.isArray(data) ? data : []) as MomentRow[];
  }
  const clip = (m: MomentRow) => (m.moment_start_seconds != null && m.moment_end_seconds != null ? `${m.moment_start_seconds}s – ${m.moment_end_seconds}s` : "");
  return (
    <main className="raye2-moments-page" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <div className="raye2-moments-heading">
        <span className="raye2-section-label">{labels.eyebrow}</span>
        <h1>{isArabic ? <>لحظات <em>مميزة.</em></> : <>Featured <em>Moments.</em></>}</h1>
        <p className="raye2-muted">{labels.intro}</p>
      </div>
      <MomentsClient />
      {moments.length ? (
        <div className="raye2-moments-grid">
          {moments.map((m) => (
            <article className="raye2-moment-card" key={m.id}>
              <span className="raye2-moment-badge">{clip(m)}</span>
              <h2>{m.body}</h2>
              <small>{m.author_display_name ?? m.author_handle ?? "Member"}{m.expires_at ? ` · ${labels.expires} ${new Date(m.expires_at).toLocaleDateString(isArabic ? "ar-EG" : "en-US", { month: "short", day: "numeric" })}` : ""}</small>
              {m.video_slug ? <Link className="raye2-action" href={`/watch/${m.video_slug}`}>{labels.open}</Link> : null}
            </article>
          ))}
        </div>
      ) : <div className="raye2-card raye2-empty-state">{labels.empty}</div>}
    </main>
  );
}
