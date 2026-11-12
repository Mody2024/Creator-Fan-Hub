import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LiveRow = {
  stream_id: string;
  title: string;
  streamer_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  health: string;
  playback_url: string | null;
  started_at: string | null;
  replay_until: string | null;
};

export default async function LivePage() {
  const cookieStore = await cookies();
  const isArabic = cookieStore.get("nhen_locale")?.value === "ar";
  const supabase = await createSupabaseServerClient();
  let rows: LiveRow[] = [];
  if (supabase) {
    const { data } = await supabase.rpc("raye2_get_live_now", { p_limit: 24 });
    rows = (data ?? []) as LiveRow[];
  }
  const t = isArabic
    ? { title: "مباشر الآن", note: "بث مباشر وإعادات متاحة من صُنّاع المحتوى.", none: "لا يوجد بث مباشر الآن.", live: "مباشر", replay: "إعادة", watch: "شاهد" }
    : { title: "Live now", note: "Live streams and available replays from creators.", none: "No live streams right now.", live: "Live", replay: "Replay", watch: "Watch" };

  return (
    <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, letterSpacing: 2, opacity: 0.6 }}>RAYE2 / LIVE</span>
          <h1 style={{ margin: "4px 0" }}>{t.title}</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>{t.note}</p>
        </div>
        <Link href="/raye2/home">↗ {isArabic ? "الرئيسية" : "Home"}</Link>
      </header>
      {rows.length === 0 ? <p style={{ marginTop: 32, opacity: 0.7 }}>{t.none}</p> : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 28, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {rows.map((row) => (
            <li key={row.stream_id}>
              <Link href={`/live/${row.stream_id}`} style={{ display: "block", border: "1px solid rgba(128,128,128,0.25)", borderRadius: 12, padding: 16, textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, letterSpacing: 1.5, color: row.status === "live" ? "#e5484d" : "inherit" }}>{row.status === "live" ? t.live.toUpperCase() : t.replay.toUpperCase()}</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{row.health}</span>
                </div>
                <h2 style={{ fontSize: 18, margin: "8px 0" }}>{row.title}</h2>
                <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>{row.display_name ?? row.handle ?? row.streamer_id}</p>
                <span style={{ display: "inline-block", marginTop: 10, fontSize: 12 }}>{t.watch} ↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
