"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "./raye2.module.css";

type WatchVideo = {
  id: string;
  title: string;
  storage_path: string | null;
  source_url: string | null;
  provider: string;
  playback_kind: string;
};
type WatchSession = {
  id: string;
  conversation_id: string;
  group_id: string | null;
  title: string;
  visibility: "private" | "public";
  status: string;
  current_queue_item_id: string | null;
  current_position_seconds: number;
  is_playing: boolean;
  playback_updated_at: string;
  playback_version: number;
  max_participants: number;
};
type WatchQueueItem = {
  id: string;
  session_id: string;
  source_kind: "native" | "external";
  source_media_id: string | null;
  external_url: string | null;
  title: string;
  status: "queued" | "playing" | "played" | "skipped";
  sort_order: number;
  votes: number;
};
type WatchProps = {
  supabase: SupabaseClient;
  conversationId: string;
  groupId: string;
  groupName: string;
  groupVisibility: "public" | "private";
  locale: "en" | "ar";
};

export default function Raye2WatchTogetherControls({ supabase, conversationId, groupId, groupName, groupVisibility, locale }: WatchProps) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<WatchVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [sessions, setSessions] = useState<WatchSession[]>([]);
  const [session, setSession] = useState<WatchSession | null>(null);
  const [queue, setQueue] = useState<WatchQueueItem[]>([]);
  const [currentVideo, setCurrentVideo] = useState<WatchVideo | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsPlaybackTap, setNeedsPlaybackTap] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<string | null>(null);
  const syncingRef = useRef(false);
  const lastAppliedVersionRef = useRef<number>(-1);
  const lastAppliedSessionRef = useRef<string | null>(null);

  const copy = {
    title: isAr ? "شاهدوا معًا" : "Watch Together",
    create: isAr ? "إنشاء جلسة مشاهدة" : "Create watch session",
    join: isAr ? "انضم للمشاهدة" : "Join session",
    leave: isAr ? "مغادرة الجلسة" : "Leave session",
    video: isAr ? "اختر فيديو منشورًا" : "Choose a published video",
    noVideos: isAr ? "لا توجد فيديوهات منشورة متاحة للمشاهدة المتزامنة." : "No eligible published videos are available for synchronized viewing.",
    private: isAr ? "خاصة بالمجموعة" : "Private to group",
    public: isAr ? "عامة" : "Public",
    queue: isAr ? "قائمة المشاهدة" : "Watch queue",
    add: isAr ? "إضافة للقائمة" : "Add to queue",
    vote: isAr ? "تصويت" : "Vote",
    next: isAr ? "الفيديو التالي" : "Next video",
    host: isAr ? "المضيف" : "Host",
    sync: isAr ? "المزامنة نشطة" : "Sync is active",
    tap: isAr ? "اضغط لتشغيل الفيديو المتزامن" : "Tap to start synchronized playback",
    unsupported: isAr ? "المزامنة متاحة حاليًا لفيديوهات Raye2 المنشورة والمستضافة هنا فقط." : "Synchronized playback currently supports published Raye2-hosted videos only.",
    unavailable: isAr ? "تعذر تنفيذ العملية." : "Could not complete that action.",
    noSessions: isAr ? "لا توجد جلسات مشاهدة نشطة." : "No active watch sessions."
  };

  const selectedVideo = useMemo(() => videos.find(video => video.id === selectedVideoId) ?? null, [selectedVideoId, videos]);

  const publicVideoUrl = useCallback((video: WatchVideo) => {
    if (video.source_url && /^https:\/\//i.test(video.source_url)) return video.source_url;
    if (!video.storage_path || !video.storage_path.startsWith("creator-media-public/")) return "";
    const objectPath = video.storage_path.replace(/^creator-media-public\//, "");
    return supabase.storage.from("creator-media-public").getPublicUrl(objectPath).data.publicUrl;
  }, [supabase]);

  const loadVideos = useCallback(async () => {
    const { data: catalog } = await supabase.from("video_catalog")
      .select("media_id").not("published_at", "is", null).limit(50);
    const ids = (catalog ?? []).map(item => item.media_id);
    if (!ids.length) { setVideos([]); return; }
    const { data: media } = await supabase.from("media_items")
      .select("id,title,storage_path,source_url,provider,playback_kind,processing_status,is_published")
      .in("id", ids).eq("is_published", true).eq("processing_status", "ready");
    const eligible = (media ?? []).filter(item =>
      item.provider === "supabase" && item.playback_kind === "file"
      && typeof item.storage_path === "string" && item.storage_path.startsWith("creator-media-public/")
    ) as WatchVideo[];
    setVideos(eligible);
    if (!selectedVideoId && eligible[0]) setSelectedVideoId(eligible[0].id);
  }, [selectedVideoId, supabase]);

  const loadSessions = useCallback(async () => {
    const { data } = await supabase.from("raye2_watch_sessions")
      .select("*").eq("conversation_id", conversationId).eq("group_id", groupId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(10);
    setSessions((data ?? []) as WatchSession[]);
  }, [conversationId, groupId, supabase]);

  const loadSession = useCallback(async (sessionId: string) => {
    const [{ data: sessionRow }, { data: queueRows }, { data: voteRows }, { data: membership }] = await Promise.all([
      supabase.from("raye2_watch_sessions").select("*").eq("id", sessionId).maybeSingle(),
      supabase.from("raye2_watch_queue").select("*").eq("session_id", sessionId).order("sort_order", { ascending: true }),
      supabase.from("raye2_watch_votes").select("queue_item_id").eq("session_id", sessionId),
      supabase.from("raye2_watch_participants").select("role").eq("session_id", sessionId).eq("status", "joined").maybeSingle()
    ]);
    if (!sessionRow) return;
    const voteCounts: Record<string, number> = {};
    for (const vote of voteRows ?? []) voteCounts[vote.queue_item_id] = (voteCounts[vote.queue_item_id] ?? 0) + 1;
    const nextQueue = (queueRows ?? []).map(item => ({ ...item, votes: voteCounts[item.id] ?? 0 })) as WatchQueueItem[];
    setSession(sessionRow as WatchSession);
    setQueue(nextQueue);
    setIsHost(membership?.role === "host" || membership?.role === "moderator");
    const current = nextQueue.find(item => item.id === sessionRow.current_queue_item_id) ?? null;
    if (current?.source_kind === "native" && current.source_media_id) {
      const { data: media } = await supabase.from("media_items")
        .select("id,title,storage_path,source_url,provider,playback_kind,processing_status")
        .eq("id", current.source_media_id).eq("is_published", true).eq("processing_status", "ready").maybeSingle();
      if (media) setCurrentVideo(media as WatchVideo);
      else setCurrentVideo(null);
    } else setCurrentVideo(null);
    await loadSessions();
  }, [loadSessions, supabase]);

  const createSession = async () => {
    if (!selectedVideo) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await supabase.rpc("raye2_create_watch_session", {
        p_conversation_id: conversationId,
        p_title: selectedVideo.title,
        p_visibility: visibility,
        p_source_kind: "native",
        p_source_media_id: selectedVideo.id,
        p_external_url: null,
        p_max_participants: null
      });
      if (createError || typeof data !== "string") throw createError ?? new Error(copy.unavailable);
      sessionRef.current = data;
      await loadSession(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const joinSession = async (sessionId: string) => {
    setBusy(true);
    setError("");
    try {
      const { error: joinError } = await supabase.rpc("raye2_join_watch_session", { p_session_id: sessionId });
      if (joinError) throw joinError;
      sessionRef.current = sessionId;
      await loadSession(sessionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const leaveSession = async () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setQueue([]);
    setCurrentVideo(null);
    setIsHost(false);
    if (id) await supabase.rpc("raye2_leave_watch_session", { p_session_id: id });
    await loadSessions();
  };

  const updatePlayback = async (playing: boolean) => {
    const player = videoRef.current;
    const id = sessionRef.current;
    if (!isHost || !player || !id || syncingRef.current) return;
    const { error: updateError } = await supabase.rpc("raye2_update_watch_playback", {
      p_session_id: id,
      p_position_seconds: player.currentTime,
      p_is_playing: playing
    });
    if (updateError) setError(copy.unavailable);
  };

  const addToQueue = async () => {
    const id = sessionRef.current;
    if (!id || !selectedVideo) return;
    const { error: addError } = await supabase.rpc("raye2_add_watch_queue_item", {
      p_session_id: id,
      p_source_kind: "native",
      p_source_media_id: selectedVideo.id,
      p_external_url: null,
      p_title: selectedVideo.title
    });
    if (addError) setError(copy.unavailable);
    else await loadSession(id);
  };

  const voteForItem = async (itemId: string) => {
    const id = sessionRef.current;
    if (!id) return;
    const { error: voteError } = await supabase.rpc("raye2_vote_watch_queue_item", {
      p_session_id: id,
      p_queue_item_id: itemId
    });
    if (voteError) setError(copy.unavailable);
    else await loadSession(id);
  };

  const advanceQueue = async () => {
    const id = sessionRef.current;
    if (!id || !isHost) return;
    const { error: nextError } = await supabase.rpc("raye2_advance_watch_queue", { p_session_id: id });
    if (nextError) setError(copy.unavailable);
    else await loadSession(id);
  };

  useEffect(() => {
    if (!open) return;
    void loadVideos();
    void loadSessions();
  }, [loadSessions, loadVideos, open]);

  useEffect(() => {
    if (!session?.id) return;
    const id = session.id;
    const channel = supabase.channel("raye2:watch:" + id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "raye2_watch_sessions", filter: "id=eq." + id }, () => { void loadSession(id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_watch_queue", filter: "session_id=eq." + id }, () => { void loadSession(id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_watch_votes", filter: "session_id=eq." + id }, () => { void loadSession(id); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadSession, session?.id, supabase]);

  useEffect(() => {
    if (!session || !currentVideo || isHost || !videoRef.current) return;
    const player = videoRef.current;
    if (lastAppliedSessionRef.current !== session.id) {
      lastAppliedSessionRef.current = session.id;
      lastAppliedVersionRef.current = -1;
    }
    const version = Number(session.playback_version);
    if (lastAppliedVersionRef.current === version) return;
    lastAppliedVersionRef.current = version;
    const elapsed = session.is_playing ? Math.max(0, (Date.now() - new Date(session.playback_updated_at).getTime()) / 1000) : 0;
    const target = Number(session.current_position_seconds) + elapsed;
    syncingRef.current = true;
    if (Math.abs(player.currentTime - target) > 1.5) player.currentTime = target;
    if (session.is_playing) {
      void player.play().then(() => setNeedsPlaybackTap(false)).catch(() => setNeedsPlaybackTap(true));
    } else {
      player.pause();
    }
    window.setTimeout(() => { syncingRef.current = false; }, 250);
  }, [currentVideo, isHost, session]);

  useEffect(() => () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    if (id) void supabase.rpc("raye2_leave_watch_session", { p_session_id: id });
  }, [supabase]);

  const currentUrl = currentVideo ? publicVideoUrl(currentVideo) : "";
  const activeSessions = sessions.filter(item => item.status === "active");

  return (
    <div className={styles.watchTogether}>
      <button type="button" className={styles.watchToggle} onClick={() => setOpen(value => !value)}>
        ◉ {copy.title}
      </button>
      {open && (
        <section className={styles.watchPanel}>
          <div className={styles.watchPanelHead}>
            <b>{copy.title} · {groupName}</b>
            <button type="button" onClick={() => setOpen(false)}>{isAr ? "إغلاق" : "Close"}</button>
          </div>
          {!session && (
            <>
              <div className={styles.watchCreateRow}>
                <select aria-label={copy.video} value={selectedVideoId} onChange={event => setSelectedVideoId(event.target.value)}>
                  <option value="">{copy.video}</option>
                  {videos.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
                </select>
                {groupVisibility === "public" && <select aria-label={copy.public} value={visibility} onChange={event => setVisibility(event.target.value as "private" | "public")}><option value="private">{copy.private}</option><option value="public">{copy.public}</option></select>}
                <button type="button" disabled={busy || !selectedVideo} onClick={() => void createSession()}>{busy ? "…" : copy.create}</button>
              </div>
              {videos.length === 0 && <small>{copy.noVideos}</small>}
              <div className={styles.watchSessionList}>
                {activeSessions.length === 0 && <small>{copy.noSessions}</small>}
                {activeSessions.map(item => <button type="button" key={item.id} disabled={busy} onClick={() => void joinSession(item.id)}>{item.title} · {item.visibility} · {copy.join}</button>)}
              </div>
            </>
          )}
          {session && (
            <>
              <div className={styles.watchPlayerHeader}>
                <b>{session.title}</b>
                <span>{isHost ? copy.host : copy.sync}</span>
                <button type="button" onClick={() => void leaveSession()}>{copy.leave}</button>
              </div>
              {currentUrl ? (
                <video key={currentVideo?.id} ref={videoRef} className={styles.watchPlayer} src={currentUrl} controls={isHost} playsInline preload="metadata"
                  onPlay={() => void updatePlayback(true)}
                  onPause={() => void updatePlayback(false)}
                  onSeeked={() => void updatePlayback(!videoRef.current?.paused)}
                  onEnded={() => { if (isHost) void advanceQueue(); }}/>
              ) : <small>{copy.unsupported}</small>}
              {needsPlaybackTap && <button type="button" onClick={() => { if (videoRef.current) void videoRef.current.play().then(() => setNeedsPlaybackTap(false)); }}>{copy.tap}</button>}
              <div className={styles.watchQueueHead}><b>{copy.queue}</b>{isHost && <button type="button" onClick={() => void advanceQueue()}>{copy.next}</button>}</div>
              {queue.filter(item => item.status === "queued").map(item => <div className={styles.watchQueueItem} key={item.id}><span>{item.title} · {item.votes}</span><button type="button" onClick={() => void voteForItem(item.id)}>{copy.vote}</button></div>)}
              <div className={styles.watchCreateRow}>
                <select aria-label={copy.video} value={selectedVideoId} onChange={event => setSelectedVideoId(event.target.value)}>
                  <option value="">{copy.video}</option>
                  {videos.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
                </select>
                <button type="button" disabled={!selectedVideo} onClick={() => void addToQueue()}>{copy.add}</button>
              </div>
            </>
          )}
          {error && <small className={styles.watchError}>{error}</small>}
        </section>
      )}
    </div>
  );
}
