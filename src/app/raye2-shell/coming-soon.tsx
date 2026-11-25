import Link from "next/link";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRaye2PlatformAdmin } from "@/lib/raye2-admin";
import ShellIcon, { type ShellIconName } from "./shell-icons";

type Feature = "watch" | "minis" | "moments" | "clips" | "live" | "series";
type Copy = { icon: ShellIconName; en: [string, string]; ar: [string, string] };

const FEATURES: Record<Feature, Copy> = {
  watch: { icon: "watch", en: ["Watch", "Long-form videos from creators, with reactions, saves and threaded comments."], ar: ["مشاهدة", "فيديوهات طويلة من المبدعين مع التفاعلات والحفظ والتعليقات المتسلسلة."] },
  minis: { icon: "shorts", en: ["Mini’s", "Short vertical clips you swipe through, made for quick moments."], ar: ["المقاطع القصيرة", "مقاطع عمودية قصيرة تتصفحها بالتمرير، مصممة للحظات السريعة."] },
  moments: { icon: "moment", en: ["Moments", "Photos and clips that disappear after a day."], ar: ["اللحظات", "صور ومقاطع تختفي بعد يوم."] },
  clips: { icon: "clips", en: ["Clips", "Highlights cut from videos and live sessions."], ar: ["المقاطع", "أبرز اللحظات المقتطعة من الفيديوهات والبث."] },
  live: { icon: "live", en: ["Live streaming", "Go live to your community with chat alongside."], ar: ["البث المباشر", "ابدأ بثًا مباشرًا لمجتمعك مع محادثة بجانبه."] },
  series: { icon: "series", en: ["Series & exclusives", "Playlists and member-only releases."], ar: ["السلاسل والحصريات", "قوائم تشغيل وإصدارات خاصة بالأعضاء."] }
};

const T = {
  en: { soon: "Coming soon", lead: "Raye2 is launching with communication first.", body: "Messaging, groups, voice and polls are ready now. Media arrives next.", ready: "Ready now", next: "Next", messages: "Open messages", groups: "Explore groups", roadmap: ["Messaging", "Groups", "Voice", "Polls", "Media"] },
  ar: { soon: "قريبًا", lead: "تنطلق Raye2 بالتواصل أولًا.", body: "الرسائل والمجموعات والصوت والاستطلاعات جاهزة الآن، والوسائط تأتي بعدها.", ready: "جاهز الآن", next: "التالي", messages: "افتح الرسائل", groups: "استكشف المجموعات", roadmap: ["الرسائل", "المجموعات", "الصوت", "الاستطلاعات", "الوسائط"] }
} as const;

/** Polished "unavailable at launch" screen for the preserved media features. */
export default async function ComingSoon({ feature }: { feature: Feature }) {
  const locale = (await cookies()).get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const t = T[locale];
  const [title, text] = FEATURES[feature][locale];
  return (
    <main className="raye2-soon-page" aria-labelledby="raye2-soon-title">
      <div className="raye2-soon-card">
        <span className="raye2-soon-icon"><ShellIcon name={FEATURES[feature].icon} size={40} strokeWidth={1.6} /></span>
        <span className="raye2-soon-badge">{t.soon}</span>
        <h1 id="raye2-soon-title">{title}</h1>
        <p className="raye2-soon-text">{text}</p>
        <p className="raye2-soon-lead"><strong>{t.lead}</strong> {t.body}</p>
        <ol className="raye2-soon-roadmap" aria-label={t.lead}>
          {t.roadmap.map((step, index) => (
            <li key={step} data-state={index < 4 ? "ready" : "next"}><span aria-hidden="true">{index < 4 ? "✓" : "…"}</span>{step}<small>{index < 4 ? t.ready : t.next}</small></li>
          ))}
        </ol>
        <div className="raye2-soon-actions">
          <Link className="raye2-shell-join" href="/raye2">{t.messages}</Link>
          <Link className="raye2-ws-pill" href="/groups">{t.groups}</Link>
        </div>
      </div>
    </main>
  );
}

/**
 * Server-side launch gate. Only active owner/admin accounts receive the preserved media routes.
 * The role is read from the protected creator_admins table after verifying the session claims.
 */
export async function ComingSoonGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  if (await isRaye2PlatformAdmin(supabase)) return <>{children}</>;
  return <ComingSoon feature={feature} />;
}
