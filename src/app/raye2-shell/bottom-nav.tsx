"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isPlatformNavActive } from "@/lib/platform-nav";
import BottomSheet from "./bottom-sheet";
import ShellIcon, { type ShellIconName } from "./shell-icons";
import { SHELL_T as T, createItemsFor, youItemsFor, type ShellLocale as Locale } from "./shell-data";

type Sheet = "create" | "you" | null;

// Routes that own the whole screen (immersive viewers, creator/admin workspaces with their own navigation).
// The chat hides the bar itself while a conversation is open (body[data-raye2-thread="open"]). The bottom bar steps aside there instead of fighting their layout.
const HIDDEN_PREFIXES = ["/creator", "/raye2/admin", "/raye2/studio", "/raye2/invite", "/raye2/watch-invite", "/auth", "/shorts"];
const HIDDEN_EXACT: string[] = [];

type Tab = { key: string; href: string; icon: ShellIconName; label: string; active: boolean };

export default function BottomNav({ locale }: { locale: Locale }) {
  const pathname = usePathname() || "/";
  const t = T[locale];
  const [sheet, setSheet] = useState<Sheet>(null);
  const [scrolledAway, setScrolledAway] = useState(false);

  const hidden = HIDDEN_EXACT.includes(pathname) || HIDDEN_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));

  useEffect(() => { setSheet(null); }, [pathname]);

  // Lets page CSS reserve room for the bar and lets legacy per-page mobile navs step aside.
  useEffect(() => {
    if (hidden) { delete document.body.dataset.raye2Bottomnav; return; }
    document.body.dataset.raye2Bottomnav = "on";
    return () => { delete document.body.dataset.raye2Bottomnav; };
  }, [hidden]);

  // Hide on scroll down, return on scroll up (feeds get the full screen; the bar is one flick away).
  useEffect(() => {
    if (hidden) return;
    let last = window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        if (Math.abs(delta) > 8) { setScrolledAway(delta > 0 && y > 140); last = y; }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden]);

  if (hidden) return null;

  const youActive = ["/account", "/saved", "/notifications", "/u/"].some(prefix => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/"));
  const tabs: Tab[] = [
    { key: "home", href: "/", icon: "home", label: t.home, active: isPlatformNavActive(pathname, "/") },
    { key: "watch", href: "/watch", icon: "watch", label: t.watch, active: isPlatformNavActive(pathname, "/watch") }
  ];
  const tabsAfter: Tab[] = [
    { key: "community", href: "/community", icon: "community", label: t.community, active: isPlatformNavActive(pathname, "/community") }
  ];

  const createItems = createItemsFor(locale);
  const youItems = youItemsFor(locale);

  const renderTab = (tab: Tab) => (
    <Link key={tab.key} href={tab.href} className="raye2-bottom-tab" aria-current={tab.active ? "page" : undefined}>
      <span className="raye2-bottom-tab-icon"><ShellIcon name={tab.icon} /></span>
      <span className="raye2-bottom-tab-label">{tab.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="raye2-bottom-nav" aria-label={t.nav} data-hidden={scrolledAway && !sheet ? "true" : "false"}>
        {tabs.map(renderTab)}
        <button type="button" className="raye2-bottom-create" aria-haspopup="dialog" aria-expanded={sheet === "create"} onClick={() => setSheet("create")}>
          <span className="raye2-bottom-create-disc"><ShellIcon name="plus" size={26} strokeWidth={2.2} /></span>
          <span className="raye2-bottom-tab-label">{t.create}</span>
        </button>
        {tabsAfter.map(renderTab)}
        <button type="button" className="raye2-bottom-tab" aria-haspopup="dialog" aria-expanded={sheet === "you"} aria-current={youActive ? "page" : undefined} onClick={() => setSheet("you")}>
          <span className="raye2-bottom-tab-icon"><ShellIcon name="user" /></span>
          <span className="raye2-bottom-tab-label">{t.you}</span>
        </button>
      </nav>

      <BottomSheet open={sheet === "create"} onClose={() => setSheet(null)} title={t.createTitle} closeLabel={t.close}>
        <ul className="raye2-sheet-list">
          {createItems.map(item => (
            <li key={item.href + item.label}>
              <Link href={item.href} className="raye2-sheet-row">
                <span className="raye2-sheet-row-icon"><ShellIcon name={item.icon} size={22} /></span>
                <span className="raye2-sheet-row-text"><strong>{item.label}</strong>{item.hint ? <small>{item.hint}</small> : null}</span>
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet open={sheet === "you"} onClose={() => setSheet(null)} title={t.youTitle} closeLabel={t.close}>
        <ul className="raye2-sheet-list">
          {youItems.map(item => (
            <li key={item.href}>
              <Link href={item.href} className="raye2-sheet-row">
                <span className="raye2-sheet-row-icon"><ShellIcon name={item.icon} size={22} /></span>
                <span className="raye2-sheet-row-text"><strong>{item.label}</strong></span>
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
