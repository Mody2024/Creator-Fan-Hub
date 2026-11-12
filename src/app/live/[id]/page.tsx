import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LiveDetail = {
  id: string;
  title: string;
  description: string;
  streamer_id: string;
  status: string;
  visibility: string;
  health: string;
  health_detail: string;
  playback_url: string | null;
  started_at: string | null;
  ended_at: string | null;
  replay_until: string | null;
  max_duration_seconds: number;
};

export default async function LiveStreamPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, cookieStore] = await Promise.all([params, cookies()]);
  const isArabic = cookieStore.get("nhen_locale")?.value === "ar";
  const supabase = await createSupabaseServerClient();
  let stream: LiveDetail | null = null;
  let unavailable = false;
  if (supabase) {
    const { data, error } = await supabase.rpc("raye2_get_live_stream", { p_stream_id: id });
    const row = (Array.isArray(data) ? data[0] : data) as LiveDetail | undefined;
    if (error || !row) unavailable = true;
    else stream = row;
  }
  const t = isArabic
    ? { unavailable: "هذا البث غير متاح.", back: "العودة إلى المباشر", live: "مباشر الآن", replay: "إعادة", ended: "انتهى البث", health: "حالة الاتصال", replayUntil: "الإعادة متاحة حتى", noProvider: "سيظهر المشغل عند ربط مزوّد البث الفعلي." }
    : { unavailable: "This stream is not available.", back: "Back to live", live: "Live now", replay: "Replay", ended: "Stream ended", health: "Connection health", replayUntil: "Replay available until", noProvider: "The player appears once a real streaming provider is connected." };

  return (
    <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      <Link href="/live">← {t.back}</Link>
      {unavailable || !stream ? <p style={{ marginTop: 24, opacity: 0.7 }}>{t.unavailable}</p> : (
        <section style={{ marginTop: 20 }}>
          <span style={{ fontSize: 11, letterSpacing: 1.5, color: stream.status === "live" ? "#e5484d" : "inherit" }}>
            {stream.status === "live" ? t.live.toUpperCase() : stream.status === "replay" ? t.replay.toUpperCase() : t.ended.toUpperCase()}
          </span>
          <h1 style={{ margin: "8px 0" }}>{stream.title}</h1>
          <p style={{ opacity: 0.75 }}>{stream.description}</p>
          <div style={{ aspectRatio: "16 / 9", background: "rgba(128,128,128,0.15)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 16 }}>
            {stream.playback_url ? (
              <video src={stream.playback_url} controls style={{ width: "100%", height: "100%", borderRadius: 12 }} />
            ) : (
              <p style={{ opacity: 0.7, fontSize: 13, padding: 16, textAlign: "center" }}>{t.noProvider}</p>
            )}
          </div>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>{t.health}: {stream.health}{stream.health_detail ? ` · ${stream.health_detail}` : ""}</p>
          {stream.replay_until ? <p style={{ fontSize: 12, opacity: 0.7 }}>{t.replayUntil} {new Date(stream.replay_until).toLocaleString(isArabic ? "ar-EG" : "en")}</p> : null}
        </section>
      )}
    </main>
  );
}
