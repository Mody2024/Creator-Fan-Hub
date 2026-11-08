import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CreatorSettings from "./creator-settings";
import IdeaModerationQueue from "./idea-moderation-queue";
import PollManagement from "./poll-management";
import EventSocialManagement from "./event-social-management";
import MediaLibrary from "./media-library";
import PublishingHistory from "./publishing-history";
import VideoStudio from "./video-studio";
import AchievementInsights from "./achievement-insights";
import CreatorRewardsCenter from "./rewards-center";
import CreatorRewardsAdmin from "./rewards-admin";
import { getPublicSiteConfig } from "@/lib/public-site-config";

export const dynamic = "force-dynamic";



export default async function CreatorDashboardPage() {
  const [supabase, publicConfig, cookieStore] = await Promise.all([createSupabaseServerClient(), getPublicSiteConfig(), cookies()]);
  const isArabic = cookieStore.get("nhen_locale")?.value === "ar";
  const t = isArabic ? {
    auth:"مساحة عمل موثّقة",signOut:"تسجيل الخروج ↗",studioHome:"استوديو Raye2 ↗",eyebrow:"استوديو Raye2 / نظرة عامة",title:"اجعلها ",emphasis:"مساحتك.",intro:"أدر تجربة Raye2 من مساحة واحدة. احفظ التغييرات كمسودات خاصة ثم انشرها بعد المراجعة.",draft:"● تطوير / مسودة",publicConfig:"إعدادات الموقع",connected:"Supabase متصل",source:"النسخة المنشورة هي المصدر العام المعتمد",access:"صلاحيات المبدعين",verified:"تم التحقق من الخادم",allowlist:"التعديل متاح للحسابات المصرح بها فقط",publishing:"النشر",versions:"نسخ محفوظة",concurrent:"يتم التحقق من تعارض التعديلات",workspace:"مساحة عملك",jump:"انتقل إلى قسم العمل.",jumpBody:"افتح أي قسم مباشرة. تظل التغييرات خاصة حتى النشر.",active:"أقسام نشطة",identity:"هوية الموقع وتخطيطه",identityDesc:"العلامة التجارية، المظهر، التعليق الصوتي، الأقسام والنشر.",polls:"إدارة التصويت",pollDesc:"أنشئ استطلاعات وأدر مواعيد التصويت والنتائج.",ideas:"مراجعة الأفكار",ideasDesc:"راجع المشاركات ووافق عليها أو ميّزها أو ارفضها أو أرشفها.",events:"الفعاليات وروابط التواصل",eventsDesc:"أدر مواعيد الفعاليات وقنوات صانع المحتوى.",media:"مكتبة الوسائط",mediaDesc:"ارفع ملفاتك وحررها وانشرها وأدرها.",analytics:"تحليلات الأداء",analyticsDesc:"راجع المشاهدات والتفاعلات ونقاشات الفيديو المعتمدة.",team:"الفريق والصلاحيات",teamDesc:"ادعُ المتعاونين وحدد أدوار مساحة العمل.",raye2Admin:"إدارة Raye2",raye2AdminDesc:"تحكم في قواعد المجتمع والاحتفاظ والتنظيف والتخزين.",moderation:"إدارة المجتمع",moderationDesc:"راجع منشورات الأعضاء والتعليقات والبلاغات.",studio:"استوديو الفيديو",studioDesc:"أنشئ صفحات المشاهدة ونظم قوائم التشغيل والنشر.",history:"سجل النشر",historyDesc:"راجع النسخ المنشورة واستعد نسخة إلى مسودة خاصة.",disclaimer:"تعمل التصويتات والأفكار والفعاليات والوسائط وسجل النشر عبر عمليات Supabase محمية. استعادة نسخة سابقة تغيّر المسودة الخاصة فقط؛ راجعها قبل النشر."
  } : {
    auth:"AUTHENTICATED WORKSPACE",signOut:"Sign out ↗",eyebrow:"CREATOR CONTROL ROOM / OVERVIEW",title:"Make it ",emphasis:"yours.",intro:"Manage your Raye2 creator workspace from one place. Save drafts privately, then publish approved changes.",draft:"● DEVELOPMENT / DRAFT",publicConfig:"PUBLIC CONFIG",connected:"Supabase connected",source:"Published snapshot is the public source of truth",access:"CREATOR ACCESS",verified:"Verified server-side",allowlist:"Only allowlisted creator accounts can edit",publishing:"PUBLISHING",versions:"Versioned snapshots",concurrent:"Concurrent draft changes are checked",workspace:"YOUR WORKSPACE",jump:"Jump to a workspace.",jumpBody:"Open any management area directly. Changes stay private until published.",active:"ACTIVE AREAS",identity:"Site identity & layout",identityDesc:"Branding, theme, narration, section visibility and publishing.",polls:"Poll management",pollDesc:"Create polls, manage voting windows and review final results.",ideas:"Idea moderation",ideasDesc:"Review submissions, approve, feature, reject or archive ideas.",events:"Events & socials",eventsDesc:"Manage event schedules and published creator channels.",media:"Media library",mediaDesc:"Upload, edit, publish and remove owned media assets.",analytics:"Performance analytics",analyticsDesc:"Review aggregate views, reactions and approved video discussions.",team:"Team & permissions",teamDesc:"Invite verified collaborators and assign workspace roles.",raye2Admin:"Raye2 platform controls",raye2AdminDesc:"Manage community rules, retention, cleanup reviews and storage.",moderation:"Community moderation",moderationDesc:"Review member posts, discussions and user reports.",studio:"Video studio",studioDesc:"Build watch pages, organize playlists and control publishing.",history:"Publishing history",historyDesc:"Review published snapshots and restore one to a private draft.",disclaimer:"Polls, ideas, events, socials, media and publishing history use guarded Supabase operations. Restoring a prior version only changes the private draft; review it before publishing."
  };
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/creator/login");
  const { data: admin, error: adminError } = await supabase
    .from("creator_admins").select("user_id,role").eq("user_id", userId).eq("active", true).maybeSingle();
  if (adminError || !admin) redirect("/creator/login?access=restricted");
  if (admin.role === "moderator") redirect("/creator/community");
  if (admin.role === "analyst") redirect("/creator/analytics");
  if (!["owner","admin","creator","editor"].includes(admin.role)) redirect("/creator/login?access=restricted");

  return <main className="dashboard-shell raye2-creator-shell" dir={isArabic?"rtl":"ltr"} lang={isArabic?"ar":"en"}>
    <header className="dashboard-topbar"><Link className="wordmark raye2-workspace-mark" href="/raye2/home"><span><strong>Raye2</strong><small>CREATOR WORKSPACE</small></span></Link><span className="admin-session"><i /> {t.auth}</span><nav className="raye2-creator-actions" aria-label="Creator navigation"><Link className="logout-button" href="/raye2/studio">{t.studioHome}</Link><form action="/creator/logout" method="post"><button className="logout-button" type="submit">{t.signOut}</button></form></nav></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">{t.eyebrow}</span><h1>{t.title}<em>{t.emphasis}</em></h1><p>{t.intro}</p></div><span className="draft-badge">{t.draft}</span></div>
      <section className="dashboard-stats"><article><span>{t.publicConfig}</span><strong>{t.connected}</strong><small>{t.source}</small></article><article><span>{t.access}</span><strong>{t.verified}</strong><small>{t.allowlist}</small></article><article><span>{t.publishing}</span><strong>{t.versions}</strong><small>{t.concurrent}</small></article></section>
      <div className="module-heading"><div><span className="eyebrow">{t.workspace}</span><h2>{t.jump}</h2><p>{t.jumpBody}</p></div><span className="module-count">{11 - (admin.role === "owner" ? 0 : 1) - (["owner","admin"].includes(admin.role) ? 0 : 2)} ACTIVE AREAS</span></div>
      <nav className="module-grid creator-quick-nav" aria-label="Creator workspace sections">
        <a className="module-card" href="#creator-settings"><div className="module-card-top"><span>01 / CONTROL</span><span className="module-state">Site</span></div><h3>{t.identity}</h3><p>{t.identityDesc}</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-polls"><div className="module-card-top"><span>02 / COMMUNITY</span><span className="module-state">Polls</span></div><h3>{t.polls}</h3><p>{t.pollDesc}</p><span className="module-arrow">↗</span></a>
        {["owner","admin"].includes(admin.role) && (
<a className="module-card" href="#creator-ideas"><div className="module-card-top"><span>03 / COMMUNITY</span><span className="module-state">Ideas</span></div><h3>{t.ideas}</h3><p>{t.ideasDesc}</p><span className="module-arrow">↗</span></a>
        )}
        <a className="module-card" href="#creator-events-socials"><div className="module-card-top"><span>04 / CONTENT</span><span className="module-state">Events & links</span></div><h3>{t.events}</h3><p>{t.eventsDesc}</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-media"><div className="module-card-top"><span>05 / ASSETS</span><span className="module-state">Media</span></div><h3>{t.media}</h3><p>{t.mediaDesc}</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="/creator/analytics"><div className="module-card-top"><span>10 / INSIGHTS</span><span className="module-state">Analytics</span></div><h3>{t.analytics}</h3><p>{t.analyticsDesc}</p><span className="module-arrow">↗</span></a>
        {admin.role === "owner" && (
<a className="module-card" href="/creator/team"><div className="module-card-top"><span>09 / ACCESS</span><span className="module-state">Owner only</span></div><h3>{t.team}</h3><p>{t.teamDesc}</p><span className="module-arrow">↗</span></a>
        )}
        {["owner","admin"].includes(admin.role) && (
<a className="module-card" href="/creator/raye2"><div className="module-card-top"><span>11 / PLATFORM</span><span className="module-state">Raye2</span></div><h3>{t.raye2Admin}</h3><p>{t.raye2AdminDesc}</p><span className="module-arrow">↗</span></a>
        )}
        {["owner","admin"].includes(admin.role) && (
<a className="module-card" href="/creator/community"><div className="module-card-top"><span>07 / TRUST & SAFETY</span><span className="module-state">Community</span></div><h3>{t.moderation}</h3><p>{t.moderationDesc}</p><span className="module-arrow">↗</span></a>
        )}
        <a className="module-card" href="#creator-video-studio"><div className="module-card-top"><span>08 / VIDEO</span><span className="module-state">Studio</span></div><h3>{t.studio}</h3><p>{t.studioDesc}</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-history"><div className="module-card-top"><span>06 / RELEASES</span><span className="module-state">Versions</span></div><h3>{t.history}</h3><p>{t.historyDesc}</p><span className="module-arrow">↗</span></a>
      </nav>

      <CreatorSettings />
      <PollManagement />
      {["owner","admin"].includes(admin.role) && <IdeaModerationQueue />}
      <EventSocialManagement />
      <MediaLibrary />
      <VideoStudio />
      <AchievementInsights />
      <CreatorRewardsCenter />
      {["owner","admin"].includes(admin.role) && <CreatorRewardsAdmin />}
      <PublishingHistory />
      <p className="dashboard-disclaimer">{t.disclaimer}</p>
    </div>
  </main>;
}
