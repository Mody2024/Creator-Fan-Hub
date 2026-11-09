import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./nhen-design-system.css";
import "./raye2/raye2-brand-system.css";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import LanguageSwitch from "./language-switch";
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
  };
}

export const viewport: Viewport = {
  themeColor: "#080b12",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("nhen_locale")?.value === "ar" ? "ar" : "en";
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr">
      <body>
        <LanguageSwitch initialLocale={locale} />
        {children}
        <footer className="creator-credit">MADE BY ALMUDDATHTHIR</footer>
      </body>
    </html>
  );
}
