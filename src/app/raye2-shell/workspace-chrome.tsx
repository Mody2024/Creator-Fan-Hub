"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BottomSheet from "./bottom-sheet";
import ShellBrand from "./shell-brand";
import LanguageSwitch from "@/app/language-switch";
import ShellIcon, { type ShellIconName } from "./shell-icons";
import type { ShellLocale } from "./shell-data";

type Item = { id: string; href: string; icon: ShellIconName; en: string; ar: string; roles?: string[] };
type Group = { id: string; en: string; ar: string; items: Item[] };

const ADMINS = ["owner", "admin"];
const GROUPS: Group[] = [
  { id: "overview", en: "Overview", ar: "نظرة عامة", items: [
    { id: "overview", href: "/creator", icon: "home", en: "Dashboard", ar: "لوحة التحكم" }
  ] },
  { id: "create", en: "Create", ar: "إنشاء", items: [
    { id: "video-studio", href: "/creator#creator-video-studio", icon: "upload", en: "Video studio", ar: "استوديو الفيديو" },
    { id: "content-library", href: "/creator#creator-content-library", icon: "watch", en: "Content library", ar: "مكتبة المحتوى" },
    { id: "media", href: "/creator#creator-media", icon: "mini", en: "Media", ar: "الوسائط" },
    { id: "live", href: "/creator#creator-live-studio", icon: "live", en: "Live studio", ar: "استوديو البث", roles: ["streamer", "admin", "owner"] }
  ] },
  { id: "community", en: "Community", ar: "المجتمع", items: [
    { id: "polls", href: "/creator#creator-polls", icon: "series", en: "Polls", ar: "الاستطلاعات" },
    { id: "ideas", href: "/creator#creator-ideas", icon: "post", en: "Ideas", ar: "الأفكار", roles: ADMINS },
    { id: "events", href: "/creator#creator-events-socials", icon: "moment", en: "Events & links", ar: "الفعاليات والروابط" },
    { id: "moderation", href: "/creator/community", icon: "shield", en: "Moderation", ar: "الإشراف", roles: ["moderator", ...ADMINS] }
  ] },
  { id: "earn", en: "Earn", ar: "الأرباح", items: [
    { id: "sponsors", href: "/creator#creator-sponsorships", icon: "studio", en: "Sponsors", ar: "الرعاة" },
    { id: "sponsor-review", href: "/creator/sponsor-reviews", icon: "bookmark", en: "Sponsor review", ar: "مراجعة الرعاية", roles: ADMINS },
    { id: "rewards", href: "/creator#creator-rewards", icon: "gift", en: "Rewards", ar: "المكافآت" }
  ] },
  { id: "insights", en: "Insights", ar: "التحليلات", items: [
    { id: "analytics", href: "/creator/analytics", icon: "chart", en: "Analytics", ar: "التحليلات", roles: ["analyst", "editor", ...ADMINS] }
  ] },
  { id: "manage", en: "Manage", ar: "الإدارة", items: [
    { id: "settings", href: "/creator#creator-settings", icon: "settings", en: "Site identity", ar: "هوية الموقع" },
    { id: "notifications", href: "/creator#creator-notifications", icon: "bell", en: "Notifications", ar: "الإشعارات" },
    { id: "history", href: "/creator#creator-history", icon: "history", en: "Release history", ar: "سجل الإصدارات" },
    { id: "team", href: "/creator/team", icon: "community", en: "Team", ar: "الفريق", roles: ["owner"] }
  ] }
];

const T = {
  en: { workspace: "Studio", viewSite: "View platform", signOut: "Sign out", menu: "Workspace menu", more: "More", close: "Close", dashboard: "Dashboard", create: "Create", community: "Community", insights: "Insights" },
  ar: { workspace: "الاستوديو", viewSite: "عرض المنصة", signOut: "تسجيل الخروج", menu: "قائمة مساحة العمل", more: "المزيد", close: "إغلاق", dashboard: "لوحة التحكم", create: "إنشاء", community: "المجتمع", insights: "التحليلات" }
} as const;

/**
 * Creator workspace chrome (YouTube-Studio style): sticky top bar, grouped left menu on desktop, bottom bar +
 * "More" sheet on phones/tablets. Menu items are filtered by the signed-in role; pages still enforce access.
 */
export default function WorkspaceChrome({ locale, role }: { locale: ShellLocale; role: string }) {
  const pathname = usePathname() || "/creator";
  const t = T[locale];
  const [hash, setHash] = useState("");
  const [sheet, setSheet] = useState<"more" | null>(null);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);
  useEffect(() => { setSheet(null); }, [pathname, hash]);

  const groups = GROUPS.map(group => ({ ...group, items: group.items.filter(item => !item.roles || item.roles.includes(role)) })).filter(group => group.items.length > 0);
  const label = (entry: { en: string; ar: string }) => (locale === "ar" ? entry.ar : entry.en);
  const isActive = (item: Item) => {
    const [path, anchor] = item.href.split("#");
    if (anchor) return pathname === path && hash === "#" + anchor;
    return pathname === path && (path !== "/creator" || hash === "");
  };
  const link = (item: Item, size = 22) => (
    <Link key={item.id} href={item.href} className="raye2-ws-link" aria-current={isActive(item) ? "page" : undefined}>
      <ShellIcon name={item.icon} size={size} /><span>{label(item)}</span>
    </Link>
  );
  const pick = (id: string) => groups.flatMap(group => group.items).find(item => item.id === id);
  const tabs = [pick("overview"), pick("video-studio"), pick("polls") ?? pick("moderation"), pick("analytics")].filter((item): item is Item => Boolean(item));

  return (
    <>
      <header className="raye2-ws-top">
        <ShellBrand locale={locale} />
        <span className="raye2-ws-chip raye2-ws-chip--studio">{t.workspace}</span>
        <span className="raye2-ws-chip">{role.toUpperCase()}</span>
        <span className="raye2-ws-spacer" />
        <LanguageSwitch initialLocale={locale} variant="header" />
        <Link className="raye2-ws-pill" href="/">{t.viewSite}</Link>
        <form action="/creator/logout" method="post"><button className="raye2-ws-pill raye2-ws-pill--quiet" type="submit">{t.signOut}</button></form>
      </header>

      <aside className="raye2-ws-rail" aria-label={t.menu}>
        {groups.map(group => (
          <nav key={group.id} className="raye2-ws-group" aria-label={label(group)}>
            {group.id !== "overview" ? <span className="raye2-ws-grouplabel">{label(group)}</span> : null}
            {group.items.map(item => link(item))}
          </nav>
        ))}
      </aside>

      <nav className="raye2-ws-bottom" aria-label={t.menu}>
        {tabs.map(item => (
          <Link key={item.id} href={item.href} className="raye2-ws-tab" aria-current={isActive(item) ? "page" : undefined}>
            <span className="raye2-ws-tab-icon"><ShellIcon name={item.icon} /></span><span className="raye2-ws-tab-label">{label(item)}</span>
          </Link>
        ))}
        <button type="button" className="raye2-ws-tab" aria-haspopup="dialog" aria-expanded={sheet === "more"} onClick={() => setSheet("more")}>
          <span className="raye2-ws-tab-icon"><ShellIcon name="more" /></span><span className="raye2-ws-tab-label">{t.more}</span>
        </button>
      </nav>

      <BottomSheet open={sheet === "more"} onClose={() => setSheet(null)} title={t.menu} closeLabel={t.close}>
        {groups.map(group => (
          <div key={group.id} className="raye2-ws-sheetgroup">
            {group.id !== "overview" ? <span className="raye2-ws-grouplabel">{label(group)}</span> : null}
            <ul className="raye2-sheet-list">
              {group.items.map(item => (
                <li key={item.id}>
                  <Link href={item.href} className="raye2-sheet-row">
                    <span className="raye2-sheet-row-icon"><ShellIcon name={item.icon} size={22} /></span>
                    <span className="raye2-sheet-row-text"><strong>{label(item)}</strong></span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="raye2-ws-sheetgroup">
          <ul className="raye2-sheet-list">
            <li><Link href="/" className="raye2-sheet-row"><span className="raye2-sheet-row-icon"><ShellIcon name="home" size={22} /></span><span className="raye2-sheet-row-text"><strong>{t.viewSite}</strong></span></Link></li>
            <li><form action="/creator/logout" method="post"><button type="submit" className="raye2-sheet-row raye2-ws-signout"><span className="raye2-sheet-row-icon"><ShellIcon name="logout" size={22} /></span><span className="raye2-sheet-row-text"><strong>{t.signOut}</strong></span></button></form></li>
          </ul>
        </div>
      </BottomSheet>
    </>
  );
}
