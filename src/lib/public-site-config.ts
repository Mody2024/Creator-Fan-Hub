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
  theme: "obsidian" | "paper" | "violet";
  colorMode: "dark" | "light" | "system";
  displayFont: "Cabin Sketch" | "Fredericka the Great" | "Chalkduster" | "Chalkboard SE" | "Segoe Print";
  chalkTexture: "hand-drawn" | "soft" | "clean";
  activeEvent: { name: string; accent?: string; displayFont?: string; chalkTexture?: string; theme?: string; colorMode?: string } | null;
  accent: string;
  motion: "full" | "reduced" | "off";
  maintenance: { enabled: boolean; message: string };
  navigation: { contextEyebrow: string; contextTitle: string; languageLabel: string };
  featureFlags: { polls: boolean; ideas: boolean; events: boolean; guidedTour: boolean; mascot: boolean; voice: boolean; miniGames: boolean; store: boolean };
  visibleSections: string[];
  sectionOrder: string[];
  narrationAutoPlay: boolean;
};

const fallback: PublicSiteConfig = {
  siteName: "Raye2",
  logoUrl: null,
  heroMediaUrl: null,
  heroMediaType: null,
  mascotUrl: null,
  narrationUrl: null,
  narrationText: "Welcome. Explore the community, discover ideas, and help shape what comes next.",
  heroOverlay: 0.35,
  heroMuted: true,
  heroLoop: true,
  tagline: "The community shaping what comes next. · مجتمع يصنع القادم.",
  heroTitle: "The next big thing starts with you.",
  heroBody: "Discover the community, put your ideas forward, and help decide what gets made next. Your voice moves the story forward.",
  theme: "obsidian",
  colorMode: "dark",
  displayFont: "Cabin Sketch",
  chalkTexture: "hand-drawn",
  activeEvent: null,
  accent: "#4d8df6",
  motion: "full",
  maintenance: { enabled: false, message: "We'll be back soon." },
  navigation: { contextEyebrow: "", contextTitle: "", languageLabel: "" },
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false },
  visibleSections: ["hero","ideas","poll","events","community","socials","videos"],
  sectionOrder: ["hero","ideas","poll","events","community","socials","videos"],
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
  const navigation = (raw.navigation && typeof raw.navigation === "object" ? raw.navigation : {}) as Record<string, unknown>;
  const flags = (raw.featureFlags && typeof raw.featureFlags === "object" ? raw.featureFlags : {}) as Record<string, unknown>;
  const layout = (raw.layout && typeof raw.layout === "object" ? raw.layout : {}) as Record<string, unknown>;
  const allowedSections = ["hero","ideas","poll","events","community","socials","videos"];
  const now = Date.now();
  const eventThemes = Array.isArray(appearance.eventThemes) ? appearance.eventThemes : [];
  const activeEventRaw = eventThemes.find((event: unknown) => {
    if (!event || typeof event !== "object") return false;
    const item = event as Record<string, unknown>;
    const start = typeof item.startsAt === "string" ? Date.parse(item.startsAt) : NaN;
    const end = typeof item.endsAt === "string" ? Date.parse(item.endsAt) : NaN;
    return item.enabled === true && Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  }) as Record<string, unknown> | undefined;
  const activeEvent = activeEventRaw ? {
    name: typeof activeEventRaw.name === "string" ? activeEventRaw.name.slice(0, 80) : "Event",
    accent: typeof activeEventRaw.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(activeEventRaw.accent) ? activeEventRaw.accent : undefined,
    displayFont: ["Cabin Sketch","Fredericka the Great","Chalkduster","Chalkboard SE","Segoe Print"].includes(String(activeEventRaw.displayFont)) ? String(activeEventRaw.displayFont) : undefined,
    chalkTexture: activeEventRaw.chalkTexture === "soft" || activeEventRaw.chalkTexture === "clean" || activeEventRaw.chalkTexture === "hand-drawn" ? activeEventRaw.chalkTexture : undefined,
    theme: activeEventRaw.theme === "paper" || activeEventRaw.theme === "violet" || activeEventRaw.theme === "obsidian" ? activeEventRaw.theme : undefined,
    colorMode: activeEventRaw.colorMode === "light" || activeEventRaw.colorMode === "system" || activeEventRaw.colorMode === "dark" ? activeEventRaw.colorMode : undefined
  } : null;

  const mediaIds = [identity.logoMediaId, identity.mascotMediaId, identity.narrationMediaId, hero.mediaId].filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
  const mediaResult = mediaIds.length ? await supabase.from("media_items").select("id,media_type,storage_path").in("id", mediaIds).eq("is_published", true) : { data: [], error: null };
  const mediaById = new Map((mediaResult.data ?? []).map((item: { id: string; media_type: string; storage_path: string | null }) => [item.id, item]));
  const logoItem = typeof identity.logoMediaId === "string" ? mediaById.get(identity.logoMediaId) : undefined;
  const mascotItem = typeof identity.mascotMediaId === "string" ? mediaById.get(identity.mascotMediaId) : undefined;
  const narrationItem = typeof identity.narrationMediaId === "string" ? mediaById.get(identity.narrationMediaId) : undefined;
  const heroItem = typeof hero.mediaId === "string" ? mediaById.get(hero.mediaId) : undefined;
  const publicMediaUrl = (item: { storage_path: string | null; media_type: string } | undefined, allowedTypes: readonly string[]) => {
    if (!item || !allowedTypes.includes(item.media_type) || !item.storage_path || !item.storage_path.startsWith("creator-media-public/")) return null;
    const pathParts = item.storage_path.split("/");
    const bucket = pathParts.shift();
    if (!bucket || pathParts.length === 0) return null;
    return supabase.storage.from(bucket).getPublicUrl(pathParts.join("/")).data.publicUrl;
  };
  return {
    siteName: "Raye2",
    logoUrl: publicMediaUrl(logoItem, ["image"]),
    heroMediaUrl: publicMediaUrl(heroItem, ["image", "video"]),
    heroMediaType: heroItem?.media_type === "video" ? "video" : heroItem?.media_type === "image" ? "image" : null,
    mascotUrl: publicMediaUrl(mascotItem, ["image"]),
    narrationUrl: publicMediaUrl(narrationItem, ["audio"]),
    narrationText: typeof identity.narrationText === "string" ? identity.narrationText.slice(0, 1600) : fallback.narrationText,
    narrationAutoPlay: identity.narrationAutoPlay !== false,
    heroOverlay: typeof hero.overlay === "number" && Number.isFinite(hero.overlay) ? Math.min(0.85, Math.max(0, hero.overlay)) : 0.35,
    heroMuted: hero.muted !== false,
    heroLoop: hero.loop !== false,
    tagline: typeof identity.tagline === "string" ? identity.tagline.slice(0, 240) : fallback.tagline,
    heroTitle: typeof hero.title === "string" ? hero.title.slice(0, 180) : fallback.heroTitle,
    heroBody: typeof hero.body === "string" ? hero.body.slice(0, 1000) : fallback.heroBody,
    theme: activeEvent?.theme === "paper" || activeEvent?.theme === "violet" ? activeEvent.theme : appearance.theme === "paper" || appearance.theme === "violet" ? appearance.theme : "obsidian",
    colorMode: activeEvent?.colorMode === "light" || activeEvent?.colorMode === "system" ? activeEvent.colorMode : appearance.colorMode === "light" || appearance.colorMode === "system" ? appearance.colorMode : "dark",
    displayFont: activeEvent?.displayFont === "Fredericka the Great" || activeEvent?.displayFont === "Chalkduster" || activeEvent?.displayFont === "Chalkboard SE" || activeEvent?.displayFont === "Segoe Print" ? activeEvent.displayFont : appearance.displayFont === "Fredericka the Great" || appearance.displayFont === "Chalkduster" || appearance.displayFont === "Chalkboard SE" || appearance.displayFont === "Segoe Print" ? appearance.displayFont : "Cabin Sketch",
    chalkTexture: activeEvent?.chalkTexture === "soft" || activeEvent?.chalkTexture === "clean" ? activeEvent.chalkTexture : appearance.chalkTexture === "soft" || appearance.chalkTexture === "clean" ? appearance.chalkTexture : "hand-drawn",
    activeEvent,
    accent: activeEvent?.accent ?? (typeof appearance.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(appearance.accent) ? appearance.accent : fallback.accent),
    motion: appearance.motion === "reduced" || appearance.motion === "off" ? appearance.motion : "full",
    maintenance: {
      enabled: maintenance.enabled === true,
      message: typeof maintenance.message === "string" ? maintenance.message.slice(0, 240) : fallback.maintenance.message
    },
    navigation: {
      contextEyebrow: typeof navigation.contextEyebrow === "string" ? navigation.contextEyebrow.slice(0, 40) : "",
      contextTitle: typeof navigation.contextTitle === "string" ? navigation.contextTitle.slice(0, 60) : "",
      languageLabel: typeof navigation.languageLabel === "string" ? navigation.languageLabel.slice(0, 20) : ""
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
