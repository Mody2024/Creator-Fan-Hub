import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import SavedPostsClient,{type SavedItem} from "./saved-client";

export const dynamic="force-dynamic";

export default async function SavedPostsPage(){
 const cookieStore=await cookies();const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";const isArabic=locale==="ar";
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/community#join");
 const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")redirect("/community#join");
 const [{data:postSaves},{data:videoSaves}]=await Promise.all([
  supabase.from("community_bookmarks").select("post_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100),
  supabase.from("video_bookmarks").select("media_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100)
 ]);
 const postIds=(postSaves??[]).map(x=>x.post_id);const videoIds=(videoSaves??[]).map(x=>x.media_id);
 const [{data:posts},{data:videos}]=await Promise.all([
  postIds.length?supabase.from("community_posts").select("id,author_id,body,created_at,post_type").in("id",postIds).eq("status","published"):Promise.resolve({data:[]}),
  videoIds.length?supabase.from("video_catalog").select("media_id,slug,media_items!inner(title,alt_text)").in("media_id",videoIds).not("published_at","is",null):Promise.resolve({data:[]})
 ]);
 const authorIds=[...new Set((posts??[]).map(x=>x.author_id))];
 const {data:authors}=authorIds.length?await supabase.from("member_profiles").select("user_id,handle,display_name").in("user_id",authorIds):{data:[]};
 const byId=new Map((authors??[]).map(x=>[x.user_id,x]));
 const postItems:SavedItem[]=(postSaves??[]).flatMap(save=>{const post=(posts??[]).find(x=>x.id===save.post_id);if(!post)return[];const author=byId.get(post.author_id);return[{id:post.id,kind:"post" as const,body:post.body,createdAt:save.created_at,type:post.post_type,author:author?.display_name??(isArabic?"عضو في NHEN":"NHEN Member"),handle:author?.handle??"member"}]});
 const videoItems:SavedItem[]=(videoSaves??[]).flatMap(save=>{const video=(videos??[]).find(x=>x.media_id===save.media_id);if(!video)return[];const media=Array.isArray(video.media_items)?video.media_items[0]:video.media_items;if(!media?.title)return[];return[{id:video.media_id,kind:"video" as const,slug:video.slug,title:media.title,body:media.alt_text??"",createdAt:save.created_at,type:"video",author:"NHEN",handle:"official"}]});
 const items=[...postItems,...videoItems].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
 return <main className="nhen-profile-page" dir={isArabic?"rtl":"ltr"} lang={locale}><header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/community">{isArabic?"المجتمع":"Community"}</Link><Link href="/#videos">{isArabic?"شاهد":"Watch"}</Link></nav></header><div className="nhen-saved-wrap"><span className="nhen-section-label">{isArabic?"مكتبتك في NHEN":"YOUR NHEN LIBRARY"}</span><h1>{isArabic?<>مكتبتك <em>المحفوظة.</em></>:<>Your <em>saved library.</em></>}</h1><p className="nhen-muted">{isArabic?"كل الفيديوهات والمنشورات التي حفظتها، في مكان واحد.":"Videos and community posts you have saved, all in one place."}</p><SavedPostsClient initialItems={items} locale={locale}/></div></main>
}
