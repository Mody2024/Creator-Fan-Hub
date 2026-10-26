import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";

type PublicVideo = { id: string; title: string; storage_path: string | null; alt_text: string | null; created_at: string };

export default async function PublicVideos() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("media_items")
    .select("id,title,storage_path,alt_text,created_at")
    .eq("is_published", true)
    .eq("media_type", "video")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error || !data?.length) return null;
  const videos = (data as PublicVideo[]).flatMap(item => {
    if (!item.storage_path?.startsWith("creator-media-public/")) return [];
    const [bucket, ...parts] = item.storage_path.split("/");
    if (!bucket || !parts.length) return [];
    const url = supabase.storage.from(bucket).getPublicUrl(parts.join("/")).data.publicUrl;
    return [{ ...item, url }];
  });
  if (!videos.length) return null;
  return <section className="public-videos content-section" id="videos" aria-labelledby="public-videos-title">
    <div className="section-heading"><div><span className="eyebrow">04 / THE WATCHLIST</span><h2 id="public-videos-title">Fresh from<br/><em>the creator.</em></h2></div><p>Published videos and clips, all in one place. New uploads appear here after they are published in the Media Library.</p></div>
    <div className="public-video-grid">{videos.map((video,index)=><article className="public-video-card" key={video.id}>
      <div className="public-video-frame"><PublicVideoPlayer src={video.url} title={video.title} description={video.alt_text} /><span className="public-video-index">{String(index+1).padStart(2,"0")}</span></div>
      <div className="public-video-meta"><span className="eyebrow">VIDEO / {String(index+1).padStart(2,"0")}</span><h3>{video.title}</h3>{video.alt_text && <p>{video.alt_text}</p>}</div>
    </article>)}</div>
  </section>;
}
