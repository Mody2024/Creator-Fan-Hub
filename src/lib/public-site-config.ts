import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicSiteConfig = {
  siteName: string;
  tagline: string;
  heroTitle: string;
  heroBody: string;
  theme: "obsidian" | "paper" | "violet";
  maintenance: { enabled: boolean; message: string };
};

const fallback: PublicSiteConfig = {
  siteName: "THE INNER CIRCLE",
  tagline: "A community built around what comes next.",
  heroTitle: "Your next favorite video starts here.",
  heroBody: "Vote on ideas, share what you want to see, and help shape the next upload.",
  theme: "obsidian",
  maintenance: { enabled: false, message: "We'll be back soon." }
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

  const theme = appearance.theme;
  return {
    siteName: typeof identity.siteName === "string" ? identity.siteName.slice(0, 100) : fallback.siteName,
    tagline: typeof identity.tagline === "string" ? identity.tagline.slice(0, 240) : fallback.tagline,
    heroTitle: typeof hero.title === "string" ? hero.title.slice(0, 180) : fallback.heroTitle,
    heroBody: typeof hero.body === "string" ? hero.body.slice(0, 1000) : fallback.heroBody,
    theme: theme === "paper" || theme === "violet" ? theme : "obsidian",
    maintenance: {
      enabled: maintenance.enabled === true,
      message: typeof maintenance.message === "string" ? maintenance.message.slice(0, 240) : fallback.maintenance.message
    }
  };
}
