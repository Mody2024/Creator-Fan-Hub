import {notFound} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import WatchDetailClient from "./watch-detail-client";

export const dynamic="force-dynamic";

export default async function WatchVideoPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{t?:string}>}){
 const [{slug},{t}]=await Promise.all([params,searchParams]);
 const parsedStart=Number(t);
 const startAt=Number.isSafeInteger(parsedStart)&&parsedStart>=0&&parsedStart<=86400?parsedStart:0;
 const supabase=await createSupabaseServerClient();
 if(!supabase)notFound();
 const {data,error}=await supabase.from("video_catalog")
  .select("media_id,slug,description,category,tags,published_at,allow_comments,media_items!inner(id,title,storage_path,thumbnail_path,source_url,alt_text,is_published,media_type,processing_status,metadata)")
  .eq("slug",slug).not("published_at","is",null).maybeSingle();
 if(error||!data)notFound();
 const media=Array.isArray(data.media_items)?data.media_items[0]:data.media_items;
 if(!media?.is_published||!["video","youtube"].includes(media.media_type))notFound();
 if(media.media_type==="video"&&media.processing_status!=="ready")notFound();
 let src="";
 let poster:string|null=null;
 let youtubeEmbedUrl:string|null=null;\n let hlsSrc:string|null=null;
 if(media.media_type==="video"){
  if(!media.storage_path?.startsWith("creator-media-public/"))notFound();
  const parts=media.storage_path.split("/");
  if(parts.length<2||!parts.slice(1).every((part: string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part)))notFound();
  const publicUrl=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  let parsedPublicUrl: URL;
  try { parsedPublicUrl=new URL(publicUrl); } catch { notFound(); }
  if(parsedPublicUrl.protocol!=="https:"||parsedPublicUrl.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"https://invalid.local").origin)notFound();
  src=parsedPublicUrl.toString();\n  const hlsPath=media.metadata?.processing?.hls?.masterPath;\n  if(typeof hlsPath==="string"&&hlsPath.startsWith("creator-media-public/")){\n   const hlsParts=hlsPath.split("/");\n   if(hlsParts.length===6&&hlsParts[1]===parts[1]&&hlsParts[2]==="streams"&&hlsParts[3].startsWith(media.id+"-")&&hlsParts[4]==="master"&&hlsParts[5]==="master.m3u8"&&hlsParts.slice(1).every((part:string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))){\n    const candidate=supabase.storage.from(hlsParts[0]).getPublicUrl(hlsParts.slice(1).join("/")).data.publicUrl;\n    try{const parsedHls=new URL(candidate);if(parsedHls.protocol==="https:"&&parsedHls.origin===parsedPublicUrl.origin)hlsSrc=parsedHls.toString();}catch{}\n   }\n  }
  if(media.thumbnail_path?.startsWith("creator-media-public/")){
   const thumbnailParts=media.thumbnail_path.split("/");
   if(thumbnailParts.length>=2&&thumbnailParts.slice(1).every((part:string)=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))){
    const candidate=supabase.storage.from(thumbnailParts[0]).getPublicUrl(thumbnailParts.slice(1).join("/")).data.publicUrl;
    try{const parsedPoster=new URL(candidate);if(parsedPoster.protocol==="https:"&&parsedPoster.origin===parsedPublicUrl.origin)poster=parsedPoster.toString();}catch{}
   }
  }
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
 return <WatchDetailClient startAt={startAt} hlsSrc={hlsSrc} mediaId={data.media_id} title={media.title} description={data.description||media.alt_text||""} src={src} poster={poster} youtubeEmbedUrl={youtubeEmbedUrl} publishedAt={data.published_at!} allowComments={data.allow_comments} category={data.category} tags={data.tags??[]}/>;
}
