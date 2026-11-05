import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./studio.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Studio — Raye2" };

type MediaAsset = { media_id: string; title: string; media_type: string; is_published: boolean; created_at?: string };
type VideoEntry = { media_id: string; slug: string; published_at: string | null };

export default async function Raye2CreatorStudioPage() {
  const [supabase, cookieStore] = await Promise.all([createSupabaseServerClient(), cookies()]);
  if (!supabase) redirect("/creator/login?setup=required");
  const locale = cookieStore.get("nhen_locale")?.value === "ar" ? "ar" : "en";
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
  if (accessError || !access || !["owner", "admin", "creator", "editor", "moderator", "analyst"].includes(access.role)) {
    redirect("/creator/login?access=restricted");
  }

  const role = access.role as "owner" | "admin" | "creator" | "editor" | "moderator" | "analyst";
  const canPublish = ["owner", "admin", "creator"].includes(role);
  const canModerate = ["owner", "admin", "moderator"].includes(role);
  const canAnalyze = ["owner", "admin", "analyst"].includes(role);

  const [{ data: mediaData, error: mediaError }, { data: videoData, error: videoError }] = await Promise.all([
    supabase.rpc("get_creator_media", { p_limit: 200 }),
    supabase.from("video_catalog").select("media_id,slug,published_at").order("updated_at", { ascending: false }).limit(200)
  ]);
  const media = (mediaData ?? []) as MediaAsset[];
  const videos = (videoData ?? []) as VideoEntry[];
  const publishedMedia = media.filter(item => item.is_published).length;
  const draftMedia = media.length - publishedMedia;
  const publishedVideos = videos.filter(item => !!item.published_at).length;
  const mediaUnavailable = !!mediaError;
  const catalogUnavailable = !!videoError;
  const t = isArabic ? {
    eyebrow: "مساحة صُنّاع المحتوى", title: "استوديو ", accent: "Raye2.", intro: "مساحة موحّدة لإدارة مكتبة الوسائط وصفحات المشاهدة والنشر وأداء المحتوى.",
    home: "العودة إلى الرئيسية", role: "الصلاحية الحالية", assets: "ملفات الوسائط", publicAssets: "ملفات منشورة", drafts: "مسودات خاصة", videos: "صفحات المشاهدة", published: "منشور",
    workspace: "مساحات العمل", manage: "إدارة المحتوى", manageDesc: "افتح أدوات رفع الملفات وتحرير البيانات الوصفية والنشر وقوائم التشغيل وسجل الإصدارات.", open: "فتح أدوات المحتوى",
    analytics: "تحليلات الأداء", analyticsDesc: "راجع إجماليات المشاهدات والتفاعلات والتعليقات دون كشف هويات المشاهدين.", moderation: "إدارة المجتمع", moderationDesc: "راجع المنشورات والتعليقات والبلاغات وفق صلاحياتك.",
    editorial: "مراجعة المحتوى", editorialDesc: "يمكن للمحررين مراجعة المحتوى وإعداد الملاحظات، لكن صلاحيات الرفع والنشر الرسمي محفوظة للمالك والمديرين والمبدعين المعتمدين.", editorialComing: "مساحة التحرير قيد التجهيز", beta: "مختبر بيتا", betaDesc: "ميزات قيد التجهيز ستظهر هنا عند تفعيلها. لن تظهر كميزات جاهزة قبل اكتمال تنفيذها واختبارها.",
    noAccess: "تعذر تحميل بعض بيانات المكتبة. يمكنك إعادة المحاولة من أدوات المحتوى.", coming: "قريبًا / تجريبي", note: "الأرقام تعكس البيانات التي تسمح بها صلاحيات حسابك فقط."
  } : {
    eyebrow: "CREATOR WORKSPACE", title: "Raye2 ", accent: "Studio.", intro: "One workspace for your media library, watch pages, publishing workflow and content performance.",
    home: "Back to home", role: "CURRENT ACCESS", assets: "MEDIA ASSETS", publicAssets: "Published assets", drafts: "Private drafts", videos: "WATCH PAGES", published: "Published",
    workspace: "WORKSPACES", manage: "Content management", manageDesc: "Open the existing upload, asset metadata, publishing, playlist and version-history tools.", open: "Open content tools",
    analytics: "Performance analytics", analyticsDesc: "Review aggregate views, reactions and comments without exposing viewer identities.", moderation: "Community moderation", moderationDesc: "Review posts, comments and reports within your assigned permissions.",
    editorial: "Editorial review", editorialDesc: "Editors can prepare reviews and feedback, while official uploads and publishing remain restricted to owners, admins and assigned creators.", editorialComing: "Editorial workspace is being prepared", beta: "Beta lab", betaDesc: "Upcoming experiments will appear here when enabled. Nothing is labelled ready until it is implemented and tested.",
    noAccess: "Some library data could not be loaded. You can retry from the content tools.", coming: "COMING SOON / EXPERIMENTAL", note: "Counts reflect only the data your account is allowed to access."
  };

  return <main className={styles.shell} dir={isArabic ? "rtl" : "ltr"} lang={locale}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{t.eyebrow}</span><span className={styles.role}>{t.role}: {role.toUpperCase()}</span></div>
      <Link className={styles.homeLink} href="/raye2/home">← {t.home}</Link>
    </header>
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}>RAYE2 / CREATOR TOOLS</span><h1>{t.title}<em>{t.accent}</em></h1><p>{t.intro}</p></div>
      <div className={styles.heroMark} aria-hidden="true"><span>R</span><i /></div>
    </section>
    <section className={styles.metrics} aria-label={isArabic ? "ملخص المكتبة" : "Library overview"}>
      <article className={styles.metric}><span>{t.assets}</span><strong>{mediaUnavailable ? "—" : media.length.toLocaleString(locale)}</strong><small>{t.note}</small></article>
      <article className={styles.metric}><span>{t.publicAssets}</span><strong>{mediaUnavailable ? "—" : publishedMedia.toLocaleString(locale)}</strong><small>{t.published}</small></article>
      <article className={styles.metric}><span>{t.drafts}</span><strong>{mediaUnavailable ? "—" : draftMedia.toLocaleString(locale)}</strong><small>{isArabic ? "تظل خاصة حتى النشر" : "Private until published"}</small></article>
      <article className={styles.metric}><span>{t.videos}</span><strong>{catalogUnavailable ? "—" : publishedVideos.toLocaleString(locale)}</strong><small>{t.published}</small></article>
    </section>
    {(mediaUnavailable || catalogUnavailable) && <p className={styles.notice} role="status">{t.noAccess}</p>}
    <section className={styles.section}>
      <div className={styles.sectionHead}><span className={styles.eyebrow}>{t.workspace}</span><h2>{t.manage}</h2></div>
      <div className={styles.grid}>
        {canPublish && <article className={styles.card}><span className={styles.cardIndex}>01 / PUBLISH</span><h3>{t.manage}</h3><p>{t.manageDesc}</p><Link className={styles.action} href="/creator">{t.open} ↗</Link></article>}
        {canAnalyze && <article className={styles.card}><span className={styles.cardIndex}>02 / INSIGHTS</span><h3>{t.analytics}</h3><p>{t.analyticsDesc}</p><Link className={styles.action} href="/creator/analytics">{isArabic ? "فتح التحليلات" : "Open analytics"} ↗</Link></article>}
        {role === "editor" && <article className={styles.card}><span className={styles.cardIndex}>01 / EDITORIAL</span><h3>{t.editorial}</h3><p>{t.editorialDesc}</p><span className={styles.action}>{t.editorialComing}</span></article>}
        {canModerate && <article className={styles.card}><span className={styles.cardIndex}>03 / TRUST</span><h3>{t.moderation}</h3><p>{t.moderationDesc}</p><Link className={styles.action} href="/creator/community">{isArabic ? "فتح أدوات الإشراف" : "Open moderation"} ↗</Link></article>}
      </div>
    </section>
    <section className={styles.beta}>
      <div><span className={styles.eyebrow}>{t.coming}</span><h2>{t.beta}</h2><p>{t.betaDesc}</p></div>
      <span className={styles.betaMark} aria-hidden="true">✳</span>
    </section>
  </main>;
}
