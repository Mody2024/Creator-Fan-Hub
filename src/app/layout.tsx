import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./nhen-design-system.css";
import { getPublicSiteConfig } from "@/lib/public-site-config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const description = config.tagline || "Nhen? (نهين؟) — join the community, share ideas and shape what comes next."; 
  return {
    applicationName: config.siteName,
    title: { default: config.siteName, template: "%s | " + config.siteName },
    description,
    openGraph: { type: "website", siteName: "Nhen? / نهين؟", title: "Nhen? — نهين؟", description, locale: "en_US", alternateLocale: ["ar_EG"] },
    twitter: { card: "summary", title: "Nhen? — نهين؟", description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="creator-credit">MADE BY ALMUDDATHTHIR</footer>
      </body>
    </html>
  );
}
