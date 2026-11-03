"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "./raye2.module.css";

type VoiceSession = {
  id: string;
  conversation_id: string;
  created_by: string;
  session_type: "private_call" | "group_room";
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
  conversationId: string | null;
  peerUserId: string | null;
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
  const [activePeerName, setActivePeerName] = useState("");
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const inputDeviceIdRef = useRef("");
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const [quality, setQuality] = useState<"unknown" | "good" | "fair" | "poor">("unknown");
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
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (inputDeviceIdRef.current) audio.deviceId = { exact: inputDeviceIdRef.current };
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    localStreamRef.current = stream;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioInputs(devices.filter(device => device.kind === "audioinput"));
    setAudioOutputs(devices.filter(device => device.kind === "audiooutput"));
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
      setActivePeerName(call.callerName);
      setActivePeerId(call.created_by);
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
      if (!conversationId || !peerUserId) throw new Error("Select a direct conversation first");
      const { data, error: createError } = await supabase.rpc("raye2_create_voice_session", {
        p_conversation_id: conversationId,
        p_session_type: "private_call"
      });
      if (createError || !data) throw createError ?? new Error("Call could not be created");
      setSession({ id: data as string, conversation_id: conversationId, created_by: userId, session_type: "private_call", status: "ringing", expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() });
      setActivePeerName(peerName);
      setActivePeerId(peerUserId);
      setRole("host");
      setCallState("calling");
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, copy.unavailable, peerName, peerUserId, session, supabase, userId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) return;
    let active = true;
    const loadIncoming = async () => {
      const { data } = await supabase.from("raye2_voice_participants")
        .select("session_id,session:raye2_voice_sessions!inner(id,conversation_id,created_by,status,expires_at,session_type)")
        .eq("user_id", userId).eq("status", "invited");
      if (!active || !data) return;
      const match = (data as unknown as Array<{ session: VoiceSession | VoiceSession[] | null }>)
        .map(row => Array.isArray(row.session) ? row.session[0] : row.session)
        .find(item => item && item.session_type === "private_call" && item.status === "ringing" && new Date(item.expires_at).getTime() > Date.now());
      if (match) {
        const { data: caller } = await supabase.from("member_profiles").select("display_name,handle").eq("user_id", match.created_by).maybeSingle();
        if (!active) return;
        setIncoming({ ...match, callerName: caller?.display_name || (caller?.handle ? "@" + caller.handle : (isAr ? "عضو Raye2" : "Raye2 member")) });
      } else setIncoming(null);
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
  }, [cleanupMedia, closeChannel, isAr, supabase, userId]);

  useEffect(() => {
    if (!session || !role) return;
    let active = true;
    const channel = supabase.channel("raye2:voice:" + session.id, {
      config: { broadcast: { self: false }, presence: { key: userId } }
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "signal" }, async ({ payload }: { payload: SignalPayload }) => {
      if (!active || !payload || payload.from !== (role === "host" ? activePeerId : session.created_by)) return;
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
          setActivePeerName("");
          setActivePeerId(null);
          setCallState("idle");
          await closeChannel();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.failed);
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
  }, [activePeerId, cleanupMedia, closeChannel, copy.failed, createPeer, role, sendSignal, session, supabase, userId]);

  const changeInputDevice = async (deviceId: string) => {
    setInputDeviceId(deviceId);
    inputDeviceIdRef.current = deviceId;
    if (!peerRef.current || !localStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      if (deviceId) audio.deviceId = { exact: deviceId };
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      const nextTrack = nextStream.getAudioTracks()[0];
      const sender = peerRef.current.getSenders().find(item => item.track?.kind === "audio");
      if (!nextTrack || !sender) throw new Error("Audio input could not be changed");
      nextTrack.enabled = !muted;
      await sender.replaceTrack(nextTrack);
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = nextStream;
    } catch {
      setError(copy.failed);
    }
  };

  const changeOutputDevice = async (deviceId: string) => {
    setOutputDeviceId(deviceId);
    const audio = remoteAudio.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!audio?.setSinkId) return;
    try { await audio.setSinkId(deviceId); } catch { setError(copy.failed); }
  };

  useEffect(() => {
    const peer = peerRef.current;
    if (callState !== "connected" || !peer) return;
    let active = true;
    const inspect = async () => {
      try {
        const stats = await peer.getStats();
        let roundTrip = 0;
        let lost = 0;
        let received = 0;
        stats.forEach(report => {
          const row = report as RTCStats & { currentRoundTripTime?: number; packetsLost?: number; packetsReceived?: number; nominated?: boolean; state?: string; kind?: string; mediaType?: string };
          if (row.type === "candidate-pair" && row.state === "succeeded" && row.nominated && row.currentRoundTripTime !== undefined) roundTrip = row.currentRoundTripTime * 1000;
          if (row.type === "inbound-rtp" && (row.kind === "audio" || row.mediaType === "audio")) {
            lost += row.packetsLost ?? 0;
            received += row.packetsReceived ?? 0;
          }
        });
        const loss = lost + received > 0 ? lost / (lost + received) : 0;
        if (active) setQuality(roundTrip > 300 || loss > 0.05 ? "poor" : roundTrip > 150 || loss > 0.02 ? "fair" : "good");
      } catch { if (active) setQuality("unknown"); }
    };
    void inspect();
    const timer = window.setInterval(() => { void inspect(); }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [callState]);

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
      <div><b>{callState === "connected" ? (isAr ? "المكالمة متصلة" : "Call connected") : callState === "calling" ? (isAr ? "جارٍ الاتصال…" : "Calling…") : (isAr ? "جارٍ توصيل الصوت…" : "Connecting audio…")}</b><small>{activePeerName}{remoteAudioReady ? " · " + (isAr ? "الصوت يعمل" : "Audio ready") : ""} · {isAr ? "الجودة: " : "Quality: "}{quality === "good" ? (isAr ? "جيدة" : "Good") : quality === "fair" ? (isAr ? "متوسطة" : "Fair") : quality === "poor" ? (isAr ? "ضعيفة" : "Poor") : "—"}</small></div>
      {audioInputs.length > 1 && <select aria-label={isAr ? "الميكروفون" : "Microphone"} value={inputDeviceId} onChange={event => void changeInputDevice(event.target.value)}><option value="">{isAr ? "الميكروفون الافتراضي" : "Default mic"}</option>{audioInputs.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || (isAr ? "ميكروفون" : "Microphone")}</option>)}</select>}
      {audioOutputs.length > 1 && <select aria-label={isAr ? "مخرج الصوت" : "Audio output"} value={outputDeviceId} onChange={event => void changeOutputDevice(event.target.value)}><option value="">{isAr ? "مخرج الصوت الافتراضي" : "Default output"}</option>{audioOutputs.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || (isAr ? "مخرج صوت" : "Audio output")}</option>)}</select>}
      <button type="button" onClick={toggleMute} disabled={!localStreamRef.current}>{muted ? (isAr ? "إلغاء الكتم" : "Unmute") : (isAr ? "كتم" : "Mute")}</button>
      <button type="button" className={styles.voiceEnd} onClick={() => void finishCall(false)}>{isAr ? "إنهاء" : "End"}</button>
      {error && <small className={styles.voiceError}>{error}</small>}
    </div>
  );

  if (!conversationId || !peerUserId) return null;

  return (
    <div className={styles.voiceControls}>
      <button type="button" className={styles.voiceStart} onClick={() => void startCall()} disabled={busy || !peerUserId} title={isAr ? "لن يبدأ الميكروفون إلا بعد بدء الاتصال." : "Your microphone is only requested after you start the call."}>
        {busy ? "…" : "◉"} {isAr ? "اتصال صوتي" : "Voice call"}
      </button>
      {error && <small className={styles.voiceError}>{error}</small>}
    </div>
  );
}
