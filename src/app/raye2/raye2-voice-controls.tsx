"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "./raye2.module.css";

type VoiceSession = {
  id: string;
  conversation_id: string;
  created_by: string;
  status: "ringing" | "active" | "ended" | "declined" | "cancelled" | "expired";
  expires_at: string;
};
type IncomingCall = VoiceSession & { callerName: string };
type SignalPayload = {
  from: string;
  kind: "offer" | "answer" | "ice" | "ready" | "end";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type VoiceProps = {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  peerUserId: string;
  peerName: string;
  locale: "en" | "ar";
};

const ICE_SERVERS: RTCIceServer[] = (() => {
  const fallback: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const raw = process.env.NEXT_PUBLIC_RAYE2_ICE_SERVERS;
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const valid = parsed.filter((item): item is RTCIceServer => {
      if (!item || typeof item !== "object" || !("urls" in item)) return false;
      const urls = (item as { urls?: unknown }).urls;
      return typeof urls === "string" || (Array.isArray(urls) && urls.every(url => typeof url === "string"));
    });
    return valid.length ? valid : fallback;
  } catch {
    return fallback;
  }
})();

export default function Raye2VoiceControls({ supabase, userId, conversationId, peerUserId, peerName, locale }: VoiceProps) {
  const isAr = locale === "ar";
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [callState, setCallState] = useState<"idle" | "calling" | "connecting" | "connected" | "ending">("idle");
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const offerStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const copy = {
    call: isAr ? "اتصال صوتي" : "Voice call",
    incoming: isAr ? "مكالمة واردة" : "Incoming voice call",
    answer: isAr ? "رد" : "Answer",
    decline: isAr ? "رفض" : "Decline",
    end: isAr ? "إنهاء" : "End call",
    mute: isAr ? "كتم الميكروفون" : "Mute microphone",
    unmute: isAr ? "إلغاء الكتم" : "Unmute microphone",
    calling: isAr ? "جارٍ الاتصال…" : "Calling…",
    connecting: isAr ? "جارٍ توصيل الصوت…" : "Connecting audio…",
    connected: isAr ? "المكالمة متصلة" : "Call connected",
    permission: isAr ? "يلزم السماح باستخدام الميكروفون لبدء المكالمة." : "Microphone permission is required to start a call.",
    unavailable: isAr ? "المكالمة الصوتية غير متاحة حاليًا." : "Voice calling is not available right now.",
    failed: isAr ? "تعذر إنشاء اتصال صوتي. تحقق من الشبكة وحاول مرة أخرى." : "The audio connection failed. Check your network and try again.",
    secure: isAr ? "لا يبدأ الميكروفون إلا بعد قبول المكالمة." : "Your microphone is only requested after you accept or start a call."
  };

  const cleanupMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current = null;
    if (remoteAudio.current) remoteAudio.current.srcObject = null;
    pendingIceRef.current = [];
    offerStartedRef.current = false;
    setRemoteAudioReady(false);
    setMuted(false);
  }, []);

  const closeChannel = useCallback(async () => {
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) await supabase.removeChannel(channel);
  }, [supabase]);

  const sendSignal = useCallback(async (payload: Omit<SignalPayload, "from">) => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Voice signaling channel is not ready");
    const result = await channel.send({ type: "broadcast", event: "signal", payload: { ...payload, from: userId } });
    if (result !== "ok") throw new Error("Voice signaling message was not delivered");
  }, [userId]);

  const getMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(copy.permission);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    localStreamRef.current = stream;
    return stream;
  }, [copy.permission]);

  const createPeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current;
    const stream = await getMicrophone();
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;
    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
    peer.ontrack = event => {
      const [streamFromPeer] = event.streams;
      if (streamFromPeer) {
        remoteStreamRef.current = streamFromPeer;
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = streamFromPeer;
          void remoteAudio.current.play().then(() => setRemoteAudioReady(true)).catch(() => setError(copy.failed));
        }
      }
    };
    peer.onicecandidate = event => {
      if (event.candidate) {
        void sendSignal({ kind: "ice", candidate: event.candidate.toJSON() }).catch(() => setError(copy.failed));
      }
    };
    peer.onconnectionstatechange = () => {
      if (!mountedRef.current) return;
      if (peer.connectionState === "connected") setCallState("connected");
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setCallState("connecting");
        setError(copy.failed);
      }
      if (peer.connectionState === "closed") setCallState("idle");
    };
    return peer;
  }, [copy.failed, getMicrophone, sendSignal]);

  const finishCall = useCallback(async (decline = false) => {
    if (!session) return;
    setCallState("ending");
    try {
      if (!decline) await sendSignal({ kind: "end" }).catch(() => undefined);
      const rpc = decline ? "raye2_decline_voice_invitation" : "raye2_leave_voice_session";
      await supabase.rpc(rpc, { p_session_id: session.id });
    } catch {
      setError(copy.unavailable);
    }
    await closeChannel();
    cleanupMedia();
    setSession(null);
    setRole(null);
    setCallState("idle");
  }, [cleanupMedia, closeChannel, copy.unavailable, sendSignal, session, supabase]);

  const acceptCall = useCallback(async (call: IncomingCall) => {
    setBusy(true);
    setError("");
    try {
      const { error: joinError } = await supabase.rpc("raye2_join_voice_session", { p_session_id: call.id });
      if (joinError) throw joinError;
      setIncoming(null);
      setSession(call);
      setRole("guest");
      setCallState("connecting");
    } catch {
      setError(copy.unavailable);
      setIncoming(null);
    } finally {
      setBusy(false);
    }
  }, [copy.unavailable, supabase]);

  const startCall = useCallback(async () => {
    if (busy || session) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await supabase.rpc("raye2_create_voice_session", {
        p_conversation_id: conversationId,
        p_session_type: "private_call"
      });
      if (createError || !data) throw createError ?? new Error("Call could not be created");
      setSession({ id: data as string, conversation_id: conversationId, created_by: userId, status: "ringing", expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() });
      setRole("host");
      setCallState("calling");
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, copy.unavailable, session, supabase, userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return;
    let active = true;
    const loadIncoming = async () => {
      const { data } = await supabase.from("raye2_voice_participants")
        .select("session_id,session:raye2_voice_sessions!inner(id,conversation_id,created_by,status,expires_at)")
        .eq("user_id", userId).eq("status", "invited");
      if (!active || !data) return;
      const match = (data as unknown as Array<{ session: VoiceSession | VoiceSession[] | null }>)
        .map(row => Array.isArray(row.session) ? row.session[0] : row.session)
        .find(item => item && item.conversation_id === conversationId && item.status === "ringing" && new Date(item.expires_at).getTime() > Date.now());
      if (match) setIncoming({ ...match, callerName: peerName });
    };
    void loadIncoming();
    const channel = supabase.channel("raye2:voice-invites:" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_voice_participants", filter: "user_id=eq." + userId }, () => { void loadIncoming(); })
      .subscribe();
    return () => {
      active = false;
      mountedRef.current = false;
      void supabase.removeChannel(channel);
      void closeChannel();
      cleanupMedia();
    };
  }, [cleanupMedia, closeChannel, conversationId, peerName, supabase, userId]);

  useEffect(() => {
    if (!session || !role) return;
    let active = true;
    const channel = supabase.channel("raye2:voice:" + session.id, {
      config: { broadcast: { self: false }, presence: { key: userId } }
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, async ({ payload }: { payload: SignalPayload }) => {
      if (!active || !payload || payload.from !== (role === "host" ? peerUserId : session.created_by)) return;
      try {
        if (payload.kind === "ready" && role === "host" && !offerStartedRef.current) {
          offerStartedRef.current = true;
          const peer = await createPeer();
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal({ kind: "offer", description: offer });
        } else if (payload.kind === "offer" && role === "guest" && payload.description) {
          const peer = await createPeer();
          await peer.setRemoteDescription(payload.description);
          for (const candidate of pendingIceRef.current.splice(0)) await peer.addIceCandidate(candidate);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await sendSignal({ kind: "answer", description: answer });
        } else if (payload.kind === "answer" && role === "host" && payload.description && peerRef.current) {
          await peerRef.current.setRemoteDescription(payload.description);
          for (const candidate of pendingIceRef.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
        } else if (payload.kind === "ice" && payload.candidate) {
          if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(payload.candidate);
          else pendingIceRef.current.push(payload.candidate);
        } else if (payload.kind === "end") {
          await supabase.rpc("raye2_leave_voice_session", { p_session_id: session.id });
          cleanupMedia();
          setSession(null);
          setRole(null);
          setCallState("idle");
          await closeChannel();
        }
      } catch {
        setError(copy.failed);
      }
    });

    channel.subscribe(async (status: string) => {
      if (!active || status !== "SUBSCRIBED") return;
      try {
        await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
        setCallState(role === "host" ? "calling" : "connecting");
        if (role === "guest") await sendSignal({ kind: "ready" });
      } catch {
        setError(copy.failed);
      }
    });

    return () => {
      active = false;
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [cleanupMedia, closeChannel, copy.failed, createPeer, peerUserId, role, sendSignal, session, supabase, userId]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  };

  if (incoming && !session) return (
    <div className={styles.voiceIncoming} role="status">
      <span className={styles.voicePulse}>◉</span>
      <div><b>{isAr ? "مكالمة واردة" : "Incoming voice call"}</b><small>{incoming.callerName}</small></div>
      <button type="button" disabled={busy} onClick={() => void acceptCall(incoming)}>{isAr ? "رد" : "Answer"}</button>
      <button type="button" disabled={busy} onClick={() => { void supabase.rpc("raye2_decline_voice_invitation", { p_session_id: incoming.id }); setIncoming(null); }}>{isAr ? "رفض" : "Decline"}</button>
    </div>
  );

  if (session) return (
    <div className={styles.voiceActive} role="status">
      <audio ref={remoteAudio} autoPlay playsInline />
      <span className={styles.voicePulse}>◉</span>
      <div><b>{callState === "connected" ? (isAr ? "المكالمة متصلة" : "Call connected") : callState === "calling" ? (isAr ? "جارٍ الاتصال…" : "Calling…") : (isAr ? "جارٍ توصيل الصوت…" : "Connecting audio…")}</b><small>{peerName}{remoteAudioReady ? " · " + (isAr ? "الصوت يعمل" : "Audio ready") : ""}</small></div>
      <button type="button" onClick={toggleMute} disabled={!localStreamRef.current}>{muted ? (isAr ? "إلغاء الكتم" : "Unmute") : (isAr ? "كتم" : "Mute")}</button>
      <button type="button" className={styles.voiceEnd} onClick={() => void finishCall(false)}>{isAr ? "إنهاء" : "End"}</button>
      {error && <small className={styles.voiceError}>{error}</small>}
    </div>
  );

  return (
    <div className={styles.voiceControls}>
      <button type="button" className={styles.voiceStart} onClick={() => void startCall()} disabled={busy || !peerUserId} title={isAr ? "لن يبدأ الميكروفون إلا بعد بدء الاتصال." : "Your microphone is only requested after you start the call."}>
        {busy ? "…" : "◉"} {isAr ? "اتصال صوتي" : "Voice call"}
      </button>
      {error && <small className={styles.voiceError}>{error}</small>}
    </div>
  );
}
