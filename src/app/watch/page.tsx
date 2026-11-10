import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import ContinueWatching from "./continue-watching";
import "./watch-library.css";
export const dynamic="force-dynamic";
export default async function WatchLibraryPage(){
 const supabase=await createSupabaseServerClient();
 if(!supabase)return <main className="nhen-app-shell"><p>NHEN Watch is temporarily unavailable.</p></main>;
 const {data}=await supabase.from("video_catalog").select("media_id,slug,description,category,tags,published_at,media_items!inner(title,storage_path,source_url,alt_text,is_published,media_type,processing_status,thumbnail_path)").not("published_at","is",null).order("published_at",{ascending:false}).limit(60);
 const videos=(data??[]).flatMap(item=>{
  const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
  if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
  if(media.media_type==="video"&&media.processing_status!=="ready")return[];
  let src="",youtubeEmbedUrl:string|null=null;
  if(media.media_type==="video"){
   if(!media.storage_path?.startsWith("creator-media-public/"))return[];
   const parts=media.storage_path.split("/");
   if(parts.length<2||!parts.slice(1).every((part:string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part)))return[];
   const publicUrl=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
   try{const parsed=new URL(publicUrl);const configured=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"https://invalid.local");if(parsed.protocol!=="https:"||parsed.origin!==configured.origin)return[];src=parsed.toString();}catch{return[];}
  }else if(media.media_type==="youtube"){
   try{const u=new URL(media.source_url??"");if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname))return[];const parts=u.pathname.split("/").filter(Boolean);const id=u.hostname==="youtu.be"?parts[0]:u.searchParams.get("v")??parts[parts.length-1];if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return[];youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0"}catch{return[]}
  }else return[];
  let poster:string|null=null;
  if(media.thumbnail_path?.startsWith("creator-media-public/")){
   const thumbnailParts=media.thumbnail_path.split("/");
   if(thumbnailParts.length>=2&&thumbnailParts.slice(1).every((part:string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))){
    const candidate=supabase.storage.from(thumbnailParts[0]).getPublicUrl(thumbnailParts.slice(1).join("/")).data.publicUrl;
    try{const parsedPoster=new URL(candidate);const parsedVideo=new URL(src);if(parsedPoster.protocol==="https:"&&parsedPoster.origin===parsedVideo.origin)poster=parsedPoster.toString();}catch{}
   }
  }
  return[{id:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",category:item.category||"Video",src,poster,youtubeEmbedUrl,publishedAt:item.published_at}];
 });
 return <main className="raye2-watch-library" dir="ltr">
  <header className="raye2-watch-header">
   <Link className="raye2-watch-brand" href="/raye2/home" aria-label="Raye2 home"><span aria-hidden="true">R</span><span className="raye2-watch-sr-only">Raye2</span></Link>
   <form className="raye2-watch-search" action="/search"><span aria-hidden="true">⌕</span><input name="q" placeholder="Search videos, creators and communities" aria-label="Search Raye2"/><kbd>↵</kbd></form>
   <nav><Link href="/raye2/home">Home</Link><Link href="/community">Community</Link><Link href="/profile">My profile</Link></nav>
  </header>
  <div className="raye2-watch-layout">
   <aside className="raye2-watch-rail"><span className="raye2-watch-label">YOUR SPACE</span><Link href="/raye2/home">⌂ <span>Home</span></Link><Link className="active" href="/watch">▶ <span>Watch</span></Link><Link href="/shorts">▤ <span>Mini’s</span></Link><Link href="/community">◉ <span>Communities</span></Link></aside>
   <section className="raye2-watch-content">
    <div className="raye2-watch-hero"><span className="raye2-watch-label">RAYE2 / WATCH</span><h1>Stories worth<br/><em>your time.</em></h1><p>Discover videos published by creators across Raye2. Watch, react, save and join the conversation.</p><div className="raye2-watch-hero-meta"><span><i/> CREATOR PUBLISHED</span><span>{videos.length} {videos.length===1?"VIDEO":"VIDEOS"}</span></div></div>
    <ContinueWatching/>
    <div className="raye2-watch-section-head"><div><span className="raye2-watch-label">THE LIBRARY</span><h2>Latest videos</h2></div><span>{videos.length} available</span></div>
    <div className="raye2-watch-grid">{videos.map(video=><article className="raye2-watch-card" key={video.id}><Link className="raye2-watch-card-media" href={"/watch/"+video.slug}><PublicVideoPlayer src={video.src} poster={video.poster} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/><span className="raye2-watch-play">▶</span></Link><div className="raye2-watch-card-copy"><span className="raye2-watch-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><time>{new Date(video.publishedAt).toLocaleDateString()}</time></div></article>)}</div>
    {!videos.length&&<div className="raye2-watch-empty"><span>▶</span><h2>Your next favourite video is on its way.</h2><p>There are no published videos available yet. Check back soon.</p></div>}
   </section>
   <aside className="raye2-watch-aside"><section><span className="raye2-watch-label">EXPLORE MORE</span><h2>Find your next moment.</h2><p>Meet creators, discover communities and find something worth sharing.</p><Link href="/shorts">Explore Mini’s ↗</Link><Link href="/community">Join communities ↗</Link></section></aside>
  </div>
 </main>;
}
