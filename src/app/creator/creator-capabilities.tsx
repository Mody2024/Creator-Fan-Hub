"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Capability = { action: string; allowed: boolean; reason: string };
type Capabilities = {
  role?: string;
  actions?: Capability[];
  quotas?: Record<string, number | null>;
  usage?: Record<string, number | null>;
};

const LABELS: Record<string, { en: string; ar: string }> = {
  publish_long_video: { en: "Publish long videos", ar: "نشر الفيديوهات الطويلة" },
  start_stream: { en: "Start streams", ar: "بدء البث المباشر" },
  publish_mini: { en: "Publish Mini's", ar: "نشر المينيز" },
  publish_moment: { en: "Publish Moments", ar: "نشر اللحظات" },
  studio_upload: { en: "Creator Studio uploads", ar: "الرفع في استوديو المبدع" },
  long_videos_per_month: { en: "Long videos / month", ar: "فيديوهات طويلة / شهر" },
  streams_per_month: { en: "Streams / month", ar: "بث مباشر / شهر" },
  minis_per_month: { en: "Mini's / month", ar: "مينيز / شهر" },
  moments_per_month: { en: "Moments / month", ar: "لحظات / شهر" }
};

export default function CreatorCapabilities({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("raye2_get_creator_capabilities");
      if (rpcError) setError(isAr ? "تعذر تحميل الصلاحيات." : "Could not load capabilities.");
      else setCaps((data ?? {}) as Capabilities);
    })();
  }, [isAr]);

  if (error) return <section className="module-block"><p>{error}</p></section>;
  if (!caps) return null;

  const t = isAr
    ? { title: "الصلاحيات والحصص", role: "الدور", allowed: "متاح", blocked: "غير متاح", quota: "الحصة", used: "المستخدم" }
    : { title: "Permissions & quotas", role: "Role", allowed: "Allowed", blocked: "Unavailable", quota: "Quota", used: "Used" };

  const quotaRows: Array<[string, number | null]> = [
    ["long_videos_per_month", caps.quotas?.long_videos_per_month ?? null],
    ["streams_per_month", caps.quotas?.streams_per_month ?? null],
    ["minis_per_month", caps.quotas?.minis_per_month ?? null],
    ["moments_per_month", caps.quotas?.moments_per_month ?? null]
  ];

  return (
    <section className="module-block" id="creator-capabilities">
      <div className="module-heading"><div><h2>{t.title}</h2><p>{t.role}: {caps.role ?? "none"}</p></div></div>
      <div className="module-grid">
        {(caps.actions ?? []).map((cap) => (
          <article className="module-card" key={cap.action}>
            <div className="module-card-top">
              <span>{LABELS[cap.action]?.[isAr ? "ar" : "en"] ?? cap.action}</span>
              <span className="module-state">{cap.allowed ? t.allowed : t.blocked}</span>
            </div>
            {!cap.allowed && cap.reason ? <p>{cap.reason}</p> : null}
          </article>
        ))}
      </div>
      <div className="dashboard-stats">
        {quotaRows.map(([metric, quota]) => {
          const used = caps.usage?.[metric] ?? null;
          return (
            <article key={metric}>
              <span>{LABELS[metric]?.[isAr ? "ar" : "en"] ?? metric}</span>
              <strong>{used ?? "—"} / {quota ?? "—"}</strong>
              <small>{t.used} / {t.quota}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
