import {notFound} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import WatchDetailClient from "./watch-detail-client";

export const dynamic="force-dynamic";

export default async function WatchVideoPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const supabase=await createSupabaseServerClient();if(!supabase)notFound();
 const {data,error}=await supabase.from("video_catalog").select("media_id,slug,description,category,tags,published_at,allow_comments,media_items!inner(id,title,storage_path,alt_text,is_published,media_type)").eq("slug",slug).not("published_at","is",null).maybeSingle();
 if(error||!data)notFound();
 const media=Array.isArray(data.media_items)?data.media_items[0]:data.media_items;
 if(!media?.is_published||media.media_type!=="video"||!media.storage_path?.startsWith("creator-media-public/"))notFound();
 const parts=media.storage_path.split("/");const url=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
 return <WatchDetailClient mediaId={data.media_id} title={media.title} description={data.description||media.alt_text||""} src={url} publishedAt={data.published_at!} allowComments={data.allow_comments} category={data.category} tags={data.tags??[]}/>;
}
