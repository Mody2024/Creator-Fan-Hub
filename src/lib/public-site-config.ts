import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicSiteConfig = {
  siteName: string;
  logoUrl: string | null;
  heroMediaUrl: string | null;
  heroMediaType: "image" | "video" | null;
  mascotUrl: string | null;
  narrationUrl: string | null;
  narrationText: string;
  heroOverlay: number;
  heroMuted: boolean;
  heroLoop: boolean;
  tagline: string;
  heroTitle: string;
  heroBody: string;
  theme: "obsidian" | "paper" | "violet" | "custom";
  accent: string;
  maintenance: { enabled: boolean; message: string };
  featureFlags: { polls: boolean; ideas: boolean; events: boolean; guidedTour: boolean; mascot: boolean; voice: boolean; miniGames: boolean; store: boolean };
  visibleSections: string[];
  sectionOrder: string[];
  narrationAutoPlay: boolean;
};

const fallback: PublicSiteConfig = {
  siteName: "THE INNER CIRCLE",
  logoUrl: null,
  heroMediaUrl: null,
  heroMediaType: null,
  mascotUrl: null,
  narrationUrl: null,
  narrationText: "Welcome. Explore the community, discover ideas, and help shape what comes next.",
  heroOverlay: 0.35,
  heroMuted: true,
  heroLoop: true,
  tagline: "A community built around what comes next.",
  heroTitle: "Your next favorite video starts here.",
  heroBody: "Vote on ideas, share what you want to see, and help shape the next upload.",
  theme: "obsidian",
  accent: "#d8ff75",
  maintenance: { enabled: false, message: "We'll be back soon." },
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false },
  visibleSections: ["hero","ideas","poll","events","community","socials"],
  sectionOrder: ["hero","ideas","poll","events","community","socials"],
  narrationAutoPlay: true
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
  const mediaIds = [identity.logoMediaId, identity.mascotMediaId, identity.narrationMediaId, hero.mediaId].filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  const mediaResult = mediaIds.length ? await supabase.from("media_items").select("id,media_type,storage_path").in("id", mediaIds).eq("is_published", true) : { data: [], error: null };
  const mediaById = new Map((mediaResult.data ?? []).map((item: { id: string; media_type: string; storage_path: string | null }) => [item.id, item]));
  const logoItem = typeof identity.logoMediaId === "string" ? mediaById.get(identity.logoMediaId) : undefined;
  const mascotItem = typeof identity.mascotMediaId === "string" ? mediaById.get(identity.mascotMediaId) : undefined;
  const narrationItem = typeof identity.narrationMediaId === "string" ? mediaById.get(identity.narrationMediaId) : undefined;
  const heroItem = typeof hero.mediaId === "string" ? mediaById.get(hero.mediaId) : undefined;
  const publicMediaUrl = (item: { storage_path: string | null } | undefined) => {
    if (!item || !item.storage_path || !item.storage_path.startsWith("creator-media-public/")) return null;
    const pathParts = item.storage_path.split("/");
    const bucket = pathParts.shift();
    if (!bucket || pathParts.length === 0) return null;
    return supabase.storage.from(bucket).getPublicUrl(pathParts.join("/")).data.publicUrl;
  };
  return {
    siteName: typeof identity.siteName === "string" ? identity.siteName.slice(0, 100) : fallback.siteName,
    logoUrl: publicMediaUrl(logoItem),
    heroMediaUrl: publicMediaUrl(heroItem),
    heroMediaType: heroItem?.media_type === "video" ? "video" : heroItem?.media_type === "image" ? "image" : null,
    mascotUrl: mascotItem?.media_type === "image" ? publicMediaUrl(mascotItem) : null,
    narrationUrl: narrationItem?.media_type === "audio" ? publicMediaUrl(narrationItem) : null,
    narrationText: typeof identity.narrationText === "string" ? identity.narrationText.slice(0, 1600) : fallback.narrationText,
    narrationAutoPlay: identity.narrationAutoPlay !== false,
    heroOverlay: typeof hero.overlay === "number" && Number.isFinite(hero.overlay) ? Math.min(0.85, Math.max(0, hero.overlay)) : 0.35,
    heroMuted: hero.muted !== false,
    heroLoop: hero.loop !== false,
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
    sectionOrder: Array.isArray(layout.sectionOrder) ? [...new Set(layout.sectionOrder.filter((item): item is string => typeof item === "string" && allowedSections.includes(item)))].concat(fallback.sectionOrder.filter(item => !(layout.sectionOrder as unknown[]).includes(item))) : fallback.sectionOrder,
    featureFlags: {
      polls: flags.polls !== false, ideas: flags.ideas !== false, events: flags.events !== false,
      guidedTour: flags.guidedTour !== false, mascot: flags.mascot !== false,
      voice: flags.voice === true, miniGames: flags.miniGames === true, store: flags.store === true
    }
  };
}
