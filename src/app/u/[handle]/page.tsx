import {notFound} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import MemberProfileClient,{type ProfilePost} from "./profile-client";

export const dynamic="force-dynamic";

export default async function MemberProfilePage({params}:{params:Promise<{handle:string}>}){
 const {handle}=await params;const supabase=await createSupabaseServerClient();if(!supabase)notFound();
 const {data:profile,error}=await supabase.from("member_profiles").select("user_id,handle,display_name,bio,avatar_url,website_url,visibility,created_at").eq("handle",handle.toLowerCase()).maybeSingle();
 if(error||!profile)notFound();
 const {data:posts}=await supabase.from("community_posts").select("id,body,created_at,post_type").eq("author_id",profile.user_id).eq("status","published").order("created_at",{ascending:false}).limit(30);
 const {count:followers}=await supabase.from("member_follows").select("*",{count:"exact",head:true}).eq("followed_id",profile.user_id);
 const {count:following}=await supabase.from("member_follows").select("*",{count:"exact",head:true}).eq("follower_id",profile.user_id);
 const {data:earned}=await supabase.from("member_achievements").select("earned_at,achievement_catalog!inner(code,title,description,icon,position)").eq("user_id",profile.user_id).order("earned_at",{ascending:true});
 const achievements=(earned??[]).map(x=>({code:(Array.isArray(x.achievement_catalog)?x.achievement_catalog[0]:x.achievement_catalog)?.code??"",title:(Array.isArray(x.achievement_catalog)?x.achievement_catalog[0]:x.achievement_catalog)?.title??"",description:(Array.isArray(x.achievement_catalog)?x.achievement_catalog[0]:x.achievement_catalog)?.description??"",icon:(Array.isArray(x.achievement_catalog)?x.achievement_catalog[0]:x.achievement_catalog)?.icon??"✦"})).filter(x=>x.code);
 const items:ProfilePost[]=(posts??[]).map(p=>({id:p.id,body:p.body,createdAt:p.created_at,type:p.post_type}));
 const {data:shortRows}=await supabase.from("community_short_videos").select("id,title,caption,storage_path,duration_seconds,created_at").eq("author_id",profile.user_id).eq("status","published").order("created_at",{ascending:false}).limit(30);
 const communityShorts=(shortRows??[]).map(item=>({id:item.id,title:item.title,caption:item.caption,src:supabase.storage.from("nhen-community-shorts").getPublicUrl(item.storage_path).data.publicUrl,duration:item.duration_seconds}));
 const {data:mediaRows}=await supabase.from("media_items").select("id,title,storage_path,alt_text,video_catalog!inner(slug,description,published_at,category)").eq("owner_id",profile.user_id).eq("is_published",true).eq("media_type","video").not("video_catalog.published_at","is",null).order("created_at",{ascending:false}).limit(30);
 const videos=(mediaRows??[]).flatMap(item=>{
  if(!item.storage_path?.startsWith("creator-media-public/"))return[];
  const parts=item.storage_path.split("/");
  if(parts.length<2)return[];
  const catalog=Array.isArray(item.video_catalog)?item.video_catalog[0]:item.video_catalog;
  if(!catalog?.slug)return[];
  return[{id:item.id,title:item.title,slug:catalog.slug,description:catalog.description||item.alt_text||"",category:catalog.category||"Video",src:supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl}];
 });
 return <MemberProfileClient profile={{userId:profile.user_id,handle:profile.handle,displayName:profile.display_name,bio:profile.bio,avatarUrl:profile.avatar_url,websiteUrl:profile.website_url,joinedAt:profile.created_at,achievements}} posts={items} videos={videos} communityShorts={communityShorts} followerCount={followers??0} followingCount={following??0}/>;
}
