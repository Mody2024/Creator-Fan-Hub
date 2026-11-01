import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
export const dynamic="force-dynamic";
export default async function ShortsPage(){
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data}=await supabase.from("video_catalog").select("media_id,slug,description,category,tags,published_at,media_items!inner(title,storage_path,source_url,alt_text,is_published,media_type)").eq("category","Shorts").not("published_at","is",null).order("published_at",{ascending:false}).limit(30);
 const shorts=(data??[]).flatMap(item=>{
  const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
  if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
  let src="",youtubeEmbedUrl:string|null=null;
  if(media.media_type==="video"){
   if(!media.storage_path?.startsWith("creator-media-public/"))return[];
   const parts=media.storage_path.split("/");
   src=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  }else{
   try{const u=new URL(media.source_url??"");if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname))return[];const parts=u.pathname.split("/").filter(Boolean);const id=u.hostname==="youtu.be"?parts[0]:u.searchParams.get("v")??parts[parts.length-1];if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return[];youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0"}catch{return[]}
  }
  return[{mediaId:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",src,youtubeEmbedUrl,publishedAt:item.published_at}];
 });
 return <main className="nhen-shorts-page"><header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/#videos">Watch</Link><Link href="/series">Series</Link><Link href="/community">Community</Link></nav></header><div className="nhen-shorts-heading"><span className="nhen-section-label">NHEN WATCH / SHORTS</span><h1>Quick <em>moments.</em></h1><p className="nhen-muted">A vertical stream of short creator videos.</p></div><div className="nhen-shorts-feed">{shorts.length?shorts.map((v,i)=><article className="nhen-short-card" key={v.mediaId}><div className="nhen-short-player"><PublicVideoPlayer src={v.src} title={v.title} description={v.description} youtubeEmbedUrl={v.youtubeEmbedUrl}/></div><div className="nhen-short-info"><span className="nhen-section-label">SHORT / {String(i+1).padStart(2,"0")}</span><h2>{v.title}</h2><p>{v.description}</p><Link href={"/watch/"+v.slug}>Open full video ↗</Link></div></article>):<div className="nhen-card nhen-empty-state">No Shorts have been published yet. Set a video's category to Shorts in NHEN Studio to feature it here.</div>}</div></main>;
}
