import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicSiteConfig = {
  siteName: string;
  tagline: string;
  heroTitle: string;
  heroBody: string;
  theme: "obsidian" | "paper" | "violet" | "custom";
  accent: string;
  maintenance: { enabled: boolean; message: string };
  featureFlags: { polls: boolean; ideas: boolean; events: boolean; guidedTour: boolean; mascot: boolean; voice: boolean; miniGames: boolean; store: boolean };
  visibleSections: string[];
};

const fallback: PublicSiteConfig = {
  siteName: "THE INNER CIRCLE",
  tagline: "A community built around what comes next.",
  heroTitle: "Your next favorite video starts here.",
  heroBody: "Vote on ideas, share what you want to see, and help shape the next upload.",
  theme: "obsidian",
  accent: "#d8ff75",
  maintenance: { enabled: false, message: "We'll be back soon." },
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false },
  visibleSections: ["hero","ideas","poll","events","community","socials"]
};

export async function getPublicSiteConfig(): Promise<PublicSiteConfig> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("published_site_config")
    .select("published")
    .eq("config_key", "primary")
    .maybeSingle();

  if (error || !data?.published || typeof data.published !== "object") return fallback;

  const raw = data.published as Record<string, unknown>;
  const identity = (raw.identity && typeof raw.identity === "object" ? raw.identity : {}) as Record<string, unknown>;
  const hero = (raw.hero && typeof raw.hero === "object" ? raw.hero : {}) as Record<string, unknown>;
  const appearance = (raw.appearance && typeof raw.appearance === "object" ? raw.appearance : {}) as Record<string, unknown>;
  const maintenance = (raw.maintenance && typeof raw.maintenance === "object" ? raw.maintenance : {}) as Record<string, unknown>;
  const flags = (raw.featureFlags && typeof raw.featureFlags === "object" ? raw.featureFlags : {}) as Record<string, unknown>;
  const layout = (raw.layout && typeof raw.layout === "object" ? raw.layout : {}) as Record<string, unknown>;
  const allowedSections = ["hero","ideas","poll","events","community","socials"];

  const theme = appearance.theme;
  return {
    siteName: typeof identity.siteName === "string" ? identity.siteName.slice(0, 100) : fallback.siteName,
    tagline: typeof identity.tagline === "string" ? identity.tagline.slice(0, 240) : fallback.tagline,
    heroTitle: typeof hero.title === "string" ? hero.title.slice(0, 180) : fallback.heroTitle,
    heroBody: typeof hero.body === "string" ? hero.body.slice(0, 1000) : fallback.heroBody,
    theme: theme === "paper" || theme === "violet" || theme === "custom" ? theme : "obsidian",
    accent: typeof appearance.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(appearance.accent) ? appearance.accent : fallback.accent,
    maintenance: {
      enabled: maintenance.enabled === true,
      message: typeof maintenance.message === "string" ? maintenance.message.slice(0, 240) : fallback.maintenance.message
    },
    visibleSections: Array.isArray(layout.visibleSections) ? layout.visibleSections.filter((item): item is string => typeof item === "string" && allowedSections.includes(item)) : fallback.visibleSections,
    featureFlags: {
      polls: flags.polls !== false, ideas: flags.ideas !== false, events: flags.events !== false,
      guidedTour: flags.guidedTour !== false, mascot: flags.mascot !== false,
      voice: flags.voice === true, miniGames: flags.miniGames === true, store: flags.store === true
    }
  };
}
