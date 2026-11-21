import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./raye2-design-system.css";
import "./raye2/raye2-brand-system.css";
import "./raye2-polish.css";
import "./raye2-shell/raye2-shell.css";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import TelemetryReporter from "./telemetry-reporter";
import RouteTransition from "./route-transition";
import BottomNav from "./raye2-shell/bottom-nav";
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
  const ideaCreditName = process.env.NEXT_PUBLIC_IDEA_CREDIT_NAME?.trim() || "";
  const ideaCreditLogoUrl = process.env.NEXT_PUBLIC_IDEA_CREDIT_LOGO_URL?.trim() || "";
  const ideaCreditYoutubeUrl = process.env.NEXT_PUBLIC_IDEA_CREDIT_YOUTUBE_URL?.trim() || "";
  let safeIdeaCreditYoutubeUrl = "";
  try {
    const candidate = new URL(ideaCreditYoutubeUrl);
    if (candidate.protocol === "https:" && (candidate.hostname === "youtube.com" || candidate.hostname.endsWith(".youtube.com") || candidate.hostname === "youtu.be")) safeIdeaCreditYoutubeUrl = candidate.toString();
  } catch { /* Optional credit link is omitted until configured correctly. */ }
  const showIdeaCredit = Boolean(ideaCreditName && ideaCreditLogoUrl && safeIdeaCreditYoutubeUrl);
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <RouteTransition />
        <TelemetryReporter />
        {children}
        <BottomNav locale={locale} />
        <footer className="creator-credit"><span>MADE BY ALMUDDATHTHIR</span>{showIdeaCredit ? <span className="creator-idea-credit"> · WEBSITE IDEA BY <a href={safeIdeaCreditYoutubeUrl} target="_blank" rel="noopener noreferrer"><img src={ideaCreditLogoUrl} alt="" loading="lazy" />{ideaCreditName}</a></span> : null}</footer>
      </body>
    </html>
  );
}
