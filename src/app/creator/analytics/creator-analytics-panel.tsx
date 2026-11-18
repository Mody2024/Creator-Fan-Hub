"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type VideoMetric = {
  media_id: string;
  title: string;
  slug: string;
  category: string;
  published_at: string | null;
  expires_at: string | null;
  unique_viewers: number;
  unique_viewers_window: number;
  reactions: number;
  comments: number;
  completed_viewers: number;
};
type Analytics = {
  role?: string;
  window_days?: number;
  followers?: number;
  watch_time_available?: boolean;
  watch_time_note?: string;
  max_video_expiry_days?: number;
  totals?: { videos?: number; unique_viewers?: number; reactions?: number; comments?: number; completed_viewers?: number };
  videos?: VideoMetric[];
};

const num = (value: unknown) => Math.max(0, Number(value) || 0);

export default function CreatorAnalyticsPanel({ locale }: { locale: "en" | "ar" }) {
  const isAr = locale === "ar";
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const t = isAr
    ? { title: "الأداء الحقيقي", followers: "المتابعون", uniqueViewers: "مشاهدون فريدون", window: "خلال", days: "يوم", completed: "أكملوا المشاهدة", expiry: "انتهاء الصلاحية", setExpiry: "تعيين الانتهاء", clear: "إزالة الانتهاء", maxDays: "الحد الأقصى للأيام", noExpiry: "بدون انتهاء", expiresOn: "ينتهي في", loadError: "تعذر تحميل التحليلات الحقيقية.", saveError: "تعذر تحديث تاريخ الانتهاء.", note: "لا تُعرض بيانات وهمية. القياسات المتوفرة فقط هي المعروضة." }
    : { title: "Real performance", followers: "Followers", uniqueViewers: "Unique viewers", window: "Last", days: "days", completed: "Completed viewers", expiry: "Expiry", setExpiry: "Set expiry", clear: "Clear expiry", maxDays: "Max days", noExpiry: "No expiry", expiresOn: "Expires", loadError: "Could not load real analytics.", saveError: "Could not update the expiry.", note: "No fabricated metrics are shown. Only measurements that exist are displayed." };

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: result, error: rpcError } = await supabase.rpc("raye2_get_creator_analytics", { p_days: 30 });
    if (rpcError) setError(t.loadError);
    else setData((result ?? {}) as Analytics);
  }, [t.loadError]);

  useEffect(() => { void load(); }, [load]);

  async function setExpiry(mediaId: string, days: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyId(mediaId);
    const { error: rpcError } = await supabase.rpc("raye2_set_video_expiry", { p_media_id: mediaId, p_days: days });
    setBusyId("");
    if (rpcError) { setError(t.saveError); return; }
    await load();
  }

  if (error) return <section className="raye2-card raye2-card-pad"><p className="raye2-muted">{error}</p></section>;
  if (!data) return null;

  const totals = data.totals ?? {};
  const maxDays = num(data.max_video_expiry_days) || 14;

  return <section className="raye2-card raye2-card-pad">
    <div className="raye2-card-heading"><h2>{t.title}</h2><span className="raye2-pill">{t.window} {num(data.window_days) || 30} {t.days}</span></div>
    <div className="dashboard-stats">
      <article><span>{t.followers}</span><strong>{num(data.followers).toLocaleString()}</strong></article>
      <article><span>{t.uniqueViewers}</span><strong>{num(totals.unique_viewers).toLocaleString()}</strong></article>
      <article><span>{t.completed}</span><strong>{num(totals.completed_viewers).toLocaleString()}</strong></article>
    </div>
    <p className="raye2-muted">{t.note}{data.watch_time_available === false && data.watch_time_note ? " " + data.watch_time_note : ""}</p>
    <div className="raye2-analytics-table">
      {(data.videos ?? []).map(video => <article key={video.media_id}>
        <div><strong>{video.title}</strong><small>{video.expires_at ? t.expiresOn + " " + new Date(video.expires_at).toLocaleDateString(isAr ? "ar-EG" : "en-US") : t.noExpiry}</small></div>
        <span><b>{num(video.unique_viewers)}</b> {t.uniqueViewers}</span>
        <span><b>{num(video.completed_viewers)}</b> {t.completed}</span>
        <span className="creator-expiry-actions">
          <button type="button" disabled={busyId === video.media_id} onClick={() => void setExpiry(video.media_id, 14)}>{t.setExpiry} ({maxDays} {t.days})</button>
          <button type="button" disabled={busyId === video.media_id || !video.expires_at} onClick={() => void setExpiry(video.media_id, 0)}>{t.clear}</button>
        </span>
      </article>)}
    </div>
  </section>;
}
