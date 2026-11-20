"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function RouteTransition() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (!pathname || previousPath.current === pathname) return;
    previousPath.current = pathname;

    const root = document.documentElement;
    root.classList.remove("raye2-route-enter");
    void root.offsetWidth;
    root.classList.add("raye2-route-enter");

    const timeout = window.setTimeout(() => {
      root.classList.remove("raye2-route-enter");
    }, 320);

    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return null;
}
