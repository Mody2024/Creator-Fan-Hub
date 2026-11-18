"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Step = { target: string; title: string; text: string };

const steps: Step[] = [
  { target: "home", title: "Welcome to the community", text: "Start here for the latest message and featured content. Your voice helps shape what comes next." },
  { target: "ideas", title: "Share an idea", text: "Suggest a video or challenge. Keep it clear and respectful so the creator can review it." },
  { target: "vote", title: "Make your vote count", text: "Explore active polls and choose the idea you would most like to see next." },
  { target: "community", title: "Stay in the loop", text: "Find community updates and discover more ways to take part." }
];

export default function GuidedTour({ enabled, narrationUrl, narrationText }: { enabled: boolean; narrationUrl: string | null; narrationText: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Guided tour");
  const audio = useRef<HTMLAudioElement>(null);

  const finish = useCallback(() => {
    setOpen(false);
    document.querySelectorAll(".tour-highlight").forEach(node => node.classList.remove("tour-highlight"));
    try { window.localStorage.setItem("creator-hub-tour-seen", "1"); } catch {}
    if (audio.current) { audio.current.pause(); audio.current.currentTime = 0; }
  }, []);

  const begin = useCallback((replay = false) => {
    if (!enabled) return;
    setStep(0);
    setOpen(true);
    setStatus("Preparing the welcome narration…");
    if (replay) {
      try { window.localStorage.removeItem("creator-hub-tour-seen"); } catch {}
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem("creator-hub-tour-seen") !== "1") {
        const id = window.setTimeout(() => begin(false), 900);
        return () => window.clearTimeout(id);
      }
    } catch { /* Private browsing may block storage; tour remains available manually. */ }
  }, [enabled, begin]);

  useEffect(() => {
    if (!open) return;
    const target = document.getElementById(steps[step].target);
    document.querySelectorAll(".tour-highlight").forEach(node => node.classList.remove("tour-highlight"));
    target?.classList.add("tour-highlight");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    if (step === 0 && narrationUrl && audio.current && !muted) {
      audio.current.currentTime = 0;
      void audio.current.play().then(() => setStatus("Welcome narration playing")).catch(() => setStatus("Autoplay blocked by your browser — use Play voice-over."));
    } else {
      if (audio.current) audio.current.pause();
      setStatus("Read the tour caption, then continue");
    }
    return () => { target?.classList.remove("tour-highlight"); };
  }, [open, step, narrationUrl, muted]);

  if (!enabled) return null;
  const current = steps[step];
  return <>
    <button type="button" className="tour-replay" onClick={() => begin(true)} aria-label="Replay the guided tour">Take the tour ↗</button>
    {open && <div className="tour-scrim" role="presentation">
      <section className="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div className="tour-dialog-top"><span className="tour-label">YOUR QUICK TOUR</span><button type="button" className="tour-close" onClick={finish} aria-label="Close guided tour">×</button></div>
        <div className="tour-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, i) => <span key={i} className={i <= step ? "active" : ""} />)}</div>
        <span className="tour-step">0{step + 1} / 0{steps.length}</span>
        <h2 id="tour-title">{current.title}</h2>
        <p className="tour-caption">{step === 0 && narrationText ? narrationText : current.text}</p>
        {step === 0 && narrationUrl && <div className="tour-audio-row"><audio ref={audio} src={narrationUrl} preload="auto" muted={muted} onEnded={() => setStatus("Welcome narration finished")} /><button type="button" onClick={() => { if (audio.current?.paused) void audio.current.play().then(() => setStatus("Welcome narration playing")).catch(() => setStatus("Unable to play narration")); else audio.current?.pause(); }}>{status.includes("playing") ? "Pause voice-over Ⅱ" : "Play voice-over ▶"}</button><button type="button" onClick={() => setMuted(v => !v)}>{muted ? "Unmute" : "Mute"}</button></div>}
        <span className="tour-status" role="status" aria-live="polite">{status}</span>
        <div className="tour-actions"><button type="button" className="tour-skip" onClick={finish}>Skip tour</button><button type="button" className="tour-next" onClick={() => step === steps.length - 1 ? finish() : setStep(v => v + 1)}>{step === steps.length - 1 ? "Finish tour ✓" : "Next step →"}</button></div>
      </section>
    </div>}
  </>;
}
