"use client";

import { useEffect } from "react";

/**
 * The language switch lives in account settings only, so first-time visitors get the right language
 * automatically: if no choice is stored yet, follow the browser language (Arabic or English).
 */
export default function LocaleBootstrap() {
  useEffect(() => {
    if (/(?:^|; )raye2_locale=(en|ar)(?:;|$)/.test(document.cookie)) return;
    const arabic = (navigator.language || "").toLowerCase().startsWith("ar");
    document.cookie = `raye2_locale=${arabic ? "ar" : "en"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    if (arabic) window.location.reload();
  }, []);
  return null;
}
