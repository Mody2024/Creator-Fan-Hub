import { createSupabaseServerClient } from "@/lib/supabase/server";
import CommunityClient, { type CommunityPost } from "./community-client";

export const dynamic = "force-dynamic";

type SuggestedMember = { userId: string; handle: string; displayName: string };
type FeedRow = { id: string; author_id: string; post_type: string; body: string; linked_video_id: string | null; created_at: string; pinned: boolean; author_handle: string | null; author_display_name: string | null; author_avatar_url: string | null; reaction_count: number | string; comment_count: number | string; poll_id: string | null; poll_question: string | null; poll_options: Array<{ option: string; votes: number | string }> | null; poll_total: number | string | null; poll_closes_at: string | null; my_poll_vote: string | null };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ feed?: string; sort?: string }> }) {
  const { feed, sort } = await searchParams;
  const selectedFeed = feed === "following" ? "following" : "latest";
  const selectedSort = sort === "hot" ? "hot" : "latest";
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
    const followingOnly = selectedFeed === "following";
    if (followingOnly && typeof userId !== "string") {
      posts = [];
    } else {
      const { data } = await supabase.rpc("raye2_get_community_feed", { p_limit: 40, p_sort: selectedSort, p_following_only: followingOnly });
      const rows = (data ?? []) as FeedRow[];
      posts = rows.map(row => ({
        id: row.id,
        authorId: row.author_id,
        type: row.post_type,
        body: row.body,
        createdAt: row.created_at,
        linkedVideoId: row.linked_video_id,
        pinned: row.pinned,
        reactionCount: Number(row.reaction_count) || 0,
        commentCount: Number(row.comment_count) || 0,
        poll: row.poll_id ? { id: row.poll_id, question: row.poll_question ?? "", options: (row.poll_options ?? []).map(o => ({ option: o.option, votes: Number(o.votes) || 0 })), total: Number(row.poll_total) || 0, closesAt: row.poll_closes_at, myVote: row.my_poll_vote } : null,
        author: { handle: row.author_handle ?? "creator", display_name: row.author_display_name ?? "Community member", avatar_url: row.author_avatar_url ?? null }
      }));
    }
  }
  return <CommunityClient initialPosts={posts} selectedFeed={selectedFeed} selectedSort={selectedSort} unreadNotificationCount={unreadNotificationCount} suggestedMembers={suggestedMembers} canModerate={canModerate} />;
}
