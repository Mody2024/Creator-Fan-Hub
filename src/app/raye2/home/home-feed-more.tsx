"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import HomeFeedPost from "./home-feed-post";
import styles from "./home.module.css";

type FeedPost = { id: string; author_id: string; post_type: string; body: string; created_at: string };
type Author = { handle: string; display_name: string; avatar_url: string | null };
type Item = { post: FeedPost; count: number; mine: string | null; saved: boolean; following: boolean };

const PAGE = 20;

export default function HomeFeedMore({
  isArabic,
  currentUserId,
  following,
  before,
  beforeId
}: {
  isArabic: boolean;
  currentUserId: string | null;
  following: boolean;
  before: string;
  beforeId: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const t = isArabic
    ? { more: "تحميل المزيد", loading: "جارٍ التحميل…", end: "وصلت إلى النهاية.", error: "تعذر تحميل المزيد. حاول مرة أخرى.", retry: "إعادة المحاولة" }
    : { more: "Load more", loading: "Loading…", end: "You have reached the end.", error: "Could not load more. Try again.", retry: "Retry" };

  async function loadMore() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true); setError("");
    const last = items.length ? items[items.length - 1].post : null;
    const cursorTime = last ? last.created_at : before;
    const cursorId = last ? last.id : beforeId;
    const { data, error: err } = await supabase.rpc("raye2_get_community_feed_page", {
      p_limit: PAGE, p_following_only: following, p_before: cursorTime, p_before_id: cursorId
    });
    if (err) { setError(t.error); setBusy(false); return; }
    const rows = (data ?? []) as FeedPost[];
    if (rows.length < PAGE) setDone(true);
    if (!rows.length) { setBusy(false); return; }

    const postIds = rows.map((r) => r.id);
    const authorIds = [...new Set(rows.map((r) => r.author_id))];
    const [counts, own, bookmarks, follows, profiles] = await Promise.all([
      supabase.rpc("get_community_reaction_counts", { p_post_ids: postIds }),
      currentUserId ? supabase.from("community_reactions").select("post_id,reaction").eq("user_id", currentUserId).in("post_id", postIds) : Promise.resolve({ data: [] as { post_id: string; reaction: string }[] }),
      currentUserId ? supabase.from("community_bookmarks").select("post_id").eq("user_id", currentUserId).in("post_id", postIds) : Promise.resolve({ data: [] as { post_id: string }[] }),
      currentUserId ? supabase.from("member_follows").select("followed_id").eq("follower_id", currentUserId).in("followed_id", authorIds) : Promise.resolve({ data: [] as { followed_id: string }[] }),
      supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id", authorIds)
    ]);
    const countRows = (counts.data ?? []) as { post_id: string; reaction_count: number }[];
    const countMap = new Map(countRows.map((c) => [c.post_id, Number(c.reaction_count) || 0]));
    const mineRows = (own.data ?? []) as { post_id: string; reaction: string }[];
    const mineMap = new Map(mineRows.map((c) => [c.post_id, c.reaction]));
    const bookmarkRows = (bookmarks.data ?? []) as { post_id: string }[];
    const savedSet = new Set(bookmarkRows.map((c) => c.post_id));
    const followRows = (follows.data ?? []) as { followed_id: string }[];
    const followSet = new Set(followRows.map((c) => c.followed_id));
    setAuthors((prev) => {
      const next = { ...prev };
      for (const p of (profiles.data ?? []) as ({ user_id: string } & Author)[]) next[p.user_id] = { handle: p.handle, display_name: p.display_name, avatar_url: p.avatar_url };
      return next;
    });
    setItems((prev) => [...prev, ...rows.map((post) => ({
      post,
      count: countMap.get(post.id) ?? 0,
      mine: mineMap.get(post.id) ?? null,
      saved: savedSet.has(post.id),
      following: followSet.has(post.author_id)
    }))]);
    setBusy(false);
  }

  return (
    <div className={styles["home-feed-more"]}>
      {items.map((item) => (
        <HomeFeedPost
          key={item.post.id}
          post={item.post}
          author={authors[item.post.author_id]}
          isArabic={isArabic}
          currentUserId={currentUserId}
          initialCount={item.count}
          initialMine={item.mine}
          initialSaved={item.saved}
          initialFollowing={item.following}
        />
      ))}
      {error ? <p role="alert" className={styles["home-feed-more-error"]}>{error}</p> : null}
      {!done ? (
        <button type="button" className={styles["home-feed-more-button"]} disabled={busy} onClick={() => void loadMore()}>
          {busy ? t.loading : error ? t.retry : t.more}
        </button>
      ) : items.length ? <p className={styles["home-feed-more-end"]}>{t.end}</p> : null}
    </div>
  );
}
