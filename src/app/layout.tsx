import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./nhen-design-system.css";
import { getPublicSiteConfig } from "@/lib/public-site-config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const description = config.tagline || "Join the N7EN community. Share ideas, vote on what comes next and connect with the creator."; 
  return {
    applicationName: config.siteName,
    title: { default: config.siteName, template: "%s | " + config.siteName },
    description,
    openGraph: { type: "website", siteName: config.siteName, title: config.siteName, description },
    twitter: { card: "summary", title: config.siteName, description },
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
