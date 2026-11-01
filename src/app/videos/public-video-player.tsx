"use client";

import { useEffect, useRef, useState } from "react";

type Props = { src: string; title: string; description?: string | null; youtubeEmbedUrl?: string | null; startAt?: number };

export default function PublicVideoPlayer({ src, title, description, youtubeEmbedUrl, startAt = 0 }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
      <p>This video could not be loaded right now.</p>
      <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
    </div>;
  }

  if (youtubeEmbedUrl) {
    return <iframe key={attempt} src={startAt > 0 ? youtubeEmbedUrl + (youtubeEmbedUrl.includes("?") ? "&" : "?") + "start=" + Math.floor(startAt) : youtubeEmbedUrl} title={title} loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen />;
  }

  return <video ref={video} key={attempt} controls preload="metadata" playsInline aria-label={description || title} onError={() => setFailed(true)} src={src}>
    Your browser does not support video playback.
  </video>;
}
