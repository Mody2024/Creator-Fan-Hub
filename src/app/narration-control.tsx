"use client";

import { useRef, useState } from "react";

export default function NarrationControl({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("Optional spoken introduction");
  async function toggle() {
    const player = audio.current;
    if (!player) return;
    if (playing) {
      player.pause();
      setPlaying(false);
      setMessage("Introduction paused");
      return;
    }
    try {
      await player.play();
      setPlaying(true);
      setMessage("Playing introduction");
    } catch {
      setMessage("Playback unavailable. Try again or check your browser settings.");
      setPlaying(false);
    }
  }
  return <div className="narration-control">
    <audio ref={audio} src={src} preload="none" onEnded={() => { setPlaying(false); setMessage("Introduction finished"); }} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
    <button type="button" className="button button-secondary" onClick={() => void toggle()}>{playing ? "Pause introduction Ⅱ" : "Play introduction ▶"}</button>
    <span role="status" aria-live="polite">{message}</span>
  </div>;
}
