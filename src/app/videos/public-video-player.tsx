"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string; title: string; description?: string | null; youtubeEmbedUrl?: string | null; startAt?: number; locale?: "en"|"ar" };

export default function PublicVideoPlayer({ src, title, description, youtubeEmbedUrl, startAt = 0, locale="en" }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setLoaded(false); setFailed(false); }, [src, youtubeEmbedUrl, attempt]);

  useEffect(() => {
    const player = video.current;
    if (!player || !Number.isFinite(startAt) || startAt <= 0) return;
    const seek = () => { player.currentTime = Math.min(startAt, Number.isFinite(player.duration) ? Math.max(0, player.duration - 1) : startAt); };
    if (player.readyState >= 1) seek(); else player.addEventListener("loadedmetadata", seek, { once: true });
    return () => player.removeEventListener("loadedmetadata", seek);
  }, [startAt, attempt]);

  if (failed) {
    return <div className="public-video-unavailable" role="status">
      <span aria-hidden="true">▶</span>
      <p>{locale==="ar"?"تعذر تحميل هذا الفيديو حاليًا.":"This video could not be loaded right now."}</p>
      <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{locale==="ar"?"حاول مرة أخرى":"Try again"}</button>
    </div>;
  }

  return <div className={`nhen-player-shell ${loaded ? "is-loaded" : "is-loading"}`}>
    {!loaded && <div className="nhen-player-loading" role="status" aria-live="polite">
      <span className="nhen-player-loading-mark" aria-hidden="true">N</span>
      <span>{locale==="ar"?"جارٍ تجهيز الفيديو":"Preparing your video"}</span>
      <i aria-hidden="true" />
    </div>}
    {youtubeEmbedUrl ? <iframe key={attempt} src={startAt > 0 ? youtubeEmbedUrl + (youtubeEmbedUrl.includes("?") ? "&" : "?") + "start=" + Math.floor(startAt) : youtubeEmbedUrl} title={title} loading="lazy"
      onLoad={() => setLoaded(true)}
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen /> : <video ref={video} key={attempt} controls preload="metadata" playsInline aria-label={description || title} onLoadedData={() => setLoaded(true)} onError={() => setFailed(true)} src={src}>
      Your browser does not support video playback.
    </video>}
  </div>;
}
