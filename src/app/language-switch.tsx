"use client";

import { useEffect, useState } from "react";

type Variant = "floating" | "header";

/**
 * Locale control. `floating` renders the fixed pill used on surfaces without an app header;
 * `header` renders an inline control meant to sit inside `.raye2-header-actions` so it never
 * overlaps the sticky header content.
 */
export default function LanguageSwitch({ initialLocale = "en", variant = "floating", label }: { initialLocale?: "en" | "ar"; variant?: Variant; label?: string }) {
  const [locale, setLocale] = useState<"en" | "ar">(initialLocale);
  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )raye2_locale=(en|ar)(?:;|$)/);
    if (match) setLocale(match[1] as "en" | "ar");
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  function toggle() {
    const next = locale === "en" ? "ar" : "en";
    document.cookie = `raye2_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setLocale(next);
    window.location.reload();
  }
  const text = label && label.trim().length > 0 ? label : locale === "en" ? "العربية" : "English";
  return <button
    type="button"
    className={variant === "header" ? "raye2-language-switch raye2-language-switch--header" : "raye2-language-switch"}
    onClick={toggle}
    aria-label={locale === "en" ? "Switch language to Arabic" : "تغيير اللغة إلى الإنجليزية"}
    lang={locale === "en" ? "en" : "ar"}
  >
    <span className="raye2-language-code" aria-hidden="true">{locale === "en" ? "AR" : "EN"}</span>{text}
  </button>;
}

