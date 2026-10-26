"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function NarrationControl({ src, transcript }: { src: string; transcript: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("Preparing introduction…");
  const [showTranscript, setShowTranscript] = useState(true);

  const start = useCallback(async (autoplayAttempt = false) => {
    const player = audio.current;
    if (!player) return;
    try {
      await player.play();
      setPlaying(true);
      setMessage("Narration playing");
    } catch {
      setPlaying(false);
      setMessage(autoplayAttempt
        ? "Your browser blocked automatic audio. Tap Play introduction to listen."
        : "Playback is unavailable. Check your browser's audio settings and try again.");
    }
  }, []);

  useEffect(() => {
    // Attempt autoplay. Browsers may block audible autoplay; the visible control is the fallback.
    void start(true);
  }, [start, src]);

  return <section className="narration-card" aria-label="Website voice-over introduction">
    <div className="narration-card-top">
      <span className="narration-kicker"><i aria-hidden="true" /> THE WELCOME MESSAGE</span>
      <span className="narration-status" role="status" aria-live="polite">{message}</span>
    </div>
    <div className="narration-transcript" aria-live="polite">
      <span className="narration-quote" aria-hidden="true">“</span>
      <p>{transcript || "Welcome. Explore the community and help shape what comes next."}</p>
    </div>
    <div className="narration-controls">
      <audio ref={audio} src={src} preload="auto" onEnded={() => { setPlaying(false); setMessage("Introduction finished"); }} onPause={() => setPlaying(false)} onPlay={() => { setPlaying(true); setMessage("Narration playing"); }} />
      <button type="button" className="button button-primary" onClick={() => playing ? audio.current?.pause() : void start(false)}>{playing ? "Pause voice-over Ⅱ" : "Play voice-over ▶"}</button>
      <button type="button" className="narration-transcript-toggle" aria-expanded={showTranscript} onClick={() => setShowTranscript(v => !v)}>{showTranscript ? "Hide text −" : "Show text +"}</button>
    </div>
    {!showTranscript && <span className="narration-hidden-note">Transcript hidden. Use “Show text” to read the narration.</span>}
  </section>;
}
