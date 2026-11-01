import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export default async function PublicVideos(){
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data,error}=await supabase.from("video_catalog")
  .select("media_id,slug,description,category,tags,featured,published_at,media_items!inner(id,title,storage_path,alt_text,is_published,media_type)")
  .not("published_at","is",null).order("featured",{ascending:false}).order("published_at",{ascending:false}).limit(24);
 if(error||!data?.length)return null;
 const videos=data.flatMap(item=>{
  const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
  if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
  let url="";
  if(media.media_type==="video"){
   if(!media.storage_path?.startsWith("creator-media-public/"))return[];
   const parts=media.storage_path.split("/");
   url=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  }
  return[{id:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",category:item.category,tags:item.tags??[],featured:item.featured,url,mediaType:media.media_type,publishedAt:item.published_at}];
 });
 if(!videos.length)return null;
 return <section className="public-videos content-section" id="videos" aria-labelledby="public-videos-title">
  <div className="section-heading"><div><span className="eyebrow">04 / NHEN WATCH</span><h2 id="public-videos-title">Fresh from<br/><em>the creator.</em></h2></div><p>Official videos, organized into watch pages and series. Open a video to watch, save it and join its discussion.</p></div>
  <div className="public-video-grid">{videos.map((video,index)=><article className="public-video-card" key={video.id}>
   <Link href={"/watch/"+video.slug} className="nhen-public-video-link" aria-label={"Watch "+video.title}>
    <div className="public-video-frame">{video.mediaType==="video"?<video src={video.url} preload="metadata" muted playsInline/>:<div className="nhen-video-youtube-thumb"><span>▶</span><small>YOUTUBE VIDEO</small></div>}<span className="public-video-index">{video.featured?"✦ FEATURED":String(index+1).padStart(2,"0")}</span><span className="nhen-video-play">▶</span></div>
    <div className="public-video-meta"><span className="eyebrow">{video.category.toUpperCase()} / VIDEO</span><h3>{video.title}</h3>{video.description&&<p>{video.description}</p>}<span className="nhen-watch-link-label">Watch now ↗</span></div>
   </Link>
  </article>)}</div>
 </section>;
}
