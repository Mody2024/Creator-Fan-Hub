import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommunityClient, { type CommunityPost } from "./community-client";

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const supabase = await createSupabaseServerClient();
  let posts: CommunityPost[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("community_posts")
      .select("id,author_id,post_type,body,linked_video_id,status,created_at")
      .eq("status", "published")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);
    const rows = data ?? [];
    const ids = [...new Set(rows.map(row => row.author_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map(profile => [profile.user_id, profile]));
    posts = rows.map(row => ({
      id: row.id,
      authorId: row.author_id,
      type: row.post_type,
      body: row.body,
      createdAt: row.created_at,
      linkedVideoId: row.linked_video_id,
      author: byId.get(row.author_id) ?? { handle: "creator", display_name: "NHEN Creator", avatar_url: null }
    }));
  }
  return <CommunityClient initialPosts={posts} />;
}
