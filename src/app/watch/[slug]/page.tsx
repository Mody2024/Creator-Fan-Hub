import {notFound} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import WatchDetailClient from "./watch-detail-client";

export const dynamic="force-dynamic";

export default async function WatchVideoPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const supabase=await createSupabaseServerClient();
 if(!supabase)notFound();
 const {data,error}=await supabase.from("video_catalog")
  .select("media_id,slug,description,category,tags,published_at,allow_comments,media_items!inner(id,title,storage_path,source_url,alt_text,is_published,media_type)")
  .eq("slug",slug).not("published_at","is",null).maybeSingle();
 if(error||!data)notFound();
 const media=Array.isArray(data.media_items)?data.media_items[0]:data.media_items;
 if(!media?.is_published||!["video","youtube"].includes(media.media_type))notFound();
 let src="";
 let youtubeEmbedUrl:string|null=null;
 if(media.media_type==="video"){
  if(!media.storage_path?.startsWith("creator-media-public/"))notFound();
  const parts=media.storage_path.split("/");
  src=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
 }else{
  try{
   const source=new URL(media.source_url??"");
   if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(source.hostname))notFound();
   const pathParts=source.pathname.split("/").filter(Boolean);
   const id=source.hostname==="youtu.be"?pathParts[0]:source.searchParams.get("v")??pathParts[pathParts.length-1];
   if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))notFound();
   youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0";
  }catch{notFound();}
 }
 return <WatchDetailClient mediaId={data.media_id} title={media.title} description={data.description||media.alt_text||""} src={src} youtubeEmbedUrl={youtubeEmbedUrl} publishedAt={data.published_at!} allowComments={data.allow_comments} category={data.category} tags={data.tags??[]}/>;
}
