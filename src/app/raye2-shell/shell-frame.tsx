import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import ShellTopBar from "./shell-top";
import ShellRail from "./shell-rail";

/**
 * Section layout chrome: the shared top bar and side menu around a page. Each section (clips, events,
 * groups, ...) wraps its pages with this in its own layout.tsx, so pages only render their content.
 */
export default async function ShellFrame({ children }: { children: ReactNode }) {
  const [cookieStore, config] = await Promise.all([cookies(), getPublicSiteConfig()]);
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  return (
    <>
      <ShellTopBar locale={locale} />
      <div className="raye2-frame">
        <ShellRail locale={locale} showVideos={config.visibleSections.includes("videos")} />
        <div className="raye2-frame-main">{children}</div>
      </div>
    </>
  );
}
