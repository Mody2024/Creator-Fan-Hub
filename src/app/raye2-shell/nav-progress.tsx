"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Phase = "idle" | "run" | "done";

/**
 * Instant feedback for navigation: the moment an internal link is tapped, a thin progress bar starts and the
 * current page dims slightly; when the new route arrives the bar completes and the page fades in
 * (see raye2-polish.css route-arrive). Respects reduced motion via CSS.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    setPhase("done");
    const timer = window.setTimeout(() => setPhase("idle"), 360);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let safety: number | undefined;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      let url: URL;
      try { url = new URL(anchor.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setPhase("run");
      window.clearTimeout(safety);
      safety = window.setTimeout(() => setPhase(current => (current === "run" ? "idle" : current)), 10000);
    }
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); window.clearTimeout(safety); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.raye2Nav = phase;
    return () => { delete document.documentElement.dataset.raye2Nav; };
  }, [phase]);

  return <div className="raye2-progress" data-phase={phase} aria-hidden="true" />;
}
