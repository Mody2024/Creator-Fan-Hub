import Link from "next/link";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export default async function PublicVideos() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("video_catalog")
    .select("media_id,slug,description,category,tags,featured,published_at,media_items!inner(id,title,storage_path,alt_text,is_published,media_type)")
    .not("published_at", "is", null)
    .eq("media_items.is_published", true)
    .eq("media_items.media_type", "video")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(24);

  if (error || !data?.length) return null;

  const videos = data.flatMap((item) => {
    const media = Array.isArray(item.media_items) ? item.media_items[0] : item.media_items;
    if (!media?.storage_path?.startsWith("creator-media-public/")) return [];

    const parts = media.storage_path.split("/");
    if (parts.length < 2 || !parts.slice(1).join("/")) return [];
    const url = supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;

    return [{
      id: item.media_id,
      slug: item.slug,
      title: media.title,
      description: item.description || media.alt_text || "",
      category: item.category || "VIDEO",
      tags: item.tags ?? [],
      featured: item.featured,
      url,
    }];
  });

  if (!videos.length) return null;

  return <section className="public-videos content-section" id="videos" aria-labelledby="public-videos-title">
    <div className="section-heading">
      <div><span className="eyebrow">04 / N7EN WATCH</span><h2 id="public-videos-title">Fresh from<br /><em>the creator.</em></h2></div>
      <p>Official videos, organized into watch pages and series. Open a video to watch, save it and join its discussion.</p>
    </div>
    <div className="public-video-grid">{videos.map((video, index) => <article className="public-video-card" key={video.id}>
      <div className="public-video-frame">
        <PublicVideoPlayer src={video.url} title={video.title} description={video.description} />
        <span className="public-video-index">{video.featured ? "✦ FEATURED" : String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="public-video-meta">
        <span className="eyebrow">{video.category.toUpperCase()} / VIDEO</span>
        <h3>{video.title}</h3>
        {video.description && <p>{video.description}</p>}
        <Link href={"/watch/" + video.slug} className="nhen-watch-link-label">Watch now ↗</Link>
      </div>
    </article>)}</div>
  </section>;
}
