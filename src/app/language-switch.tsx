"use client";

import { useEffect, useState } from "react";

export default function LanguageSwitch({ initialLocale = "en" }: { initialLocale?: "en" | "ar" }) {
  const [locale, setLocale] = useState<"en" | "ar">(initialLocale);
  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);
    if (match) setLocale(match[1] as "en" | "ar");
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  function toggle() {
    const next = locale === "en" ? "ar" : "en";
    document.cookie = `nhen_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setLocale(next);
    window.location.reload();
  }
  return <button type="button" className="nhen-language-switch" onClick={toggle} aria-label={locale === "en" ? "Switch language to Arabic" : "تغيير اللغة إلى الإنجليزية"} lang={locale === "en" ? "en" : "ar"}>
    <span aria-hidden="true">◎</span>{locale === "en" ? "العربية" : "English"}
  </button>;
}
