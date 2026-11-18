import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./raye2-design-system.css";
import "./raye2/raye2-brand-system.css";
import "./raye2-polish.css";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import LanguageSwitch from "./language-switch";
import TelemetryReporter from "./telemetry-reporter";
import { cookies } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const description = config.tagline || "Raye2 — videos, creators and communities, connected."; 
  return {
    applicationName: "Raye2",
    title: { default: "Raye2", template: "%s | Raye2" },
    description,
    openGraph: { type: "website", siteName: "Raye2", title: "Raye2", description, locale: "en_US", alternateLocale: ["ar_EG"] },
    twitter: { card: "summary", title: "Raye2", description },
    robots: { index: true, follow: true },
    icons: {
      icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
      apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
      shortcut: ["/favicon.ico"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <LanguageSwitch initialLocale={locale} />
        <TelemetryReporter />
        {children}
        <footer className="creator-credit">MADE BY ALMUDDATHTHIR</footer>
      </body>
    </html>
  );
}
