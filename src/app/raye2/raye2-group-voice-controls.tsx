"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Room as LiveKitRoom } from "livekit-client";
import styles from "./raye2.module.css";

type VoiceParticipant = { identity: string; name: string; isSelf: boolean };

type GroupVoiceProps = {
  supabase: SupabaseClient;
  conversationId: string;
  groupId: string;
  userId: string;
  groupName: string;
  locale: "en" | "ar";
};

export default function Raye2GroupVoiceControls({ supabase, conversationId, groupId, userId, groupName, locale }: GroupVoiceProps) {
  const isAr = locale === "ar";
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isVoiceHost, setIsVoiceHost] = useState(false);
  const [recordingState, setRecordingState] = useState<"off" | "consent_pending" | "consent_granted" | "stopped">("off");
  const [myConsent, setMyConsent] = useState<"not_requested" | "pending" | "accepted" | "declined" | "withdrawn">("not_requested");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioPrefsBusy, setAudioPrefsBusy] = useState(false);
  const [transmittingState, setTransmittingState] = useState(false);
  const [quality, setQuality] = useState<"unknown" | "good" | "fair" | "poor">("unknown");
  const [reconnecting, setReconnecting] = useState(false);
  const [canShareScreen, setCanShareScreen] = useState(false);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareError, setScreenShareError] = useState("");
  const [error, setError] = useState("");
  const roomRef = useRef<LiveKitRoom | null>(null);
  const sessionRef = useRef<string | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const screenShareContainerRef = useRef<HTMLDivElement | null>(null);

  const copy = {
    join: isAr ? "دخول الغرفة الصوتية" : "Join voice room",
    leave: isAr ? "مغادرة الغرفة" : "Leave room",
    mute: isAr ? "كتم الميكروفون" : "Mute",
    unmute: isAr ? "إلغاء الكتم" : "Unmute",
    connecting: isAr ? "جارٍ الاتصال…" : "Connecting…",
    connected: isAr ? "الغرفة الصوتية متصلة" : "Voice room connected",
    unavailable: isAr ? "الغرفة الصوتية غير متاحة حاليًا." : "Group voice is not available right now.",
    disconnected: isAr ? "انقطع الاتصال بالغرفة الصوتية. يمكنك الانضمام مجددًا." : "The voice room disconnected. You can rejoin.",
    failed: isAr ? "تعذر الاتصال بالغرفة الصوتية. حاول مرة أخرى." : "Could not connect to the voice room. Try again.",
    members: isAr ? "مشاركون" : "participants",
    speaking: isAr ? "يتحدث الآن" : "Speaking",
    raiseHand: isAr ? "رفع اليد" : "Raise hand",
    lowerHand: isAr ? "خفض اليد" : "Lower hand",
    muteAll: isAr ? "كتم الجميع" : "Mute all",
    clearHands: isAr ? "خفض كل الأيدي" : "Clear hands",
    pushToTalk: isAr ? "اضغط للتحدث" : "Push to talk",
    noiseSuppression: isAr ? "إخماد الضوضاء" : "Noise suppression",
    pttHint: isAr ? "اضغط مطولًا على مسافة (أو زر التحدث) للتحدث." : "Hold Space (or the Talk button) to speak.",
    holdToTalk: isAr ? "اضغط للتحدث الآن" : "Hold to talk",
    quality: isAr ? "الجودة" : "Quality",
    qualityGood: isAr ? "جيدة" : "Good",
    qualityFair: isAr ? "متوسطة" : "Fair",
    qualityPoor: isAr ? "ضعيفة" : "Poor",
    reconnecting: isAr ? "جارٍ إعادة الاتصال…" : "Reconnecting…",
    screenShare: isAr ? "مشاركة الشاشة" : "Share screen",
    stopScreenShare: isAr ? "إيقاف مشاركة الشاشة" : "Stop sharing",
    screenUnavailable: isAr ? "مشاركة الشاشة غير مدعومة في هذا المتصفح. جرّب متصفح سطح المكتب." : "Screen sharing is not supported by this browser. Try a desktop browser.",
    screenFailed: isAr ? "تعذرت مشاركة الشاشة. تحقق من أذونات المتصفح وحاول مرة أخرى." : "Could not share your screen. Check browser permissions and try again.",
    screenShareLabel: isAr ? "الشاشة المشتركة مباشرة" : "Live shared screens",
    screenShareStream: isAr ? "محتوى شاشة مشارك في الغرفة" : "A participant’s shared screen",
    screenSharePrivacy: isAr ? "تُعرض الشاشة مباشرة ولا يحفظ Raye2 هذا البث." : "Screen sharing is live only; Raye2 does not save the stream."
  };

  const leaveRoom = async () => {
    const room = roomRef.current;
    const sessionId = sessionRef.current;
    roomRef.current = null;
    sessionRef.current = null;
    setConnected(false);
    setParticipantCount(0);
    setActiveSpeakers([]);
    setParticipants([]);
    setCanModerate(false);
    setLocked(false);
    setMuted(false);
    setIsVoiceHost(false);
    setCanShareScreen(false);
    setScreenShareActive(false);
    setScreenShareError("");
    setRecordingState("off");
    setMyConsent("not_requested");
    setRecordingElapsed(0);
    if (room) {
      try { await room.disconnect(); }
      catch { setError(copy.failed); }
    }
    if (sessionId) {
      const { error: leaveError } = await supabase.rpc("raye2_leave_voice_session", { p_session_id: sessionId });
      if (leaveError) setError(copy.failed);
    }
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
      const { error: joinError } = await supabase.rpc("raye2_join_voice_session_guarded", { p_session_id: data });
      if (joinError) throw joinError;
      const [{ data: ownVoiceMembership }, { data: groupMembership }, { data: sessionInfo }] = await Promise.all([
        supabase.from("raye2_voice_participants").select("role").eq("session_id", data).eq("user_id", userId).maybeSingle(),
        supabase.from("raye2_group_members").select("role").eq("group_id", groupId).eq("user_id", userId).eq("status", "active").maybeSingle(),
        supabase.from("raye2_voice_sessions").select("is_locked").eq("id", data).maybeSingle()
      ]);
      setIsVoiceHost(["host","cohost"].includes(ownVoiceMembership?.role ?? ""));
      setCanShareScreen(!!ownVoiceMembership && ownVoiceMembership.role !== "listener");
      setCanModerate(["host","cohost","moderator"].includes(ownVoiceMembership?.role ?? "") || ["owner","admin","moderator"].includes(groupMembership?.role ?? ""));
      setLocked(Boolean(sessionInfo?.is_locked));

      const response = await fetch("/api/raye2/voice/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: data })
      });
      const tokenData = await response.json() as { url?: string; token?: string; error?: string };
      if (!response.ok || !tokenData.url || !tokenData.token) throw new Error(tokenData.error || copy.failed);

      const { Room, RoomEvent, Track } = await import("livekit-client");
      setQuality("unknown");
      setReconnecting(false);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video && screenShareContainerRef.current) {
          const element = track.attach();
          element.classList.add(styles.groupVoiceScreenVideo);
          element.setAttribute("aria-label", `${participant.name || participant.identity} — ${copy.screenShareStream}`);
          element.setAttribute("playsinline", "");
          if (element instanceof HTMLVideoElement) { element.autoplay = true; element.muted = true; }
          screenShareContainerRef.current.appendChild(element);
          return;
        }
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
      room.on(RoomEvent.LocalTrackUnpublished, publication => {
        if (publication.source === Track.Source.ScreenShare) setScreenShareActive(false);
      });
      const refreshParticipants = () => {
        const remote = Array.from(room.remoteParticipants.values()).map(participant => ({ identity: participant.identity, name: participant.name || participant.identity.slice(0, 8), isSelf: false }));
        const local = { identity: room.localParticipant.identity, name: room.localParticipant.name || (isAr ? "أنت" : "You"), isSelf: true };
        setParticipants([local, ...remote]);
        setParticipantCount(room.numParticipants);
      };
      room.on(RoomEvent.ParticipantConnected, refreshParticipants);
      room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        setActiveSpeakers(speakers.map(speaker => speaker.identity));
        refreshParticipants();
      });
      room.on(RoomEvent.ConnectionQualityChanged, (qualityLevel, participant) => {
        if (participant.identity !== room.localParticipant.identity) return;
        setQuality(qualityLevel === "excellent" || qualityLevel === "good" ? "good" : qualityLevel === "poor" ? "poor" : "fair");
      });
      room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
      room.on(RoomEvent.Reconnected, () => setReconnecting(false));
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setReconnecting(false);
        setParticipantCount(0);
        setParticipants([]);
        setActiveSpeakers([]);
        setCanModerate(false);
        setLocked(false);
        setMuted(false);
        setIsVoiceHost(false);
        setCanShareScreen(false);
        setScreenShareActive(false);
        setRecordingState("off");
        setMyConsent("not_requested");
        setRecordingElapsed(0);
        if (roomRef.current === room) roomRef.current = null;
        // Manual leave clears this ref before disconnecting. A remaining ID
        // therefore means the transport ended unexpectedly and needs cleanup.
        if (sessionRef.current === data) {
          sessionRef.current = null;
          setError(copy.disconnected);
          void supabase.rpc("raye2_leave_voice_session", { p_session_id: data });
        }
      });

      await room.connect(tokenData.url, tokenData.token);
      sessionRef.current = data;
      refreshParticipants();
      await room.localParticipant.setMicrophoneEnabled(true);
      setConnected(true);
    } catch (caught) {
      if (createdSessionId) await supabase.rpc("raye2_leave_voice_session", { p_session_id: createdSessionId });
      setCanShareScreen(false);
      setScreenShareActive(false);
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

  const toggleScreenShare = async () => {
    const room = roomRef.current;
    if (!room || !connected || !canShareScreen) return;
    setScreenShareError("");
    if (!screenShareActive) {
      if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
        setScreenShareError(copy.screenUnavailable);
        return;
      }
      try {
        // User-initiated, live-only capture. System audio is deliberately not captured.
        await room.localParticipant.setScreenShareEnabled(true, { audio: false });
        setScreenShareActive(true);
      } catch {
        setScreenShareActive(false);
        setScreenShareError(copy.screenFailed);
      }
      return;
    }
    try {
      await room.localParticipant.setScreenShareEnabled(false);
      setScreenShareActive(false);
    } catch {
      setScreenShareError(copy.screenFailed);
    }
  };

  const toggleRoomLock = async () => {
    const sessionId = sessionRef.current;
    if (!sessionId || !canModerate) return;
    const next = !locked;
    const { error: lockError } = await supabase.rpc("raye2_moderate_voice_session", {
      p_session_id: sessionId,
      p_action: next ? "lock" : "unlock",
      p_target_user_id: null
    });
    if (lockError) setError(copy.failed);
    else setLocked(next);
  };

  const removeParticipant = async (targetUserId: string) => {
    const sessionId = sessionRef.current;
    if (!sessionId || !canModerate || targetUserId === userId) return;
    try {
      const response = await fetch("/api/raye2/voice/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, targetUserId })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || copy.failed);
      setParticipants(current => current.filter(participant => participant.identity !== targetUserId));
      setParticipantCount(count => Math.max(1, count - 1));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.failed);
    }
  };

  useEffect(() => {
    if (!connected) return;
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    let active = true;
    const sync = async () => {
      const { data: row } = await supabase.from("raye2_voice_sessions").select("recording_state").eq("id", sessionId).maybeSingle();
      const { data: me } = await supabase.from("raye2_voice_participants").select("recording_consent").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
      if (!active) return;
      if (row?.recording_state) setRecordingState(row.recording_state as typeof recordingState);
      if (me?.recording_consent) setMyConsent(me.recording_consent as typeof myConsent);
    };
    void sync();
    const channel = supabase.channel("raye2:group-voice-recording:" + sessionId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "raye2_voice_sessions", filter: "id=eq." + sessionId }, () => { void sync(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "raye2_voice_participants", filter: "session_id=eq." + sessionId }, () => { void sync(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [connected, supabase, userId]);

  useEffect(() => {
    if (recordingState !== "consent_granted") { setRecordingElapsed(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setRecordingElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    void supabase.from("raye2_voice_preferences").select("push_to_talk,noise_suppression").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setPushToTalk(Boolean(data.push_to_talk));
        setNoiseSuppression(data.noise_suppression !== false);
      });
    return () => { active = false; };
  }, [connected, supabase, userId]);

  const requestRecordingConsent = async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setRecordingBusy(true);
    const { error: rpcError } = await supabase.rpc("raye2_request_voice_recording_consent", { p_session_id: sessionId });
    setRecordingBusy(false);
    if (rpcError) setError(rpcError.message);
    else { setRecordingState("consent_pending"); setMyConsent("pending"); }
  };

  const respondRecordingConsent = async (decision: "accepted" | "declined" | "withdrawn") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setRecordingBusy(true);
    const { data, error: rpcError } = await supabase.rpc("raye2_respond_voice_recording_consent", { p_session_id: sessionId, p_decision: decision });
    setRecordingBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setMyConsent(decision);
    if (typeof data === "string") setRecordingState(data as typeof recordingState);
  };

  const recordingClock = `${String(Math.floor(recordingElapsed / 60)).padStart(2, "0")}:${String(recordingElapsed % 60).padStart(2, "0")}`;

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    try {
      // Push-to-talk must remain closed between deliberate transmit actions.
      // Unmuting the room microphone must not silently bypass that preference.
      await room.localParticipant.setMicrophoneEnabled(pushToTalk ? false : !next);
      if (pushToTalk) setTransmittingState(false);
      setMuted(next);
      const sessionId = sessionRef.current;
      if (sessionId) void supabase.rpc("raye2_set_voice_mute", { p_session_id: sessionId, p_muted: next });
    } catch {
      setError(copy.failed);
    }
  };

  const toggleHand = async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    const next = !handRaised;
    const { error: rpcError } = await supabase.rpc("raye2_set_voice_hand", { p_session_id: sessionId, p_raised: next });
    if (rpcError) setError(copy.failed);
    else setHandRaised(next);
  };

  const bulkModerate = async (action: "mute_all" | "clear_hands") => {
    const sessionId = sessionRef.current;
    if (!sessionId || !canModerate) return;
    const { error: rpcError } = await supabase.rpc("raye2_voice_bulk_moderation", { p_session_id: sessionId, p_action: action });
    if (rpcError) setError(copy.failed);
  };

  const saveAudioPreferences = async (nextPushToTalk: boolean, nextNoise: boolean) => {
    setAudioPrefsBusy(true);
    const { error: rpcError } = await supabase.rpc("raye2_set_voice_audio_preferences", { p_push_to_talk: nextPushToTalk, p_noise_suppression: nextNoise });
    setAudioPrefsBusy(false);
    if (rpcError) { setError(copy.failed); return; }
    setPushToTalk(nextPushToTalk);
    setNoiseSuppression(nextNoise);
    if (!nextPushToTalk) {
      setTransmittingState(false);
      if (!muted) await roomRef.current?.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
    }
    await applyNoiseSuppression(nextNoise);
  };

  // Toggling noise suppression only matters if it actually reaches the microphone, so the
  // mic is re-published with the new capture options when a track already exists.
  const applyNoiseSuppression = async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    const published = room.localParticipant.getTrackPublications().some(item => (item.source as string) === "microphone" && item.track);
    if (!published) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!muted, { noiseSuppression: enabled, echoCancellation: true, autoGainControl: true });
    } catch {
      // The stored preference still applies on the next join if the live re-publish is rejected.
    }
  };

  const setTransmitting = async (transmitting: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      // A muted participant cannot transmit, even if Space or the hold button is pressed.
      const shouldTransmit = transmitting && !muted;
      await room.localParticipant.setMicrophoneEnabled(shouldTransmit);
      setTransmittingState(shouldTransmit);
    } catch {
      setError(copy.failed);
    }
  };
  // Keep the latest handler in a ref so the push-to-talk listener effect does not
  // need to re-register on every render.
  const transmitRef = useRef(setTransmitting);
  transmitRef.current = setTransmitting;

  // Push-to-talk: while enabled, the mic only opens while Space or the Talk button is held.
  useEffect(() => {
    if (!connected || !pushToTalk) return;
    const room = roomRef.current;
    if (room) void room.localParticipant.setMicrophoneEnabled(false);
    setTransmittingState(false);
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);
    };
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      void transmitRef.current(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      void transmitRef.current(false);
    };
    const blur = () => { void transmitRef.current(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [connected, pushToTalk]);

  return (
    <div className={styles.groupVoiceControls}>
      <div className={styles.groupVoiceAudio} ref={audioContainerRef}/>
      <div className={styles.groupVoiceScreens} ref={screenShareContainerRef} aria-label={copy.screenShareLabel}/>
      {!connected ? (
        <button type="button" className={styles.voiceStart} disabled={busy} onClick={() => void joinRoom()}>
          {busy ? copy.connecting : "◉ " + copy.join}
        </button>
      ) : (
        <>
          <span className={styles.groupVoiceStatus}><i/> {copy.connected} · {participantCount} {copy.members} · {copy.quality}: {quality === "good" ? copy.qualityGood : quality === "fair" ? copy.qualityFair : quality === "poor" ? copy.qualityPoor : "—"}</span>
          {reconnecting && <span className={styles.voiceConsent} role="status" aria-live="polite">{copy.reconnecting}</span>}
          {canShareScreen && <button type="button" aria-pressed={screenShareActive} onClick={() => void toggleScreenShare()}>{screenShareActive ? copy.stopScreenShare : copy.screenShare}</button>}
          {canShareScreen && <small className={styles.voiceConsent}>{copy.screenSharePrivacy}</small>}
          {screenShareError && <small className={styles.voiceError} role="status" aria-live="polite">{screenShareError}</small>}
          <button type="button" onClick={() => void toggleMute()}>{muted ? copy.unmute : copy.mute}</button>
          <button type="button" aria-pressed={handRaised} onClick={() => void toggleHand()}>{handRaised ? copy.lowerHand : copy.raiseHand}</button>
          <label className={styles.groupVoicePref}><input type="checkbox" disabled={audioPrefsBusy} checked={pushToTalk} onChange={event => void saveAudioPreferences(event.target.checked, noiseSuppression)}/>{copy.pushToTalk}</label>
          <label className={styles.groupVoicePref}><input type="checkbox" disabled={audioPrefsBusy} checked={noiseSuppression} onChange={event => void saveAudioPreferences(pushToTalk, event.target.checked)}/>{copy.noiseSuppression}</label>
          {pushToTalk && <button type="button" className={transmittingState ? styles.voiceEnd : undefined} aria-pressed={transmittingState} title={copy.pttHint} onPointerDown={event => { event.preventDefault(); void transmitRef.current(true); }} onPointerUp={() => void setTransmitting(false)} onPointerLeave={() => void setTransmitting(false)} onPointerCancel={() => void setTransmitting(false)}>{copy.holdToTalk}</button>}
          {recordingState === "consent_granted" && <span className={styles.voiceRecording} role="status" aria-live="polite">{isAr ? "● تسجيل" : "● REC"} {recordingClock}</span>}
          {recordingState === "consent_pending" && myConsent === "pending" && <span className={styles.voiceConsent}><span>{isAr ? "طلب تسجيل هذه الغرفة" : "This room is requesting recording consent"}</span><button type="button" disabled={recordingBusy} onClick={() => void respondRecordingConsent("accepted")}>{isAr ? "أوافق" : "Allow"}</button><button type="button" disabled={recordingBusy} onClick={() => void respondRecordingConsent("declined")}>{isAr ? "أرفض" : "Decline"}</button></span>}
          {recordingState === "off" && isVoiceHost && <button type="button" disabled={recordingBusy} onClick={() => void requestRecordingConsent()}>{isAr ? "طلب تسجيل" : "Request recording"}</button>}
          {recordingState === "consent_granted" && <button type="button" disabled={recordingBusy} onClick={() => void respondRecordingConsent("withdrawn")}>{isAr ? "سحب الموافقة" : "Withdraw consent"}</button>}
          <button type="button" className={styles.voiceEnd} onClick={() => void leaveRoom()}>{copy.leave}</button>
          {canModerate && <button type="button" onClick={() => void toggleRoomLock()}>{locked ? (isAr ? "فتح الغرفة" : "Unlock room") : (isAr ? "قفل الغرفة" : "Lock room")}</button>}
          {canModerate && <button type="button" onClick={() => void bulkModerate("mute_all")}>{copy.muteAll}</button>}
          {canModerate && <button type="button" onClick={() => void bulkModerate("clear_hands")}>{copy.clearHands}</button>}
          {activeSpeakers.length > 0 && <small>{copy.speaking}: {activeSpeakers.length}</small>}
          <div className={styles.groupVoiceRoster}>{participants.map(participant => <div key={participant.identity}><span>{participant.name}{activeSpeakers.includes(participant.identity) ? " · " + copy.speaking : ""}</span>{canModerate && !participant.isSelf && <button type="button" onClick={() => void removeParticipant(participant.identity)}>{isAr ? "إزالة" : "Remove"}</button>}</div>)}</div>
        </>
      )}
      {error && <small className={styles.voiceError}>{error}</small>}
      <span className={styles.groupVoiceLabel}>{groupName}</span>
    </div>
  );
}
