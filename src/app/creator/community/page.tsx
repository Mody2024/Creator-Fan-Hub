import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommunityModerationClient, { type QueueItem, type ReportItem } from "./moderation-client";

export const dynamic = "force-dynamic";

export default async function CommunityModerationPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/creator/login");
  const { data: admin } = await supabase.from("creator_admins").select("user_id,role").eq("user_id",userId).eq("active",true).maybeSingle();
  if (!admin || !["owner","admin","moderator"].includes(admin.role)) redirect("/creator?access=moderator-only");

  const [postsResult,commentsResult,videoCommentsResult,reportsResult] = await Promise.all([
    supabase.from("community_posts").select("id,author_id,body,status,created_at,post_type").eq("status","pending").order("created_at",{ascending:true}).limit(100),
    supabase.from("community_comments").select("id,post_id,author_id,body,status,created_at").eq("status","pending").order("created_at",{ascending:true}).limit(100),
    supabase.from("video_comments").select("id,media_id,author_id,body,status,created_at").eq("status","pending").order("created_at",{ascending:true}).limit(100),
    supabase.from("content_reports").select("id,reporter_id,target_type,target_id,reason,details,status,created_at").in("status",["open","reviewing"]).order("created_at",{ascending:true}).limit(100)
  ]);
  const authorIds=[...new Set([...(postsResult.data??[]).map(x=>x.author_id),...(commentsResult.data??[]).map(x=>x.author_id),...(videoCommentsResult.data??[]).map(x=>x.author_id)])];
  const {data:profiles}=authorIds.length?await supabase.from("member_profiles").select("user_id,handle,display_name").in("user_id",authorIds):{data:[]};
  const profileMap=new Map((profiles??[]).map(x=>[x.user_id,x]));
  const posts:QueueItem[]=(postsResult.data??[]).map(x=>({id:x.id,kind:"post",body:x.body,status:x.status,createdAt:x.created_at,author:profileMap.get(x.author_id)?.display_name??"Member",handle:profileMap.get(x.author_id)?.handle??"member",postType:x.post_type}));
  const comments:QueueItem[]=(commentsResult.data??[]).map(x=>({id:x.id,kind:"comment",body:x.body,status:x.status,createdAt:x.created_at,author:profileMap.get(x.author_id)?.display_name??"Member",handle:profileMap.get(x.author_id)?.handle??"member",postId:x.post_id}));
  const videoComments:QueueItem[]=(videoCommentsResult.data??[]).map(x=>({id:x.id,kind:"video_comment",body:x.body,status:x.status,createdAt:x.created_at,author:profileMap.get(x.author_id)?.display_name??"Member",handle:profileMap.get(x.author_id)?.handle??"member",postId:x.media_id}));
  const reports:ReportItem[]=(reportsResult.data??[]).map(x=>({id:x.id,targetType:x.target_type,targetId:x.target_id,reason:x.reason,details:x.details,status:x.status,createdAt:x.created_at}));
  return <main className="dashboard-shell">
    <header className="dashboard-topbar"><Link className="wordmark nhen-wordmark" href="/creator"><span className="nhen-wordmark-copy"><strong>Nhen?</strong><small lang="ar" dir="rtl">نهين؟</small></span></Link><span className="admin-session"><i/> COMMUNITY SAFETY</span><Link className="logout-button" href="/creator">Back to Studio ↗</Link></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">NHEN? / TRUST & SAFETY</span><h1>Community <em>review.</em></h1><p>Review member submissions, handle reports and keep official creator content distinct.</p></div><span className="draft-badge">● PRIVATE WORKSPACE</span></div>
      <CommunityModerationClient initialPosts={posts} initialComments={comments} initialVideoComments={videoComments} initialReports={reports}/>
    </div>
  </main>;
}
