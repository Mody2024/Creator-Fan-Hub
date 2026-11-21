import type { PlatformNavKey } from "@/lib/platform-nav";
import type { ShellIconName } from "./shell-icons";

export type ShellLocale = "en" | "ar";

// One string table for every shell surface (phone bar, sheets, top bar, rail). EN and AR ship together.
export const SHELL_T = {
  en: {
    nav: "Quick navigation", mainNav: "Main navigation", yourRaye2: "Your Raye2",
    home: "Home", watch: "Watch", create: "Create", community: "Community", you: "You",
    createTitle: "Create", youTitle: "Your space", close: "Close", search: "Search Raye2", join: "Join", brand: "Raye2 home",
    upload: "Upload video", uploadHint: "Open the video studio", mini: "Mini", miniHint: "Short vertical clip", moment: "Moment", momentHint: "Disappears after a day",
    post: "Community post", postHint: "Share with the community", live: "Go live", liveHint: "Start a live stream",
    account: "Account settings", saved: "Saved", notifications: "Notifications", messages: "Messages", studio: "Creator Studio"
  },
  ar: {
    nav: "التنقل السريع", mainNav: "التنقل الرئيسي", yourRaye2: "مساحتك في Raye2",
    home: "الرئيسية", watch: "مشاهدة", create: "إنشاء", community: "المجتمع", you: "أنت",
    createTitle: "إنشاء", youTitle: "مساحتك", close: "إغلاق", search: "ابحث في Raye2", join: "انضم", brand: "الصفحة الرئيسية لـ Raye2",
    upload: "رفع فيديو", uploadHint: "افتح استوديو الفيديو", mini: "مقطع قصير", miniHint: "مقطع عمودي قصير", moment: "لحظة", momentHint: "تختفي بعد يوم",
    post: "منشور مجتمعي", postHint: "شارك مع المجتمع", live: "بث مباشر", liveHint: "ابدأ بثًا مباشرًا",
    account: "إعدادات الحساب", saved: "المحفوظات", notifications: "الإشعارات", messages: "الرسائل", studio: "استوديو المبدع"
  }
} as const;

export type MenuItem = { href: string; icon: ShellIconName; label: string; hint?: string };

export function createItemsFor(locale: ShellLocale): MenuItem[] {
  const t = SHELL_T[locale];
  return [
    { href: "/raye2/studio", icon: "upload", label: t.upload, hint: t.uploadHint },
    { href: "/minis", icon: "mini", label: t.mini, hint: t.miniHint },
    { href: "/moments", icon: "moment", label: t.moment, hint: t.momentHint },
    { href: "/community", icon: "post", label: t.post, hint: t.postHint },
    { href: "/live", icon: "live", label: t.live, hint: t.liveHint }
  ];
}

export function youItemsFor(locale: ShellLocale): MenuItem[] {
  const t = SHELL_T[locale];
  return [
    { href: "/account", icon: "settings", label: t.account },
    { href: "/saved", icon: "bookmark", label: t.saved },
    { href: "/notifications", icon: "bell", label: t.notifications },
    { href: "/raye2", icon: "chat", label: t.messages },
    { href: "/creator", icon: "studio", label: t.studio }
  ];
}

// Shared nav model key -> shell icon, so every surface draws the same glyph for the same destination.
export const NAV_ICON: Record<PlatformNavKey, ShellIconName> = {
  home: "home", videos: "watch", shorts: "shorts", community: "community", explore: "search", series: "watch",
  messages: "chat", notifications: "bell", saved: "bookmark", profile: "user", studio: "studio"
};
