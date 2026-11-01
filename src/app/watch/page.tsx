import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
export const dynamic="force-dynamic";
export default async function WatchLibraryPage(){
 const supabase=await createSupabaseServerClient();
 if(!supabase)return <main className="nhen-app-shell"><p>NHEN Watch is temporarily unavailable.</p></main>;
 const {data}=await supabase.from("video_catalog").select("media_id,slug,description,category,tags,published_at,media_items!inner(title,storage_path,source_url,alt_text,is_published,media_type)").not("published_at","is",null).order("published_at",{ascending:false}).limit(60);
 const videos=(data??[]).flatMap(item=>{
  const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
  if(!media?.is_published)return[];
  let src="",youtubeEmbedUrl:string|null=null;
  if(media.media_type==="video"){
   if(!media.storage_path?.startsWith("creator-media-public/"))return[];
   const parts=media.storage_path.split("/");
   if(parts.length<2)return[];
   src=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  }else if(media.media_type==="youtube"){
   try{const u=new URL(media.source_url??"");if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname))return[];const parts=u.pathname.split("/").filter(Boolean);const id=u.hostname==="youtu.be"?parts[0]:u.searchParams.get("v")??parts[parts.length-1];if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return[];youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0"}catch{return[]}
  }else return[];
  return[{id:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",category:item.category||"Video",src,youtubeEmbedUrl,publishedAt:item.published_at}];
 });
 return <main className="nhen-app-shell"><header className="nhen-app-header"><Link className="nhen-brand" href="/">Nhen?<small lang="ar" dir="rtl">نهين؟</small></Link><form className="nhen-search-form" action="/search"><input className="nhen-search" name="q" placeholder="Search NHEN videos"/></form><Link className="nhen-pill" href="/community">Community</Link></header><div className="nhen-platform-grid"><aside className="nhen-sidebar"><Link className="nhen-sidebar-link" href="/">⌂ Home</Link><Link className="nhen-sidebar-link" href="/watch">▶ Watch</Link><Link className="nhen-sidebar-link" href="/shorts">✦ Nhenbits</Link><Link className="nhen-sidebar-link" href="/community">◉ Community</Link></aside><section className="nhen-feed-column"><div className="nhen-card nhen-card-pad"><span className="nhen-section-label">NHEN ORIGINALS</span><h1 className="nhen-card-title">Watch <em>what moves you.</em></h1><p className="nhen-muted">Official videos published by NHEN creators. Open a video to watch, react, save and join its discussion.</p></div><div className="nhen-home-video-grid">{videos.map(video=><article className="nhen-home-video-card" key={video.id}><Link className="nhen-home-video-player" href={"/watch/"+video.slug}><PublicVideoPlayer src={video.src} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/></Link><div className="nhen-home-video-meta"><span className="nhen-section-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><small>{new Date(video.publishedAt).toLocaleDateString()}</small></div></article>)}</div>{!videos.length&&<div className="nhen-card nhen-empty-state">No official videos yet. Check back soon.</div>}</section><aside className="nhen-discovery-column"><section className="nhen-card nhen-card-pad"><span className="nhen-section-label">MORE NHEN</span><h2 className="nhen-card-title">Find your next moment.</h2><Link href="/shorts">Explore Nhenbits ↗</Link><br/><Link href="/community">Join the community ↗</Link></section></aside></div></main>;
}
