"use client";

import { createContext, useContext, type ReactNode } from "react";

const BrandContext = createContext<string | null>(null);

/** Carries the site's uploaded logo (if any) to every shell surface from the root layout. */
export function BrandProvider({ logoUrl, children }: { logoUrl: string | null; children: ReactNode }) {
  return <BrandContext.Provider value={logoUrl}>{children}</BrandContext.Provider>;
}
export function useBrandLogo(): string | null { return useContext(BrandContext); }
