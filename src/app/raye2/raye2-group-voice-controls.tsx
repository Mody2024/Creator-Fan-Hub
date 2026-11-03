"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Room as LiveKitRoom } from "livekit-client";
import styles from "./raye2.module.css";

type GroupVoiceProps = {
  supabase: SupabaseClient;
  conversationId: string;
  groupName: string;
  locale: "en" | "ar";
};

export default function Raye2GroupVoiceControls({ supabase, conversationId, groupName, locale }: GroupVoiceProps) {
  const isAr = locale === "ar";
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const roomRef = useRef<LiveKitRoom | null>(null);
  const sessionRef = useRef<string | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  const copy = {
    join: isAr ? "دخول الغرفة الصوتية" : "Join voice room",
    leave: isAr ? "مغادرة الغرفة" : "Leave room",
    mute: isAr ? "كتم الميكروفون" : "Mute",
    unmute: isAr ? "إلغاء الكتم" : "Unmute",
    connecting: isAr ? "جارٍ الاتصال…" : "Connecting…",
    connected: isAr ? "الغرفة الصوتية متصلة" : "Voice room connected",
    unavailable: isAr ? "الغرفة الصوتية غير متاحة حاليًا." : "Group voice is not available right now.",
    failed: isAr ? "تعذر الاتصال بالغرفة الصوتية. حاول مرة أخرى." : "Could not connect to the voice room. Try again.",
    members: isAr ? "مشاركون" : "participants",
    speaking: isAr ? "يتحدث الآن" : "Speaking"
  };

  const leaveRoom = async () => {
    const room = roomRef.current;
    const sessionId = sessionRef.current;
    roomRef.current = null;
    sessionRef.current = null;
    setConnected(false);
    setParticipantCount(0);
    setActiveSpeakers([]);
    setMuted(false);
    if (room) await room.disconnect();
    if (sessionId) await supabase.rpc("raye2_leave_voice_session", { p_session_id: sessionId });
  };

  useEffect(() => () => {
    const room = roomRef.current;
    const sessionId = sessionRef.current;
    roomRef.current = null;
    sessionRef.current = null;
    if (room) void room.disconnect();
    if (sessionId) void supabase.rpc("raye2_leave_voice_session", { p_session_id: sessionId });
  }, [supabase]);

  const joinRoom = async () => {
    if (busy || connected) return;
    setBusy(true);
    setError("");
    let createdSessionId: string | null = null;
    try {
      const { data, error: startError } = await supabase.rpc("raye2_start_or_join_group_voice_room", {
        p_conversation_id: conversationId
      });
      if (startError || typeof data !== "string") throw startError ?? new Error("Voice room unavailable");
      createdSessionId = data;
      const { error: joinError } = await supabase.rpc("raye2_join_voice_session", { p_session_id: data });
      if (joinError) throw joinError;

      const response = await fetch("/api/raye2/voice/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: data })
      });
      const tokenData = await response.json() as { url?: string; token?: string; error?: string };
      if (!response.ok || !tokenData.url || !tokenData.token) throw new Error(tokenData.error || copy.failed);

      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
        if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
          const element = track.attach();
          element.autoplay = true;
          element.setAttribute("playsinline", "");
          audioContainerRef.current.appendChild(element);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        track.detach().forEach(element => element.remove());
      });
      room.on(RoomEvent.ParticipantConnected, () => setParticipantCount(room.numParticipants));
      room.on(RoomEvent.ParticipantDisconnected, () => setParticipantCount(room.numParticipants));
      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        setActiveSpeakers(speakers.map(speaker => speaker.identity));
      });
      room.on(RoomEvent.Disconnected, () => setConnected(false));

      await room.connect(tokenData.url, tokenData.token);
      sessionRef.current = data;
      setParticipantCount(room.numParticipants);
      await room.localParticipant.setMicrophoneEnabled(true);
      setConnected(true);
    } catch (caught) {
      if (createdSessionId) await supabase.rpc("raye2_leave_voice_session", { p_session_id: createdSessionId });
      setError(caught instanceof Error ? caught.message : copy.unavailable);
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
      sessionRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
    } catch {
      setError(copy.failed);
    }
  };

  return (
    <div className={styles.groupVoiceControls}>
      <div className={styles.groupVoiceAudio} ref={audioContainerRef}/>
      {!connected ? (
        <button type="button" className={styles.voiceStart} disabled={busy} onClick={() => void joinRoom()}>
          {busy ? copy.connecting : "◉ " + copy.join}
        </button>
      ) : (
        <>
          <span className={styles.groupVoiceStatus}><i/> {copy.connected} · {participantCount} {copy.members}</span>
          <button type="button" onClick={() => void toggleMute()}>{muted ? copy.unmute : copy.mute}</button>
          <button type="button" className={styles.voiceEnd} onClick={() => void leaveRoom()}>{copy.leave}</button>
          {activeSpeakers.length > 0 && <small>{copy.speaking}: {activeSpeakers.length}</small>}
        </>
      )}
      {error && <small className={styles.voiceError}>{error}</small>}
      <span className={styles.groupVoiceLabel}>{groupName}</span>
    </div>
  );
}
