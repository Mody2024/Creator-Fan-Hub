"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLATFORM_NAV_ACCOUNT, PLATFORM_NAV_PRIMARY, isPlatformNavActive, platformNavItems } from "@/lib/platform-nav";
import ShellIcon from "./shell-icons";
import { NAV_ICON, NAV_LABELS, SHELL_T, moreItemsFor, type ShellLocale } from "./shell-data";

/**
 * The one side menu for every page. Wide screens: icons + chalk labels. Tablets: icon-only with the
 * label kept for screen readers and as a tooltip. Phones: hidden (the bottom bar takes over).
 * Five main places, three personal ones, and a collapsed "More" group for everything else.
 */
export default function ShellRail({ locale, showVideos = true }: { locale: ShellLocale; showVideos?: boolean }) {
  const pathname = usePathname() || "/";
  const t = SHELL_T[locale];
  const keys = showVideos ? PLATFORM_NAV_PRIMARY : PLATFORM_NAV_PRIMARY.filter(key => key !== "videos" && key !== "shorts");
  const primary = platformNavItems(keys, NAV_LABELS[locale]);
  const account = platformNavItems(PLATFORM_NAV_ACCOUNT, NAV_LABELS[locale]);
  const more = moreItemsFor(locale);
  const moreActive = more.some(item => pathname === item.href || pathname.startsWith(item.href + "/"));
  const render = (item: { key: keyof typeof NAV_ICON; href: string; label: string }) => (
    <Link key={item.key} href={item.href} className="raye2-rail-link" title={item.label} aria-current={isPlatformNavActive(pathname, item.href) ? "page" : undefined}>
      <ShellIcon name={NAV_ICON[item.key]} size={24} />
      <span className="raye2-rail-label">{item.label}</span>
    </Link>
  );
  return (
    <aside className="raye2-rail" aria-label={t.mainNav}>
      <nav className="raye2-rail-group" aria-label={t.mainNav}>{primary.map(render)}</nav>
      <span className="raye2-rail-section">{t.yourRaye2}</span>
      <nav className="raye2-rail-group" aria-label={t.yourRaye2}>{account.map(render)}</nav>
      <details className="raye2-rail-more" open={moreActive}>
        <summary className="raye2-rail-link" title={t.more}>
          <ShellIcon name="more" size={24} />
          <span className="raye2-rail-label">{t.more}</span>
        </summary>
        <nav className="raye2-rail-group" aria-label={t.more}>
          {more.map(item => (
            <Link key={item.href} href={item.href} className="raye2-rail-link" title={item.label} aria-current={pathname === item.href || pathname.startsWith(item.href + "/") ? "page" : undefined}>
              <ShellIcon name={item.icon} size={24} />
              <span className="raye2-rail-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </details>
    </aside>
  );
}
