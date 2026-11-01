import Link from "next/link";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import PublishedPolls from "@/app/vote/published-polls";
import PublicVideos from "@/app/videos/public-videos";
import NarrationControl from "@/app/narration-control";
import ApprovedIdeas from "@/app/ideas/approved-ideas";
import PublicEvents from "@/app/events/public-events";
import PublicSocialLinks from "@/app/socials/public-social-links";

export const dynamic = "force-dynamic";

type VideoCard = { id:string; slug:string; title:string; description:string; category:string; src:string; youtubeEmbedUrl:string|null; publishedAt:string };
type PostCard = { id:string; body:string; createdAt:string; handle:string; displayName:string; avatarUrl:string|null };

export default async function HomePage() {
  const [config,supabase] = await Promise.all([getPublicSiteConfig(),createSupabaseServerClient()]);
  if (config.maintenance.enabled) {
    return <main className={`maintenance theme-${config.theme}`}><span className="eyebrow">NHEN? / TEMPORARILY OFFLINE</span><h1>{config.maintenance.message}</h1><p>Check back soon.</p></main>;
  }
  let videos:VideoCard[]=[];
  let posts:PostCard[]=[];
  if(supabase){
    const {data:videoRows}=await supabase.from("video_catalog")
      .select("media_id,slug,description,category,published_at,media_items!inner(title,storage_path,source_url,alt_text,is_published,media_type)")
      .not("published_at","is",null).eq("media_items.is_published",true)
      .order("published_at",{ascending:false}).limit(12);
    videos=(videoRows??[]).flatMap(item=>{
      const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
      if(!media||!media.is_published)return[];
      let src="",youtubeEmbedUrl:string|null=null;
      if(media.media_type==="video"){
        if(!media.storage_path?.startsWith("creator-media-public/"))return[];
        const parts=media.storage_path.split("/");
        if(parts.length<2)return[];
        src=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
      }else if(media.media_type==="youtube"){
        try{
          const u=new URL(media.source_url??"");
          if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname))return[];
          const parts=u.pathname.split("/").filter(Boolean);
          const id=u.hostname==="youtu.be"?parts[0]:u.searchParams.get("v")??parts[parts.length-1];
          if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return[];
          youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0";
        }catch{return[]}
      }else return[];
      return[{id:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",category:item.category||"Video",src,youtubeEmbedUrl,publishedAt:item.published_at}];
    });
    const {data:postRows}=await supabase.from("community_posts")
      .select("id,body,created_at,author_id").eq("status","published")
      .order("created_at",{ascending:false}).limit(5);
    const ids=[...new Set((postRows??[]).map(p=>p.author_id))];
    const {data:profiles}=ids.length?await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id",ids):{data:[]};
    const profileMap=new Map((profiles??[]).map(p=>[p.user_id,p]));
    posts=(postRows??[]).map(p=>{const profile=profileMap.get(p.author_id);return{id:p.id,body:p.body,createdAt:p.created_at,handle:profile?.handle??"member",displayName:profile?.display_name??"NHEN member",avatarUrl:profile?.avatar_url??null}});
  }
  return <main className="nhen-app-shell nhen-home-shell" data-color-mode={config.colorMode} data-motion={config.motion}>
    <header className="nhen-app-header">
      <Link className="nhen-brand" href="/" aria-label="Nhen? home">{config.logoUrl && <img className="site-logo-image" src={config.logoUrl} alt="" />}<span className="portal-wordmark"><strong>Nhen?</strong><small lang="ar" dir="rtl">نهين؟</small></span></Link>
      <form className="nhen-search-form" action="/search"><input className="nhen-search" type="search" name="q" placeholder="Search videos, creators and community" aria-label="Search NHEN" maxLength={80}/></form>
      <div className="nhen-header-actions"><Link className="nhen-pill" href="/community#join">Join NHEN</Link><Link className="nhen-icon-button" href="/creator/login" aria-label="Creator studio">＋</Link></div>
    </header>
    <div className="nhen-platform-grid">
      <aside className="desktop-nav" aria-label="Main navigation">
        <Link className="nhen-sidebar-link" href="/"><span>⌂</span> Home</Link>
        {config.visibleSections.includes("videos") && <><a href="#videos">Watch</a><a href="/shorts">Shorts</a></>}
        <Link className="nhen-sidebar-link" href="/community"><span>◉</span> Community</Link>
        <Link className="nhen-sidebar-link" href="/search"><span>⌕</span> Explore</Link>
        <span className="nhen-section-label">YOUR NHEN</span>
        <Link className="nhen-sidebar-link" href="/community#join"><span>◎</span> Your profile</Link>
        <Link className="nhen-sidebar-link" href="/saved"><span>♡</span> Saved</Link>
        <Link className="nhen-sidebar-link" href="/notifications"><span>♧</span> Notifications</Link>
        <Link className="nhen-sidebar-link" href="/creator/login"><span>＋</span> Creator Studio</Link>
      </aside>
      <section className="nhen-feed-column">
        <section className="nhen-home-welcome nhen-card nhen-card-pad" id="hero">
          <span className="nhen-section-label">{config.tagline}</span>
          <h1>{config.heroTitle || "Watch what matters."}<br/><em>Be part of it.</em></h1>
          <p className="nhen-muted">{config.heroBody || "Official creator videos, community-made Nhenbits, and conversations — all connected in one place."}</p>{config.heroMediaUrl && (config.heroMediaType === "video" ? <video className="hero-media" src={config.heroMediaUrl} autoPlay muted={config.heroMuted} loop={config.heroLoop} playsInline /> : <img className="hero-media" src={config.heroMediaUrl} alt="" />)}{config.narrationUrl && config.featureFlags.voice && <NarrationControl src={config.narrationUrl} transcript={config.narrationText} autoPlay={config.narrationAutoPlay}/>}
          <div className="nhen-home-quicklinks"><Link className="button button-primary" href="/watch">Explore videos ↗</Link><Link className="button button-secondary" href="/community">Join the community</Link></div>
        </section>
        {config.visibleSections.includes("ideas") && config.featureFlags.ideas && <ApprovedIdeas />}{config.visibleSections.includes("poll") && config.featureFlags.polls && <section className="nhen-card nhen-card-pad" id="poll"><span className="nhen-section-label">COMMUNITY VOTE</span><h2 className="nhen-card-title">Your voice shapes what comes next.</h2><PublishedPolls /></section>}{config.visibleSections.includes("events") && config.featureFlags.events && <PublicEvents />}{config.visibleSections.includes("socials") && <PublicSocialLinks />}
        <div className="nhen-feed-tabs"><Link className="active" href="/">For you</Link><Link href="/#videos">Videos</Link><Link href="/community">Community</Link><Link href="/shorts">Nhenbits</Link></div>
        {config.visibleSections.includes("videos") && <PublicVideos />}
        <div className="nhen-card-heading"><h2 className="nhen-card-title">Latest from creators</h2><Link className="nhen-muted" href="/watch">See all ↗</Link></div>
        {videos.length?<div className="nhen-home-video-grid">{videos.slice(0,8).map(video=><article className="nhen-home-video-card" key={video.id}>
          <Link className="nhen-home-video-player" href={"/watch/"+video.slug}><PublicVideoPlayer src={video.src} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/></Link>
          <div className="nhen-home-video-meta"><span className="nhen-section-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><small>{new Date(video.publishedAt).toLocaleDateString()}</small></div>
        </article>)}</div>:<div className="nhen-card nhen-empty-state"><strong>Your watch feed is getting ready.</strong><p className="nhen-muted">New official creator videos will appear here.</p></div>}
        <div className="nhen-card-heading"><h2 className="nhen-card-title">From the community</h2><Link className="nhen-muted" href="/community">Open community ↗</Link></div>
        {posts.length?posts.map(post=><article className="nhen-card nhen-home-post" key={post.id}><div className="nhen-post-header"><div className="nhen-avatar">{post.avatarUrl?<img src={post.avatarUrl} alt=""/>:post.displayName.slice(0,1).toUpperCase()}</div><div><strong>{post.displayName}</strong><div className="nhen-muted">@{post.handle} · {new Date(post.createdAt).toLocaleDateString()}</div></div></div><p className="nhen-post-body">{post.body}</p><Link className="nhen-action" href="/community">Join the conversation ↗</Link></article>):<div className="nhen-card nhen-empty-state"><p className="nhen-muted">Community conversations will appear here as people share.</p><Link href="/community">Visit community ↗</Link></div>}
      </section>
      <aside className="nhen-discovery-column">
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">DISCOVER NHEN</span><h2 className="nhen-card-title">Every format.<br/>One community.</h2><p className="nhen-muted">Long-form creator uploads, short community videos, shared moments and conversations.</p><div className="nhen-home-discovery-links"><Link href="/watch">▶ Watch videos</Link><Link href="/shorts">✦ Nhenbits</Link><Link href="/community">◉ Community</Link><Link href="/search">⌕ Find creators</Link></div></section>
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">CREATOR ACCESS</span><h2 className="nhen-card-title">Have a channel?</h2><p className="nhen-muted">Approved creators can publish official videos and manage their channel from NHEN Studio.</p><Link className="button button-secondary" href="/creator/login">Open Creator Studio ↗</Link></section>
      </aside>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation"><Link href="/">⌂<span>Home</span></Link>{config.visibleSections.includes("videos") && <><a href="#videos">Watch</a><a href="/shorts">Shorts</a></>}<Link href="/community">◉<span>Community</span></Link><Link href="/community#join">◎<span>Profile</span></Link></nav>{config.mascotUrl && config.featureFlags.mascot && <img className="nhen-floating-mascot" src={config.mascotUrl} alt="" aria-hidden="true"/>}
  </main>;
}
