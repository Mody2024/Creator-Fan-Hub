import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommunityClient, { type CommunityPost } from "./community-client";

export const dynamic = "force-dynamic";

type SuggestedMember = { userId: string; handle: string; displayName: string };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ feed?: string }> }) {
  const { feed } = await searchParams;
  const selectedFeed = feed === "following" ? "following" : "latest";
  const supabase = await createSupabaseServerClient();
  let posts: CommunityPost[] = [];
  let unreadNotificationCount = 0;
  let suggestedMembers: SuggestedMember[] = [];
  let canModerate = false;
  if (supabase) {
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    // Promote any scheduled posts whose publish time has arrived before reading the feed.
    await supabase.rpc("raye2_publish_due_community_posts");
    if (typeof userId === "string") {
      const { count } = await supabase.from("member_notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null);
      unreadNotificationCount = count ?? 0;
      const { data: staffRow } = await supabase.from("creator_admins").select("role").eq("user_id", userId).eq("active", true).in("role", ["owner", "admin", "moderator"]).maybeSingle();
      canModerate = !!staffRow;
      const [{ data: suggested }, { data: follows }, { data: blocks }] = await Promise.all([
        supabase.rpc("raye2_suggest_members", { p_limit: 5 }),
        supabase.from("member_follows").select("followed_id").eq("follower_id", userId),
        supabase.from("member_blocks").select("blocked_id").eq("blocker_id", userId)
      ]);
      if (Array.isArray(suggested) && suggested.length > 0) {
        suggestedMembers = suggested.map(row => ({ userId: row.user_id, handle: row.handle, displayName: row.display_name }));
      } else {
        const excluded = new Set([userId, ...(follows ?? []).map(x => x.followed_id), ...(blocks ?? []).map(x => x.blocked_id)]);
        const { data: candidates } = await supabase.from("member_profiles").select("user_id,handle,display_name").neq("user_id", userId).eq("visibility", "public").order("updated_at", { ascending: false }).limit(24);
        suggestedMembers = (candidates ?? []).filter(x => !excluded.has(x.user_id)).slice(0, 5).map(x => ({ userId: x.user_id, handle: x.handle, displayName: x.display_name }));
      }
    }
    let followedIds: string[] | null = null;
    if (selectedFeed === "following") {
      if (typeof userId === "string") {
        const { data: follows } = await supabase.from("member_follows").select("followed_id").eq("follower_id", userId);
        followedIds = (follows ?? []).map(item => item.followed_id);
      } else followedIds = [];
    }
    let postQuery = supabase
      .from("community_posts")
      .select("id,author_id,post_type,body,linked_video_id,status,created_at,pinned")
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
      pinned: row.pinned,
      author: byId.get(row.author_id) ?? { handle: "creator", display_name: "NHEN Creator", avatar_url: null }
    }));
  }
  return <CommunityClient initialPosts={posts} selectedFeed={selectedFeed} unreadNotificationCount={unreadNotificationCount} suggestedMembers={suggestedMembers} canModerate={canModerate} />;
}
