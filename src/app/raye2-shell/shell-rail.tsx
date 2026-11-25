"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ShellIcon, { type ShellIconName } from "./shell-icons";
import { SHELL_T, type ShellLocale } from "./shell-data";

type Entry = { href: string; icon: ShellIconName; en: string; ar: string; match?: (path: string) => boolean };
const starts = (prefix: string) => (path: string) => path === prefix || path.startsWith(prefix + "/");

// Launch 1.0 (Communication Edition): five places that matter, three personal ones, and media tucked under "Coming soon".
const MAIN: Entry[] = [
  { href: "/", icon: "home", en: "Home", ar: "الرئيسية", match: path => path === "/" || path === "/raye2/home" },
  { href: "/raye2", icon: "chat", en: "Messages", ar: "الرسائل", match: path => path === "/raye2" },
  { href: "/groups", icon: "hash", en: "Groups", ar: "المجموعات", match: starts("/groups") },
  { href: "/community", icon: "community", en: "Community", ar: "المجتمع", match: starts("/community") },
  { href: "/events", icon: "moment", en: "Events", ar: "الفعاليات", match: starts("/events") }
];
const PERSONAL: Entry[] = [
  { href: "/notifications", icon: "bell", en: "Notifications", ar: "الإشعارات", match: starts("/notifications") },
  { href: "/saved", icon: "bookmark", en: "Saved", ar: "المحفوظات", match: starts("/saved") },
  { href: "/account", icon: "settings", en: "Settings", ar: "الإعدادات", match: starts("/account") }
];
const SOON: Entry[] = [
  { href: "/watch", icon: "watch", en: "Watch", ar: "مشاهدة", match: starts("/watch") },
  { href: "/shorts", icon: "shorts", en: "Mini’s", ar: "مقاطع قصيرة", match: path => starts("/shorts")(path) || starts("/minis")(path) },
  { href: "/moments", icon: "moment", en: "Moments", ar: "لحظات", match: starts("/moments") },
  { href: "/clips", icon: "clips", en: "Clips", ar: "مقاطع", match: starts("/clips") },
  { href: "/live", icon: "live", en: "Live", ar: "مباشر", match: starts("/live") },
  { href: "/series", icon: "series", en: "Series", ar: "السلاسل", match: starts("/series") }
];

/**
 * Launch 1.0 side menu. Wide screens: icons + chalk labels. Tablets: icon-only (label kept as tooltip / for screen
 * readers). Phones: hidden (the bottom bar takes over). Media features live in a collapsed "Coming soon" group and
 * open a Coming Soon screen for members.
 */
export default function ShellRail({ locale }: { locale: ShellLocale; showVideos?: boolean }) {
  const pathname = usePathname() || "/";
  const t = SHELL_T[locale];
  const label = (entry: Entry) => (locale === "ar" ? entry.ar : entry.en);
  const render = (entry: Entry, soon = false) => {
    const active = (entry.match ?? starts(entry.href))(pathname);
    return (
      <Link key={entry.href} href={entry.href} className={"raye2-rail-link" + (soon ? " raye2-rail-soon" : "")} title={label(entry)} aria-current={active ? "page" : undefined}>
        <ShellIcon name={entry.icon} size={24} />
        <span className="raye2-rail-label">{label(entry)}</span>
        {soon ? <em className="raye2-soon-pill">{t.soonShort}</em> : null}
      </Link>
    );
  };
  const soonActive = SOON.some(entry => (entry.match ?? starts(entry.href))(pathname));
  return (
    <aside className="raye2-rail" aria-label={t.mainNav}>
      <nav className="raye2-rail-group" aria-label={t.mainNav}>{MAIN.map(entry => render(entry))}</nav>
      <span className="raye2-rail-section">{t.personal}</span>
      <nav className="raye2-rail-group" aria-label={t.personal}>{PERSONAL.map(entry => render(entry))}</nav>
      <details className="raye2-rail-more" open={soonActive}>
        <summary className="raye2-rail-link" title={t.soon}>
          <ShellIcon name="more" size={24} />
          <span className="raye2-rail-label">{t.soon}</span>
        </summary>
        <nav className="raye2-rail-group" aria-label={t.soon}>{SOON.map(entry => render(entry, true))}</nav>
      </details>
    </aside>
  );
}
