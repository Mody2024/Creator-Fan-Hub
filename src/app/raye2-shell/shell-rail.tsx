"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPlatformNavActive, type PlatformNavKey } from "@/lib/platform-nav";
import ShellIcon from "./shell-icons";
import { NAV_ICON } from "./shell-data";

type RailItem = { key: PlatformNavKey; href: string; label: string };

/**
 * Left rail. Wide screens: icons + chalk labels. Tablets: icon-only with the label kept for screen
 * readers and as a tooltip. Phones: hidden (the bottom bar takes over).
 */
export default function ShellRail({ label, items, accountLabel, accountItems }: { label: string; items: RailItem[]; accountLabel: string; accountItems: RailItem[] }) {
  const pathname = usePathname() || "/";
  const render = (item: RailItem) => (
    <Link key={item.key} href={item.href} className="raye2-rail-link" title={item.label} aria-current={isPlatformNavActive(pathname, item.href) ? "page" : undefined}>
      <ShellIcon name={NAV_ICON[item.key]} size={24} />
      <span className="raye2-rail-label">{item.label}</span>
    </Link>
  );
  return (
    <aside className="raye2-rail" aria-label={label}>
      <nav className="raye2-rail-group" aria-label={label}>{items.map(render)}</nav>
      <span className="raye2-rail-section">{accountLabel}</span>
      <nav className="raye2-rail-group" aria-label={accountLabel}>{accountItems.map(render)}</nav>
    </aside>
  );
}
