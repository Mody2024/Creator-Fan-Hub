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
 const items:ProfilePost[]=(posts??[]).map(p=>({id:p.id,body:p.body,createdAt:p.created_at,type:p.post_type}));
 return <MemberProfileClient profile={{userId:profile.user_id,handle:profile.handle,displayName:profile.display_name,bio:profile.bio,avatarUrl:profile.avatar_url,websiteUrl:profile.website_url,joinedAt:profile.created_at}} posts={items} followerCount={followers??0} followingCount={following??0}/>;
}
