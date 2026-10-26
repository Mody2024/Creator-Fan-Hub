"use client";

import { useState } from "react";

type Props = { src: string; title: string; description?: string | null };

export default function PublicVideoPlayer({ src, title, description }: Props) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return <div className="public-video-unavailable" role="status">
      <span aria-hidden="true">▶</span>
      <p> This video could not be loaded right now.</p>
      <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>
    </div>;
  }

  return <video key={attempt} controls preload="metadata" playsInline aria-label={description || title} onError={() => setFailed(true)} src={src}>
    Your browser does not support video playback.
  </video>;
}
