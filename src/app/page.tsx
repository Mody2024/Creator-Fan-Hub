import type { CSSProperties } from "react";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import PublishedPolls from "@/app/vote/published-polls";
import IdeaSubmissionForm from "@/app/ideas/idea-submission-form";
import ApprovedIdeas from "@/app/ideas/approved-ideas";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = await getPublicSiteConfig();

  if (config.maintenance.enabled) {
    return <main className="maintenance" style={config.theme === "custom" ? ({ "--accent": config.accent } as CSSProperties & { "--accent": string }) : undefined}><span className="eyebrow">TEMPORARILY OFFLINE</span><h1>{config.maintenance.message}</h1><p>Check back soon.</p></main>;
  }

  return (
    <main className={`site theme-${config.theme}`} style={config.theme === "custom" ? ({ "--accent": config.accent } as CSSProperties & { "--accent": string }) : undefined}>
      <header className="topbar">
        <a className="wordmark" href="#home" aria-label={config.siteName}>{config.siteName}<span>®</span></a>
        <nav aria-label="Main navigation">
          <a href="#ideas">Ideas</a><a href="#vote">Vote</a><a href="#community">Community</a>
        </nav>
        <a className="nav-cta" href="#vote">Shape the next drop <span>↗</span></a>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <span className="eyebrow"><i /> {config.tagline}</span>
          <h1>{config.heroTitle}</h1>
          <p>{config.heroBody}</p>
          <div className="hero-actions"><a className="button button-primary" href="#vote">Cast your vote <span>↗</span></a><a className="text-link" href="#ideas">Submit an idea <span>↓</span></a></div>
          <div className="proof"><span className="proof-dots"><i>✳</i><i>✦</i><i>◉</i></span><span>Made with the people who watch.</span></div>
        </div>
        <div className="hero-art" aria-label="Abstract glowing portal artwork" role="img">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="portal"><div className="portal-core">IC<span>✳</span></div></div>
          <span className="art-label label-top">YOUR IDEAS, IN MOTION</span><span className="art-label label-bottom">COMMUNITY / 001</span>
        </div>
        <div className="hero-index"><span>01 — 03</span><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="intro-strip"><span>NOT JUST WATCHING.</span><span>YOU’RE PART OF WHAT’S NEXT.</span><span>BUILT TOGETHER <b>✳</b></span></section>

      <section className="content-section" id="ideas">
        <div className="section-heading"><div><span className="eyebrow">01 / THE IDEA BOARD</span><h2>What should we<br/><em>make next?</em></h2></div><p>Every great upload starts somewhere. Put your idea on the table and help steer the next one.</p></div>
        <div className="idea-panel"><div className="idea-panel-top"><span>COMMUNITY SUGGESTIONS</span><span className="live-dot">● MODERATED SUBMISSIONS</span></div><IdeaSubmissionForm /><ApprovedIdeas /></div>
      </section>

      <section className="vote-section" id="vote"><div className="section-heading"><div><span className="eyebrow">02 / THE NEXT DROP</span><h2>Help choose<br/><em>the next move.</em></h2></div><p>Voting will go live when the database and abuse protections are connected. No pretend results, no fake votes.</p></div><PublishedPolls /></section>

      <section className="community-section" id="community"><span className="eyebrow">03 / INSIDE THE CIRCLE</span><h2>It’s better when<br/>we <em>make it together.</em></h2><p>One place for new uploads, community events, and the ideas that make it to the screen.</p><a className="button button-light" href="#ideas">Bring an idea <span>↗</span></a><div className="community-orbit">✳</div></section>
      <footer className="site-footer"><span>THE INNER CIRCLE / COMMUNITY PORTAL</span><a href="#home">BACK TO TOP ↑</a></footer>
    </main>
  );
}
