import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommunityClient, { type CommunityPost } from "./community-client";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ feed?: string }> }) {
  const { feed } = await searchParams;
  const selectedFeed = feed === "following" ? "following" : "latest";
  const supabase = await createSupabaseServerClient();
  let posts: CommunityPost[] = [];
  if (supabase) {
    let followedIds: string[] | null = null;
    if (selectedFeed === "following") {
      const { data: claims } = await supabase.auth.getClaims();
      const userId = claims?.claims?.sub;
      if (typeof userId === "string") {
        const { data: follows } = await supabase.from("member_follows").select("followed_id").eq("follower_id", userId);
        followedIds = (follows ?? []).map(item => item.followed_id);
      } else followedIds = [];
    }
    let postQuery = supabase
      .from("community_posts")
      .select("id,author_id,post_type,body,linked_video_id,status,created_at")
      .eq("status", "published");
    if (followedIds !== null) postQuery = followedIds.length ? postQuery.in("author_id", followedIds) : postQuery.in("author_id", ["00000000-0000-0000-0000-000000000000"]);
    const { data } = await postQuery.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(40);
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
  return <CommunityClient initialPosts={posts} selectedFeed={selectedFeed} />;
}
