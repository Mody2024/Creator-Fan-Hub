// Single source of truth for Raye2 platform navigation (plan 1.3).
// Every surface renders the same destinations, hrefs, icons and active rules; only the
// localized label text differs per surface.

export type PlatformNavKey =
  | "home"
  | "videos"
  | "shorts"
  | "community"
  | "explore"
  | "series"
  | "messages"
  | "notifications"
  | "saved"
  | "profile"
  | "studio";

export type PlatformNavItem = { key: PlatformNavKey; href: string; icon: string; label: string };

type NavDef = { key: PlatformNavKey; href: string; icon: string; isActive: (pathname: string) => boolean };

const NAV_DEFS: NavDef[] = [
  { key: "home", href: "/", icon: "⌂", isActive: p => p === "/" || p === "/raye2/home" },
  { key: "videos", href: "/watch", icon: "▷", isActive: p => p === "/watch" || p.startsWith("/watch/") },
  { key: "shorts", href: "/shorts", icon: "▣", isActive: p => p === "/shorts" || p.startsWith("/shorts/") },
  { key: "community", href: "/community", icon: "♧", isActive: p => p === "/community" || p.startsWith("/community/") },
  { key: "explore", href: "/search", icon: "⌕", isActive: p => p === "/search" || p.startsWith("/search/") },
  { key: "series", href: "/series", icon: "▤", isActive: p => p === "/series" || p.startsWith("/series/") },
  { key: "messages", href: "/raye2", icon: "✉", isActive: p => p === "/raye2" },
  { key: "notifications", href: "/notifications", icon: "♢", isActive: p => p === "/notifications" },
  { key: "saved", href: "/saved", icon: "▣", isActive: p => p === "/saved" },
  { key: "profile", href: "/profile", icon: "◉", isActive: p => p === "/profile" || p.startsWith("/u/") },
  { key: "studio", href: "/creator", icon: "✦", isActive: p => p.startsWith("/creator") }
];

export const PLATFORM_NAV_PRIMARY: PlatformNavKey[] = ["home", "videos", "shorts", "community", "explore"];
export const PLATFORM_NAV_ACCOUNT: PlatformNavKey[] = ["saved", "notifications", "studio"];
export const PLATFORM_NAV_RAYE2: PlatformNavKey[] = [
  "home", "videos", "shorts", "explore", "series", "studio", "messages", "notifications", "saved", "profile"
];

export function platformNavItem(key: PlatformNavKey, label: string): PlatformNavItem {
  const def = NAV_DEFS.find(item => item.key === key)!;
  return { key: def.key, href: def.href, icon: def.icon, label };
}

export function platformNavItems(keys: PlatformNavKey[], labels: Partial<Record<PlatformNavKey, string>>): PlatformNavItem[] {
  return keys.map(key => platformNavItem(key, labels[key] ?? key));
}

export function isPlatformNavActive(pathname: string, href: string): boolean {
  const def = NAV_DEFS.find(item => item.href === href);
  return def ? def.isActive(pathname) : pathname === href;
}
