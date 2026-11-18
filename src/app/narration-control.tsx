"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function NarrationControl({ src, transcript, autoPlay = true }: { src: string; transcript: string; autoPlay?: boolean }) {
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
        ? "Automatic audio was blocked. Select Play voice-over to listen."
        : "Playback could not start. Check the audio file or browser settings and try again.");
    }
  }, []);

  useEffect(() => {
    if (autoPlay) void start(true);
  }, [start, src, autoPlay]);

  useEffect(() => () => {
    audio.current?.pause();
  }, []);

  return <section className="narration-card" aria-label="Website voice-over introduction">
    <div className="narration-card-top">
      <span className="narration-kicker"><i aria-hidden="true" /> THE WELCOME MESSAGE</span>
      <span className="narration-status" role="status" aria-live="polite">{message}</span>
    </div>
    {showTranscript ? <div className="narration-transcript">
      <span className="narration-quote" aria-hidden="true">“</span>
      <p>{transcript || "Welcome. Explore the community and help shape what comes next."}</p>
    </div> : <p className="narration-hidden-note">Transcript hidden. Select “Show text” to read the narration.</p>}
    <div className="narration-controls">
      <audio ref={audio} src={src} preload="metadata"
        onEnded={() => { setPlaying(false); setMessage("Introduction finished"); }}
        onPause={() => setPlaying(false)}
        onPlay={() => { setPlaying(true); setMessage("Narration playing"); }}
        onError={() => { setPlaying(false); setMessage("Audio file could not be loaded. The transcript remains available."); }} />
      <button type="button" className="button button-primary" onClick={() => playing ? audio.current?.pause() : void start(false)}>{playing ? "Pause voice-over Ⅱ" : "Play voice-over ▶"}</button>
      <button type="button" className="narration-transcript-toggle" aria-expanded={showTranscript} onClick={() => setShowTranscript(v => !v)}>{showTranscript ? "Hide text −" : "Show text +"}</button>
      <button type="button" className="narration-transcript-toggle" onClick={() => { const player = audio.current; if (player) { player.currentTime = 0; void start(false); } }}>Replay ↻</button>
    </div>
  </section>;
}
