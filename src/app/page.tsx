import type { CSSProperties } from "react";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import PublishedPolls from "@/app/vote/published-polls";
import IdeaSubmissionForm from "@/app/ideas/idea-submission-form";
import ApprovedIdeas from "@/app/ideas/approved-ideas";
import PublicEvents from "@/app/events/public-events";
import PublicSocialLinks from "@/app/socials/public-social-links";
import PublicVideos from "@/app/videos/public-videos";
import NarrationControl from "@/app/narration-control";
import GuidedWelcomeTour from "@/app/guided-welcome-tour";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = await getPublicSiteConfig();

  if (config.maintenance.enabled) {
    return <main className={`maintenance theme-${config.theme}`} style={{ "--accent": config.accent } as CSSProperties & { "--accent": string }}><span className="eyebrow">TEMPORARILY OFFLINE</span><h1>{config.maintenance.message}</h1><p>Check back soon.</p></main>;
  }

  return (
    <main className={`site theme-${config.theme}`} style={{ "--accent": config.accent } as CSSProperties & { "--accent": string }}>
      <header className="topbar">
        <a className="wordmark" href="#home" aria-label={config.siteName}>{config.logoUrl ? <img className="site-logo-image" src={config.logoUrl} alt="" /> : config.siteName}<span>®</span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {config.featureFlags.ideas && config.visibleSections.includes("ideas") && <a href="#ideas">Ideas</a>}{config.featureFlags.polls && config.visibleSections.includes("poll") && <a href="#vote">Vote</a>}{config.featureFlags.events && config.visibleSections.includes("events") && <a href="#events">Events</a>}{config.visibleSections.includes("community") && <a href="#community">Community</a>}{config.visibleSections.includes("socials") && <a href="#socials">Socials</a>}{config.visibleSections.includes("videos") && <a href="#videos">Videos</a>}
        </nav>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {config.featureFlags.ideas && config.visibleSections.includes("ideas") && <a href="#ideas">Ideas</a>}{config.featureFlags.polls && config.visibleSections.includes("poll") && <a href="#vote">Vote</a>}{config.featureFlags.events && config.visibleSections.includes("events") && <a href="#events">Events</a>}{config.visibleSections.includes("community") && <a href="#community">Community</a>}{config.visibleSections.includes("socials") && <a href="#socials">Socials</a>}{config.visibleSections.includes("videos") && <a href="#videos">Videos</a>}
        </nav>
        <a className="nav-cta" href={config.featureFlags.polls && config.visibleSections.includes("poll") ? "#vote" : config.featureFlags.ideas && config.visibleSections.includes("ideas") ? "#ideas" : config.visibleSections.includes("events") && config.featureFlags.events ? "#events" : config.visibleSections.includes("community") ? "#community" : "#home"}>Shape the next drop <span>↗</span></a>
      </header>

      {config.sectionOrder.map(section => {
        if (!config.visibleSections.includes(section)) return null;
        switch (section) {
          case "hero": return <div key="hero">{config.visibleSections.includes("hero") && <section className="hero" id="home">
        {config.featureFlags.mascot && config.mascotUrl && <img className="public-mascot" src={config.mascotUrl} alt="" aria-hidden="true" />}
        <div className="hero-copy">
          <span className="eyebrow"><i /> {config.tagline}</span>
          <h1>{config.heroTitle}</h1>
          <p>{config.heroBody}</p>
          <div className="hero-actions">{config.featureFlags.polls && config.visibleSections.includes("poll") && <a className="button button-primary" href="#vote">Cast your vote <span>↗</span></a>}{config.featureFlags.ideas && config.visibleSections.includes("ideas") && <a className="text-link" href="#ideas">Submit an idea <span>↓</span></a>}</div>
          <div className="proof"><span className="proof-dots"><i>✳</i><i>✦</i><i>◉</i></span><span>Made with the people who watch.</span></div>
        </div>
        <div className={config.heroMediaUrl ? "hero-art hero-art-media" : "hero-art"} style={{ "--hero-overlay": config.heroOverlay } as CSSProperties & { "--hero-overlay": number }} aria-label={config.heroMediaUrl ? "Creator-selected hero media" : "Abstract glowing portal artwork"} role="img">
          {config.heroMediaUrl ? (config.heroMediaType === "video" ? <video className="hero-media" src={config.heroMediaUrl} autoPlay={config.heroMuted} muted={config.heroMuted} playsInline loop={config.heroLoop} preload="metadata" /> : <img className="hero-media" src={config.heroMediaUrl} alt="" />) : <><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="portal"><div className="portal-core">IC<span>✳</span></div></div><span className="art-label label-top">YOUR IDEAS, IN MOTION</span><span className="art-label label-bottom">COMMUNITY / 001</span></>}
        </div>
        <div className="hero-index"><span>01 — 03</span><span>SCROLL TO EXPLORE ↓</span></div>
      </section>}

      {config.visibleSections.includes("hero") && <section className="intro-strip"><span>NOT JUST WATCHING.</span><span>YOU’RE PART OF WHAT’S NEXT.</span><span>BUILT TOGETHER <b>✳</b></span></section>}</div>;
          case "ideas": return <div key="ideas">{config.featureFlags.ideas && config.visibleSections.includes("ideas") && <section className="content-section" id="ideas">
        <div className="section-heading"><div><span className="eyebrow">01 / THE IDEA BOARD</span><h2>What should we<br/><em>make next?</em></h2></div><p>Every great upload starts somewhere. Put your idea on the table and help steer the next one.</p></div>
        <div className="idea-panel"><div className="idea-panel-top"><span>COMMUNITY SUGGESTIONS</span><span className="live-dot">● MODERATED SUBMISSIONS</span></div><IdeaSubmissionForm /><ApprovedIdeas /></div>
      </section>}</div>;
          case "poll": return <div key="poll">{config.featureFlags.polls && config.visibleSections.includes("poll") && <section className="vote-section" id="vote"><div className="section-heading"><div><span className="eyebrow">02 / THE NEXT DROP</span><h2>Help choose<br/><em>the next move.</em></h2></div><p>Vote on published polls and help decide what comes next.</p></div><PublishedPolls /></section>}</div>;
          case "events": return <div key="events">{config.featureFlags.events && config.visibleSections.includes("events") && <PublicEvents />}</div>;
          case "community": return <div key="community">{config.visibleSections.includes("community") && <section className="community-section" id="community"><span className="eyebrow">03 / INSIDE THE CIRCLE</span><h2>It’s better when<br/>we <em>make it together.</em></h2><p>One place for new uploads, community events, and the ideas that make it to the screen.</p>{config.featureFlags.ideas && <a className="button button-light" href="#ideas">Bring an idea <span>↗</span></a>}<div className="community-orbit">✳</div></section>}</div>;
          case "socials": return <div key="socials">{config.visibleSections.includes("socials") && <PublicSocialLinks />}</div>;
          case "videos": return <div key="videos">{config.visibleSections.includes("videos") && <PublicVideos />}</div>;
          default: return null;
        }
      })}
      {config.featureFlags.voice && config.narrationUrl && <NarrationControl src={config.narrationUrl} transcript={config.narrationText} autoPlay={config.narrationAutoPlay} />}
      {config.featureFlags.guidedTour && <GuidedWelcomeTour narrationUrl={config.featureFlags.voice ? config.narrationUrl : null} />}
      <footer className="site-footer"><span>{config.siteName} / COMMUNITY PORTAL</span><a href="#home">BACK TO TOP ↑</a></footer>
    </main>
  );
}
