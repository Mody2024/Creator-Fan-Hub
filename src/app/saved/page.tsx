import {redirect} from "next/navigation";
import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import SavedPostsClient,{type SavedPost} from "./saved-client";

export const dynamic="force-dynamic";

export default async function SavedPostsPage(){
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/community#join");
 const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")redirect("/community#join");
 const {data:saves}=await supabase.from("community_bookmarks").select("post_id,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100);
 const ids=(saves??[]).map(x=>x.post_id);
 const {data:posts}=ids.length?await supabase.from("community_posts").select("id,author_id,body,created_at,post_type").in("id",ids).eq("status","published"):{data:[]};
 const authorIds=[...new Set((posts??[]).map(x=>x.author_id))];
 const {data:profiles}=authorIds.length?await supabase.from("member_profiles").select("user_id,handle,display_name").in("user_id",authorIds):{data:[]};
 const byId=new Map((profiles??[]).map(x=>[x.user_id,x]));
 const ordered=ids.map(id=>(posts??[]).find(x=>x.id===id)).filter(Boolean);
 const items:SavedPost[]=ordered.map(x=>({id:x!.id,body:x!.body,createdAt:x!.created_at,type:x!.post_type,author:byId.get(x!.author_id)?.display_name??"NHEN Member",handle:byId.get(x!.author_id)?.handle??"member"}));
 return <main className="nhen-profile-page"><header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/community">Community</Link><Link href="/#videos">Watch</Link></nav></header><div className="nhen-saved-wrap"><span className="nhen-section-label">YOUR NHEN LIBRARY</span><h1>Saved <em>conversations.</em></h1><p className="nhen-muted">A private collection of posts you want to return to.</p><SavedPostsClient initialPosts={items}/></div></main>
}
