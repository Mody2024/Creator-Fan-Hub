"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

type Props = { src: string; hlsSrc?: string | null; title: string; description?: string | null; youtubeEmbedUrl?: string | null; poster?: string | null; startAt?: number; locale?: "en"|"ar"; onProgress?: (position: number, duration: number) => void };

export default function PublicVideoPlayer({ src, hlsSrc, title, description, youtubeEmbedUrl, poster, startAt = 0, locale="en", onProgress }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const lastReported = useRef(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(!hlsSrc);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setUseFallback(!hlsSrc);
  }, [src, hlsSrc, youtubeEmbedUrl, attempt]);

  useEffect(() => {
    const player = video.current;
    if (!player || !hlsSrc || youtubeEmbedUrl) return;
    let cancelled = false;
    let hls: Hls | null = null;
    const fallbackToFile = () => {
      if (cancelled) return;
      hls?.destroy();
      hls = null;
      setUseFallback(true);
      player.src = src;
      player.load();
    };
    const nativeHls = player.canPlayType("application/vnd.apple.mpegurl") !== "";
    const hasMse = typeof window.MediaSource !== "undefined";
    const hasManagedMediaSource = "ManagedMediaSource" in window;
    if (nativeHls && (!hasMse || hasManagedMediaSource)) {
      player.src = hlsSrc;
      return () => { cancelled = true; };
    }
    void import("hls.js").then(({ default: HlsEngine }) => {
      if (cancelled) return;
      if (!HlsEngine.isSupported()) {
        if (nativeHls) player.src = hlsSrc;
        else fallbackToFile();
        return;
      }
      hls = new HlsEngine({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30 });
      hls.on(HlsEngine.Events.MANIFEST_PARSED, () => setLoaded(true));
      hls.on(HlsEngine.Events.ERROR, (_event, data) => {
        if (data.fatal) fallbackToFile();
      });
      hls.loadSource(hlsSrc);
      hls.attachMedia(player);
    }).catch(fallbackToFile);
    return () => {
      cancelled = true;
      hls?.destroy();
      hls = null;
    };
  }, [hlsSrc, src, youtubeEmbedUrl, attempt]);

  useEffect(() => {
    const player = video.current;
    if (!player || !Number.isFinite(startAt) || startAt <= 0) return;
    const seek = () => { player.currentTime = Math.min(startAt, Number.isFinite(player.duration) ? Math.max(0, player.duration - 1) : startAt); };
    if (player.readyState >= 1) seek(); else player.addEventListener("loadedmetadata", seek, { once: true });
    return () => player.removeEventListener("loadedmetadata", seek);
  }, [startAt, attempt, hlsSrc]);

  const reportProgress = () => {
    if (!onProgress) return;
    const player = video.current;
    if (!player) return;
    const position = Math.floor(player.currentTime || 0);
    const duration = Number.isFinite(player.duration) ? Math.floor(player.duration) : 0;
    // Throttle to roughly one write every 10 seconds of playback.
    if (Math.abs(position - lastReported.current) < 10 && position !== 0) return;
    lastReported.current = position;
    onProgress(position, duration);
  };

  if (failed) {
    return <div className="public-video-unavailable" role="status">
      <span aria-hidden="true">▶</span>
      <p>{locale==="ar"?"تعذر تحميل هذا الفيديو حاليًا.":"This video could not be loaded right now."}</p>
      <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{locale==="ar"?"حاول مرة أخرى":"Try again"}</button>
    </div>;
  }

  return <div className={`nhen-player-shell ${loaded ? "is-loaded" : "is-loading"}`}>
    {!loaded && <div className="nhen-player-loading" role="status" aria-live="polite">
      <span className="raye2-player-loading-mark" aria-hidden="true">R</span>
      <span>{locale==="ar"?"جارٍ تجهيز الفيديو":"Preparing your video"}</span>
      <i aria-hidden="true" />
    </div>}
    {youtubeEmbedUrl ? <iframe key={attempt} src={startAt > 0 ? youtubeEmbedUrl + (youtubeEmbedUrl.includes("?") ? "&" : "?") + "start=" + Math.floor(startAt) : youtubeEmbedUrl} title={title} loading="lazy"
      onLoad={() => setLoaded(true)}
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen /> : <video ref={video} key={attempt} controls preload="metadata" playsInline poster={poster || undefined} aria-label={description || title}
      onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} onTimeUpdate={reportProgress} onPause={reportProgress} onEnded={reportProgress} src={!hlsSrc || useFallback ? src : undefined}>
      Your browser does not support video playback.
    </video>}
  </div>;
}
