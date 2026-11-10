import Link from "next/link";
import { cookies } from "next/headers";
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
type EventCard = { id:string; title:string; description:string; starts_at:string|null; ends_at:string|null; status:string; going_count:number; my_rsvp:boolean };

export default async function HomePage() {
  const [config,supabase,cookieStore] = await Promise.all([getPublicSiteConfig(),createSupabaseServerClient(),cookies()]);
  const isArabic = cookieStore.get("nhen_locale")?.value === "ar";
  const t = isArabic ? {
    search:"ابحث عن الفيديوهات والمبدعين والمجتمع", join:"انضم إلى Raye2", home:"الرئيسية", watch:"شاهد", shorts:"قصاصات", community:"المجتمع", explore:"استكشف", profile:"ملفك الشخصي", saved:"المحفوظات", notifications:"الإشعارات", studio:"استوديو المبدعين", hero:"شاهد ما يهمك.", heroLine:"كن جزءًا منه.", heroBody:"فيديوهات المبدعين ومقاطع المجتمع والنقاشات — كلها في مكان واحد.", exploreVideos:"استكشف الفيديوهات ↗", joinCommunity:"انضم إلى المجتمع", forYou:"لك", videos:"الفيديوهات", nhenbits:"مقاطع قصيرة", latest:"أحدث فيديوهات المبدعين", seeAll:"عرض الكل ↗", fromCommunity:"من المجتمع", openCommunity:"افتح المجتمع ↗", joinConversation:"شارك في النقاش ↗", discover:"اكتشف Raye2", everyFormat:"كل أنواع المحتوى. مجتمع واحد.", watchVideos:"شاهد الفيديوهات", findCreators:"ابحث عن المبدعين", creatorAccess:"دخول المبدعين", haveChannel:"لديك قناة؟", openStudio:"افتح استوديو المبدعين ↗", vote:"تصويت المجتمع", haveSay:"شارك برأيك"
  } : {
    search:"Search videos, creators and community", join:"Join Raye2", home:"Home", watch:"Watch", shorts:"Shorts", community:"Community", explore:"Explore", profile:"Your profile", saved:"Saved", notifications:"Notifications", studio:"Creator Studio", hero:"Watch what matters.", heroLine:"Be part of it.", heroBody:"Official creator videos, community-made Mini’s, and conversations — all connected in one place.", exploreVideos:"Explore videos ↗", joinCommunity:"Join the community", forYou:"For you", videos:"Videos", nhenbits:"Mini’s", latest:"Latest from creators", seeAll:"See all ↗", fromCommunity:"From the community", openCommunity:"Open community ↗", joinConversation:"Join the conversation ↗", discover:"DISCOVER Raye2", everyFormat:"Every format. One community.", watchVideos:"Watch videos", findCreators:"Find creators", creatorAccess:"CREATOR ACCESS", haveChannel:"Have a channel?", openStudio:"Open Creator Studio ↗", vote:"COMMUNITY VOTE", haveSay:"HAVE YOUR SAY"
  };
  if (config.maintenance.enabled) {
    return <main className={`maintenance theme-${config.theme}`}><span className="eyebrow">RAYE2 / TEMPORARILY OFFLINE</span><h1>{config.maintenance.message}</h1><p>Check back soon.</p></main>;
  }
  let videos:VideoCard[]=[];
  let posts:PostCard[]=[];
  let events:EventCard[]=[];
  if(supabase){
    const {data:videoRows}=await supabase.from("video_catalog")
      .select("media_id,slug,description,category,published_at,media_items!video_catalog_media_id_fkey!inner(title,storage_path,source_url,alt_text,is_published,media_type)")
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
    posts=(postRows??[]).map(p=>{const profile=profileMap.get(p.author_id);return{id:p.id,body:p.body,createdAt:p.created_at,handle:profile?.handle??"member",displayName:profile?.display_name??"Raye2 member",avatarUrl:profile?.avatar_url??null}});
    const {data:eventRows}=await supabase.rpc("raye2_get_public_events",{p_limit:12});
    events=(Array.isArray(eventRows)?eventRows:[]).map((row:EventCard)=>({id:row.id,title:row.title,description:row.description,starts_at:row.starts_at,ends_at:row.ends_at,status:row.status,going_count:Number(row.going_count??0),my_rsvp:!!row.my_rsvp}));
  }
  return <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} className="nhen-app-shell nhen-home-shell" data-color-mode={config.colorMode} data-motion={config.motion}>
    <header className="nhen-app-header">
      <Link className="nhen-brand" href="/" aria-label="Raye2 home">{config.logoUrl && <img className="site-logo-image" src={config.logoUrl} alt="" />}<span className="portal-wordmark"><strong>Raye2</strong><small lang="ar" dir="rtl">رايق</small></span></Link>
      <form className="nhen-search-form" action="/search"><input className="nhen-search" type="search" name="q" placeholder={t.search} aria-label="Search Raye2" maxLength={80}/></form>
      <div className="nhen-header-actions"><Link className="nhen-pill" href="/community#join">{t.join}</Link><Link className="nhen-icon-button" href="/creator/login" aria-label="Creator studio">＋</Link></div>
    </header>
    <div className="nhen-platform-grid">
      <aside className="desktop-nav" aria-label="Main navigation">
        <Link className="nhen-sidebar-link" href="/"><span>⌂</span> {t.home}</Link>
        {config.visibleSections.includes("videos") && <><a href="#videos">{t.watch}</a><a href="/shorts">{t.shorts}</a></>}
        <Link className="nhen-sidebar-link" href="/community"><span>◉</span> {t.community}</Link>
        <Link className="nhen-sidebar-link" href="/search"><span>⌕</span> {t.explore}</Link>
        <span className="nhen-section-label">{isArabic ? "مساحتك في Raye2" : "YOUR RAYE2"}</span>
        <Link className="nhen-sidebar-link" href="/community#join"><span>◎</span> {t.profile}</Link>
        <Link className="nhen-sidebar-link" href="/saved"><span>♡</span> {t.saved}</Link>
        <Link className="nhen-sidebar-link" href="/notifications"><span>♧</span> {t.notifications}</Link>
        <Link className="nhen-sidebar-link" href="/creator/login"><span>＋</span> {t.studio}</Link>
      </aside>
      <section className="nhen-feed-column">
        <section className="nhen-home-welcome nhen-card nhen-card-pad" id="hero">
          <span className="nhen-section-label">{config.tagline}</span>
          <h1>{config.heroTitle || t.hero}<br/><em>{t.heroLine}</em></h1>
          <p className="nhen-muted">{config.heroBody || t.heroBody}</p>{config.heroMediaUrl && (config.heroMediaType === "video" ? <video className="hero-media" src={config.heroMediaUrl} autoPlay muted={config.heroMuted} loop={config.heroLoop} playsInline /> : <img className="hero-media" src={config.heroMediaUrl} alt="" />)}{config.narrationUrl && config.featureFlags.voice && <NarrationControl src={config.narrationUrl} transcript={config.narrationText} autoPlay={config.narrationAutoPlay}/>}
          <div className="nhen-home-quicklinks"><Link className="button button-primary" href="/watch">{t.exploreVideos}</Link><Link className="button button-secondary" href="/community">{t.joinCommunity}</Link></div>
        </section>
        {config.visibleSections.includes("ideas") && config.featureFlags.ideas && <ApprovedIdeas />}{config.visibleSections.includes("events") && config.featureFlags.events && <PublicEvents initialEvents={events} locale={isArabic?"ar":"en"} />}{config.visibleSections.includes("socials") && <PublicSocialLinks />}
        <div className="nhen-feed-tabs"><Link className="active" href="/">{t.forYou}</Link><Link href="/#videos">{t.videos}</Link><Link href="/community">{t.community}</Link><Link href="/shorts">{t.nhenbits}</Link></div>
        {config.visibleSections.includes("poll") && config.featureFlags.polls && <section className="nhen-card nhen-card-pad nhen-home-polls" id="poll" aria-labelledby="nhen-home-polls-title">
          <div className="nhen-card-heading"><div><span className="nhen-section-label">{t.vote}</span><h2 className="nhen-card-title" id="nhen-home-polls-title" style={{marginTop:6}}>{isArabic ? "صوّت وشارك في اختيار القادم." : "Your voice shapes what comes next."}</h2></div><span className="nhen-pill">{t.haveSay}</span></div>
          <PublishedPolls locale={isArabic?"ar":"en"} />
        </section>}
        {config.visibleSections.includes("videos") && <PublicVideos />}
        <div className="nhen-card-heading"><h2 className="nhen-card-title">{t.latest}</h2><Link className="nhen-muted" href="/watch">{t.seeAll}</Link></div>
        {videos.length?<div className="nhen-home-video-grid">{videos.slice(0,8).map(video=><article className="nhen-home-video-card" key={video.id}>
          <Link className="nhen-home-video-player" href={"/watch/"+video.slug}><PublicVideoPlayer locale={isArabic?"ar":"en"} src={video.src} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/></Link>
          <div className="nhen-home-video-meta"><span className="nhen-section-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><small>{new Date(video.publishedAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</small></div>
        </article>)}</div>:<div className="nhen-card nhen-empty-state"><strong>{isArabic?"مساحة المشاهدة تستعد لاستقبال الفيديوهات.":"Your watch feed is getting ready."}</strong><p className="nhen-muted">{isArabic?"ستظهر هنا فيديوهات المبدعين الرسمية الجديدة.":"New official creator videos will appear here."}</p></div>}
        <div className="nhen-card-heading"><h2 className="nhen-card-title">{t.fromCommunity}</h2><Link className="nhen-muted" href="/community">{t.openCommunity}</Link></div>
        {posts.length?posts.map(post=><article className="nhen-card nhen-home-post" key={post.id}><div className="nhen-post-header"><div className="nhen-avatar">{post.avatarUrl?<img src={post.avatarUrl} alt=""/>:post.displayName.slice(0,1).toUpperCase()}</div><div><strong>{post.displayName}</strong><div className="nhen-muted">@{post.handle} · {new Date(post.createdAt).toLocaleDateString()}</div></div></div><p className="nhen-post-body">{post.body}</p><Link className="nhen-action" href="/community">{t.joinConversation}</Link></article>):<div className="nhen-card nhen-empty-state"><p className="nhen-muted">{isArabic?"ستظهر هنا نقاشات المجتمع ومشاركاته الجديدة.":"Community conversations will appear here as people share."}</p><Link href="/community">{isArabic?"زيارة المجتمع ↗":"Visit community ↗"}</Link></div>}

      </section>
      <aside className="nhen-discovery-column">
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.discover}</span><h2 className="nhen-card-title">{t.everyFormat}</h2><p className="nhen-muted">{isArabic ? "فيديوهات المبدعين، ومقاطع المجتمع، واللحظات المشتركة والنقاشات." : "Long-form creator uploads, short community videos, shared moments and conversations."}</p><div className="nhen-home-discovery-links"><Link href="/watch">{t.watchVideos}</Link><Link href="/shorts">✦ {t.nhenbits}</Link><Link href="/community">◉ {t.community}</Link><Link href="/search">{t.findCreators}</Link></div></section>
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.creatorAccess}</span><h2 className="nhen-card-title">{t.haveChannel}</h2><p className="nhen-muted">{isArabic ? "يمكن للمبدعين المعتمدين نشر فيديوهاتهم وإدارة قنواتهم من استوديو Raye2." : "Approved creators can publish official videos and manage their channel from Raye2 Studio."}</p><Link className="button button-secondary" href="/creator/login">{t.openStudio}</Link></section>
      </aside>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation"><Link href="/">⌂<span>{t.home}</span></Link>{config.visibleSections.includes("videos") && <><a href="#videos">{t.watch}</a><a href="/shorts">{t.shorts}</a></>}<Link href="/community">◉<span>{t.community}</span></Link><Link href="/community#join">◎<span>{t.profile}</span></Link></nav>{config.mascotUrl && config.featureFlags.mascot && <img className="nhen-floating-mascot" src={config.mascotUrl} alt="" aria-hidden="true"/>}
  </main>;
}
