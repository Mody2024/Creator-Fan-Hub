import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import styles from "./studio.module.css";
import CreatorCapabilities from "@/app/creator/creator-capabilities";
import CreatorLiveStudio from "@/app/creator/creator-live-studio";
import CreatorVideoExclusivity from "@/app/creator/creator-video-exclusivity";
import AdDirector from "@/app/creator/ad-director";
import MonetizationReport from "@/app/creator/monetization-report";
import MediaLibrary from "@/app/creator/media-library";
import ContentLibrary from "@/app/creator/content-library";
import VideoStudio from "@/app/creator/video-studio";
import CreatorNotifications from "@/app/creator/creator-notifications";
import AchievementInsights from "@/app/creator/achievement-insights";
import CreatorRewardsCenter from "@/app/creator/rewards-center";
import PublishingHistory from "@/app/creator/publishing-history";
import "@/app/creator/raye2-creator-workspace.css";
import "@/app/raye2/studio/video-publishing-studio.css";
import WorkspaceShell from "@/app/raye2-shell/workspace-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Studio" };

type MediaAsset = { media_id: string; title: string; media_type: string; is_published: boolean; created_at?: string; processing_status?: string | null };
type VideoEntry = { media_id: string; slug: string; published_at: string | null };

export default async function Raye2CreatorStudioPage() {
  const [supabase, cookieStore, siteConfig] = await Promise.all([createSupabaseServerClient(), cookies(), getPublicSiteConfig()]);
  if (!supabase) redirect("/creator/login?setup=required");
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/creator/login");

  const { data: access, error: accessError } = await supabase
    .from("creator_admins")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (accessError || !access || !["owner", "admin", "creator", "streamer", "editor"].includes(access.role)) {
    redirect("/creator/login?access=restricted");
  }

  const role = access.role as "owner" | "admin" | "creator" | "streamer" | "editor" | "moderator" | "analyst";
  // Streamers can publish content types allowed by their server-enforced role quotas, even when their long-video quota is zero.
  const canPublish = ["owner", "admin", "creator", "streamer", "editor"].includes(role);
  const canStream = ["owner", "admin", "streamer"].includes(role);
  const canAnalyze = ["owner", "admin", "creator", "streamer"].includes(role);

  const [{ data: mediaData, error: mediaError }, { data: videoData, error: videoError }] = await Promise.all([
    supabase.rpc("get_creator_media", { p_limit: 200 }),
    supabase.from("video_catalog").select("media_id,slug,published_at").order("updated_at", { ascending: false }).limit(200)
  ]);
  const media = (mediaData ?? []) as MediaAsset[];
  const videos = (videoData ?? []) as VideoEntry[];
  const publishedMedia = media.filter(item => item.is_published).length;
  const draftMedia = media.length - publishedMedia;
  const publishedVideos = videos.filter(item => !!item.published_at).length;
  const recentMedia = [...media].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);
  const mediaUnavailable = !!mediaError;
  const catalogUnavailable = !!videoError;
  const t = isArabic ? {
    eyebrow: "مساحة صُنّاع المحتوى", title: "", accent: "استوديو.", intro: "مساحة موحّدة لإدارة مكتبة الوسائط وصفحات المشاهدة والنشر وأداء المحتوى.",
    home: "العودة إلى الرئيسية", role: "الصلاحية الحالية", assets: "ملفات الوسائط", publicAssets: "ملفات منشورة", drafts: "مسودات خاصة", videos: "صفحات المشاهدة", published: "منشور",
    workspace: "مساحات العمل", recent: "أحدث الملفات", recentDesc: "آخر الملفات التي أضفتها إلى مكتبتك.", emptyRecent: "لم تضف أي ملفات بعد.", uploadNow: "رفع وسائط", videoNow: "إعداد صفحة مشاهدة", liveNow: "بدء بث مباشر", live: "البث المباشر", liveDesc: "ابدأ بثًا مباشرًا وأدر حالتك من أدوات المبدع.", viewAll: "عرض المكتبة", privateLabel: "مسودة خاصة", publicLabel: "منشور", readyLabel: "جاهز", waitingLabel: "قيد المعالجة", failedLabel: "فشل", manage: "إدارة المحتوى", manageDesc: "افتح أدوات رفع الملفات وتحرير البيانات الوصفية والنشر وقوائم التشغيل وسجل الإصدارات.", open: "فتح أدوات المحتوى",
    analytics: "تحليلات الأداء", analyticsDesc: "راجع إجماليات المشاهدات والتفاعلات والتعليقات دون كشف هويات المشاهدين.",
    beta: "مختبر بيتا", betaDesc: "ميزات قيد التجهيز ستظهر هنا عند تفعيلها. لن تظهر كميزات جاهزة قبل اكتمال تنفيذها واختبارها.",
    noAccess: "تعذر تحميل بعض بيانات المكتبة. يمكنك إعادة المحاولة من أدوات المحتوى.", coming: "قريبًا / تجريبي", note: "الأرقام تعكس البيانات التي تسمح بها صلاحيات حسابك فقط."
  } : {
    eyebrow: "CREATOR WORKSPACE", title: "", accent: "Studio.", intro: "One workspace for your media library, watch pages, publishing workflow and content performance.",
    home: "Back to home", role: "CURRENT ACCESS", assets: "MEDIA ASSETS", publicAssets: "Published assets", drafts: "Private drafts", videos: "WATCH PAGES", published: "Published",
    workspace: "WORKSPACES", recent: "RECENT MEDIA", recentDesc: "The latest assets added to your library.", emptyRecent: "You have not added any media yet.", uploadNow: "Upload media", videoNow: "Build a watch page", liveNow: "Start a live stream", live: "Live streaming", liveDesc: "Go live and manage your stream from the creator tools.", viewAll: "Open media library", privateLabel: "PRIVATE DRAFT", publicLabel: "PUBLISHED", readyLabel: "READY", waitingLabel: "PROCESSING", failedLabel: "FAILED", manage: "Content management", manageDesc: "Open the existing upload, asset metadata, publishing, playlist and version-history tools.", open: "Open content tools",
    analytics: "Performance analytics", analyticsDesc: "Review aggregate views, reactions and comments without exposing viewer identities.",
    beta: "Beta lab", betaDesc: "Upcoming experiments will appear here when enabled. Nothing is labelled ready until it is implemented and tested.",
    noAccess: "Some library data could not be loaded. You can retry from the content tools.", coming: "COMING SOON / EXPERIMENTAL", note: "Counts reflect only the data your account is allowed to access."
  };

  return <main className={styles.shell} data-raye2-surface="creator-studio" data-raye2-ws="on" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
    <WorkspaceShell role={role} />
<nav className="raye2-ws-crumbs" aria-label={isArabic ? "اختصارات الاستوديو" : "Studio shortcuts"}><Link className="raye2-ws-pill" href="/raye2/home">← {t.home}</Link>{canAnalyze && <Link className="raye2-ws-pill" href="/creator/analytics">{isArabic ? "التحليلات" : "Analytics"}</Link>}{canStream && <Link className="raye2-ws-pill" href="#creator-live-studio">{isArabic ? "البث المباشر" : "Live"}</Link>}</nav>
    <section className={styles.hero} data-slot="hero">
      <div><span className={styles.eyebrow}>CREATOR TOOLS</span><h1>{t.title}<em>{t.accent}</em></h1><p>{t.intro}</p></div>
      <div className={styles.heroMark} aria-hidden="true">{siteConfig.logoUrl ? <img src={siteConfig.logoUrl} alt="" /> : null}</div>
    </section>
    <section className={styles.metrics} data-slot="metrics" aria-label={isArabic ? "ملخص المكتبة" : "Library overview"}>
      <article className={styles.metric}><span>{t.assets}</span><strong>{mediaUnavailable ? "—" : media.length.toLocaleString(locale)}</strong><small>{t.note}</small></article>
      <article className={styles.metric}><span>{t.publicAssets}</span><strong>{mediaUnavailable ? "—" : publishedMedia.toLocaleString(locale)}</strong><small>{t.published}</small></article>
      <article className={styles.metric}><span>{t.drafts}</span><strong>{mediaUnavailable ? "—" : draftMedia.toLocaleString(locale)}</strong><small>{isArabic ? "تظل خاصة حتى النشر" : "Private until published"}</small></article>
      <article className={styles.metric}><span>{t.videos}</span><strong>{catalogUnavailable ? "—" : publishedVideos.toLocaleString(locale)}</strong><small>{t.published}</small></article>
    </section>
    {(mediaUnavailable || catalogUnavailable) && <p className={styles.notice} role="status">{t.noAccess}</p>}
    <section className={styles.workflow} data-slot="workflow">
      <div className={styles.workflowIntro}><span className={styles.eyebrow}>{isArabic ? "مسار النشر" : "PUBLISHING WORKFLOW"}</span><h2>{isArabic ? "من الملف إلى صفحة المشاهدة." : "From asset to watch page."}</h2><p>{isArabic ? "ارفع الوسائط أولًا، ثم جهّز صفحة المشاهدة، وبعدها تابع الأداء." : "Upload an asset, prepare its watch page, then follow its performance."}</p></div>
      <div className={styles.workflowActions}>
        {canPublish && <Link href="#creator-media" className={styles.primaryAction}><span>01</span><strong>{t.uploadNow}</strong><i>↗</i></Link>}
        {canPublish && <Link href="#creator-video-studio" className={styles.primaryAction}><span>02</span><strong>{t.videoNow}</strong><i>↗</i></Link>}{canStream && <Link href="#creator-live-studio" className={styles.primaryAction}><span>03</span><strong>{t.liveNow}</strong><i>↗</i></Link>}
        {canAnalyze && <Link href="/creator/analytics" className={styles.primaryAction}><span>03</span><strong>{isArabic ? "مراجعة الأداء" : "Review performance"}</strong><i>↗</i></Link>}
      </div>
    </section>
    <section className={styles.section} data-slot="recent">
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>{t.recent}</span><h2>{t.recentDesc}</h2></div>{canPublish && <Link className={styles.viewAll} href="#creator-media">{t.viewAll} ↗</Link>}</div>
      <div className={styles.recentList}>
        {recentMedia.map((item) => {
          const status = item.processing_status === "failed" ? t.failedLabel : ["waiting","queued","processing"].includes(item.processing_status ?? "") ? t.waitingLabel : item.is_published ? t.publicLabel : t.privateLabel;
          const statusClass = item.processing_status === "failed" ? styles.statusFailed : ["waiting","queued","processing"].includes(item.processing_status ?? "") ? styles.statusWaiting : item.is_published ? styles.statusPublished : styles.statusDraft;
          return <article className={styles.recentItem} key={item.media_id}><span className={styles.assetIcon} aria-hidden="true">{item.media_type === "video" || item.media_type === "youtube" ? "▶" : item.media_type === "audio" ? "♫" : item.media_type === "image" ? "▧" : "◇"}</span><div className={styles.assetDetails}><strong>{item.title}</strong><small>{item.media_type.toUpperCase()} {item.created_at ? "· " + new Date(item.created_at).toLocaleDateString(locale) : ""}</small></div><span className={statusClass}>{status}</span></article>;
        })}
        {!recentMedia.length && <p className={styles.emptyRecent}>{t.emptyRecent}</p>}
      </div>
    </section>
    <section className={styles.section} data-slot="workspaces">
      <div className={styles.sectionHead}><span className={styles.eyebrow}>{t.workspace}</span><h2>{t.manage}</h2></div>
      <div className={styles.grid}>
        {canPublish && <article className={styles.card}><span className={styles.cardIndex}>01 / PUBLISH</span><h3>{t.manage}</h3><p>{t.manageDesc}</p><Link className={styles.action} href="#creator-media">{t.open} ↗</Link></article>}
        {canAnalyze && <article className={styles.card}><span className={styles.cardIndex}>02 / INSIGHTS</span><h3>{t.analytics}</h3><p>{t.analyticsDesc}</p><Link className={styles.action} href="/creator/analytics">{isArabic ? "فتح التحليلات" : "Open analytics"} ↗</Link></article>}
        {canStream && <article className={styles.card}><span className={styles.cardIndex}>02 / LIVE</span><h3>{t.live}</h3><p>{t.liveDesc}</p><Link className={styles.action} href="#creator-live-studio">{isArabic ? "فتح أدوات البث" : "Open live tools"} ↗</Link></article>}
      </div>
    </section>
    <div className={styles.embeddedTools} data-slot="creator-tools">
      <CreatorCapabilities locale={locale} />
      {canStream ? <CreatorLiveStudio locale={locale} /> : null}
      <CreatorVideoExclusivity locale={locale} />
      <AdDirector locale={locale} />
      <MonetizationReport locale={locale} />
      {canPublish ? <MediaLibrary /> : null}
      {canPublish ? <ContentLibrary locale={locale} /> : null}
      {canPublish ? <VideoStudio /> : null}
      <CreatorNotifications locale={locale} />
      <AchievementInsights />
      <CreatorRewardsCenter />
      {canPublish ? <PublishingHistory /> : null}
    </div>
    <section className={styles.beta} data-slot="beta">
      <div><span className={styles.eyebrow}>{t.coming}</span><h2>{t.beta}</h2><p>{t.betaDesc}</p></div>
      <span className={styles.betaMark} aria-hidden="true">✳</span>
    </section>
  </main>;
}
