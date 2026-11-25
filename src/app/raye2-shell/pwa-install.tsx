"use client";

import { useEffect, useState } from "react";
import styles from "./pwa-install.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState<"en" | "ar">("en");

  useEffect(() => {
    setLocale(/(?:^|; )raye2_locale=ar(?:;|$)/.test(document.cookie) ? "ar" : "en");
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent || busy) return;
    setBusy(true);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } finally {
      setPromptEvent(null);
      setBusy(false);
    }
  }

  if (!promptEvent) return null;
  const isArabic = locale === "ar";

  return (
    <aside className={styles.card} dir={isArabic ? "rtl" : "ltr"} aria-label={isArabic ? "تثبيت Raye2" : "Install Raye2"}>
      <span className={styles.mark} aria-hidden="true">R</span>
      <span className={styles.copy}>
        <strong>{isArabic ? "خلّي Raye2 على جهازك" : "Keep Raye2 close"}</strong>
        <small>{isArabic ? "افتحه كتطبيق سريع من شاشتك الرئيسية." : "Install the app for a faster, app-like experience."}</small>
      </span>
      <button className={styles.install} type="button" onClick={() => void install()} disabled={busy}>
        {busy ? (isArabic ? "جارٍ التثبيت…" : "Opening…") : (isArabic ? "تثبيت" : "Install")}
      </button>
      <button className={styles.dismiss} type="button" onClick={() => setPromptEvent(null)} aria-label={isArabic ? "إغلاق" : "Dismiss"}>×</button>
    </aside>
  );
}
