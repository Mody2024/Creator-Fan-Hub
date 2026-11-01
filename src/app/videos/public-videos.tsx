import Link from "next/link";
import { cookies } from "next/headers";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import {createSupabaseServerClient} from "@/lib/supabase/server";

function youtubeEmbedUrl(source: string | null): string | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else if (["embed", "shorts", "live"].includes(parts[0] ?? "")) id = parts[1] ?? "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return "https://www.youtube-nocookie.com/embed/" + id;
  } catch {
    return null;
  }
}

export default async function PublicVideos() {
  const [supabase,cookieStore] = await Promise.all([createSupabaseServerClient(),cookies()]);
  const isArabic = cookieStore.get("nhen_locale")?.value === "ar";
  const copy = isArabic ? {
    eyebrow:"04 / NHEN WATCH", first:"أحدث فيديوهات", emphasis:"صنّاع المحتوى.", description:"فيديوهات رسمية منظمة في صفحات مشاهدة وسلاسل. افتح الفيديو للمشاهدة والحفظ والمشاركة في النقاش.", featured:"مميز", watch:"شاهد الآن ↗"
  } : {
    eyebrow:"04 / NHEN WATCH", first:"Fresh from", emphasis:"the creator.", description:"Official videos, organized into watch pages and series. Open a video to watch, save it and join its discussion.", featured:"✦ FEATURED", watch:"Watch now ↗"
  };
  if (!supabase) return null;

  const { data, error } = await supabase.from("video_catalog")
    .select("media_id,slug,description,category,tags,featured,published_at,media_items!inner(id,title,storage_path,source_url,alt_text,is_published,media_type,provider,playback_kind,processing_status)")
    .not("published_at", "is", null)
    .eq("media_items.is_published", true)
    .in("media_items.media_type", ["video", "youtube"])
    .eq("media_items.processing_status", "ready")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(24);

  if (error || !data?.length) return null;

  const videos = data.flatMap((item) => {
    const media = Array.isArray(item.media_items) ? item.media_items[0] : item.media_items;
    if (!media) return [];

    const isYoutube = media.provider === "youtube" || media.media_type === "youtube" || media.playback_kind === "youtube_embed";
    let url = "";
    let embedUrl: string | null = null;

    if (isYoutube) {
      embedUrl = youtubeEmbedUrl(media.source_url);
      if (!embedUrl) return [];
    } else {
      if (!media.storage_path?.startsWith("creator-media-public/")) return [];
      const parts = media.storage_path.split("/");
      if (parts.length < 2 || !parts.slice(1).join("/")) return [];
      url = supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
    }

    return [{
      id: item.media_id,
      slug: item.slug,
      title: media.title,
      description: item.description || media.alt_text || "",
      category: item.category || "VIDEO",
      featured: item.featured,
      url,
      embedUrl,
    }];
  });

  if (!videos.length) return null;

  return <section className="public-videos content-section" id="videos" dir={isArabic?"rtl":"ltr"} lang={isArabic?"ar":"en"} aria-labelledby="public-videos-title">
    <div className="section-heading">
      <div><span className="eyebrow">{copy.eyebrow}</span><h2 id="public-videos-title">{copy.first}<br /><em>{copy.emphasis}</em></h2></div>
      <p>{copy.description}</p>
    </div>
    <div className="public-video-grid">{videos.map((video, index) => <article className="public-video-card" key={video.id}>
      <div className="public-video-frame">
        <PublicVideoPlayer src={video.url} youtubeEmbedUrl={video.embedUrl} title={video.title} description={video.description} />
        <span className="public-video-index">{video.featured ? copy.featured : String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="public-video-meta">
        <span className="eyebrow">{video.category.toUpperCase()} / VIDEO</span>
        <h3>{video.title}</h3>
        {video.description && <p>{video.description}</p>}
        <Link href={"/watch/" + video.slug} className="nhen-watch-link-label">{copy.watch}</Link>
      </div>
    </article>)}</div>
  </section>;
}
