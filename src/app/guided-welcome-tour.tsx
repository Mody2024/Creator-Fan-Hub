"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TourStep = { target: string; title: string; caption: string };

const steps: TourStep[] = [
  { target: "home", title: "Welcome", caption: "Start here for the latest message and the creator's featured content." },
  { target: "ideas", title: "Share an idea", caption: "Suggest a video or challenge. Submissions may be reviewed before appearing publicly." },
  { target: "vote", title: "Help decide", caption: "Vote in the current community poll and help shape what comes next." },
  { target: "community", title: "Join the community", caption: "Explore community updates and find ways to take part." },
  { target: "socials", title: "Stay connected", caption: "Use the creator's published social links to find more content." }
];

export default function GuidedWelcomeTour({ narrationUrl }: { narrationUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioStatus, setAudioStatus] = useState("Audio starts when you begin the tour");
  const audio = useRef<HTMLAudioElement>(null);
  const available = useMemo(() => steps.filter(item => typeof document === "undefined" || Boolean(document.getElementById(item.target))), []);

  useEffect(() => {
    if (!open) return;
    const current = available[step];
    if (!current) return;
    document.querySelectorAll(".tour-spotlight").forEach(node => node.classList.remove("tour-spotlight"));
    const target = document.getElementById(current.target);
    target?.classList.add("tour-spotlight");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    return () => target?.classList.remove("tour-spotlight");
  }, [open, step, available]);

  async function begin() {
    setStep(0);
    setOpen(true);
    try {
      if (narrationUrl && audio.current) {
        audio.current.currentTime = 0;
        await audio.current.play();
        setAudioStatus("Welcome narration playing");
      } else setAudioStatus("Read the captions to follow the tour");
    } catch {
      setAudioStatus("Audio blocked by browser; captions are available");
    }
  }

  async function toggleAudio() {
    const player = audio.current;
    if (!player) return;
    if (player.paused) {
      try { await player.play(); setAudioStatus("Welcome narration playing"); }
      catch { setAudioStatus("Audio could not start; captions remain available"); }
    } else {
      player.pause();
      setAudioStatus("Narration paused");
    }
  }

  function close() {
    setOpen(false);
    audio.current?.pause();
    document.querySelectorAll(".tour-spotlight").forEach(node => node.classList.remove("tour-spotlight"));
  }

  if (!available.length) return null;
  const current = available[Math.min(step, available.length - 1)];

  return <>
    <button className="tour-launch" type="button" onClick={() => void begin()} aria-haspopup="dialog">
      <span aria-hidden="true">✳</span> Take a quick tour <span aria-hidden="true">↗</span>
    </button>
    {narrationUrl && <audio ref={audio} src={narrationUrl} preload="none" muted={muted} onEnded={() => setAudioStatus("Welcome narration finished")} onPause={() => {}} />}
    {open && current && <div className="tour-scrim" role="presentation">
      <section className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-caption">
        <div className="tour-card-top"><span className="tour-kicker">YOUR COMMUNITY / QUICK TOUR</span><button type="button" className="tour-close" onClick={close} aria-label="Close tour">×</button></div>
        <div className="tour-progress" aria-label={`Step ${step + 1} of ${available.length}`}><span style={{ width: `${((step + 1) / available.length) * 100}%` }} /></div>
        <span className="tour-step-count">STEP {String(step + 1).padStart(2, "0")} / {String(available.length).padStart(2, "0")}</span>
        <h2 id="tour-title">{current.title}</h2>
        <p id="tour-caption" className="tour-caption">{current.caption}</p>
        <p className="tour-audio-status" role="status" aria-live="polite">{audioStatus}</p>
        <div className="tour-actions">
          {narrationUrl && <button type="button" className="tour-secondary" onClick={() => void toggleAudio()}>{audio.current?.paused ? "Play voice-over ▶" : "Pause voice-over Ⅱ"}</button>}
          {narrationUrl && <button type="button" className="tour-secondary" onClick={() => setMuted(v => !v)}>{muted ? "Unmute" : "Mute"}</button>}
          <button type="button" className="tour-secondary" onClick={close}>Skip tour</button>
          <button type="button" className="tour-primary" onClick={() => step + 1 >= available.length ? close() : setStep(v => v + 1)}>{step + 1 >= available.length ? "Finish tour ✓" : "Next section →"}</button>
        </div>
      </section>
    </div>}
  </>;
}
