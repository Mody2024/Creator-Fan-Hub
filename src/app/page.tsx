import type { CSSProperties } from "react";
import ShellTopBar from "./raye2-shell/shell-top";
import ShellRail from "./raye2-shell/shell-rail";
import Link from "next/link";
import { cookies } from "next/headers";
import { getPublicSiteConfig } from "@/lib/public-site-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePublicObjectUrls } from "@/lib/storage/resolve.server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import PublishedPolls from "@/app/vote/published-polls";
import PublicVideos from "@/app/videos/public-videos";
import NarrationControl from "@/app/narration-control";
import ApprovedIdeas from "@/app/ideas/approved-ideas";
import PublicEvents from "@/app/events/public-events";
import PublicSocialLinks from "@/app/socials/public-social-links";
import { localizedCopy } from "@/lib/localized-copy";
import { LAUNCH_MEDIA_VISIBLE } from "@/lib/launch-features";
import ShellIcon from "@/app/raye2-shell/shell-icons";

export const dynamic = "force-dynamic";

type VideoCard = { id:string; slug:string; title:string; description:string; category:string; src:string; youtubeEmbedUrl:string|null; publishedAt:string };
type PostCard = { id:string; body:string; createdAt:string; handle:string; displayName:string; avatarUrl:string|null };
type EventCard = { id:string; title:string; description:string; starts_at:string|null; ends_at:string|null; status:string; event_type:string; going_count:number; host_count:number; my_rsvp:boolean; my_rsvp_status:string|null };

export default async function HomePage() {
  const [config,supabase,cookieStore] = await Promise.all([getPublicSiteConfig(),createSupabaseServerClient(),cookies()]);
  const isArabic = cookieStore.get("raye2_locale")?.value === "ar";
  const t = isArabic ? {
    search:"ابحث عن الفيديوهات والمبدعين والمجتمع", join:"انضم إلى Raye2", home:"الرئيسية", watch:"شاهد", shorts:"قصاصات", community:"المجتمع", explore:"استكشف", profile:"ملفك الشخصي", saved:"المحفوظات", notifications:"الإشعارات", studio:"استوديو المبدعين", hero:"شاهد ما يهمك.", heroLine:"كن جزءًا منه.", heroBody:"فيديوهات المبدعين ومقاطع المجتمع والنقاشات — كلها في مكان واحد.", exploreVideos:"استكشف الفيديوهات ↗", joinCommunity:"انضم إلى المجتمع", forYou:"لك", videos:"الفيديوهات", minis:"مقاطع قصيرة", latest:"أحدث فيديوهات المبدعين", seeAll:"عرض الكل ↗", fromCommunity:"من المجتمع", openCommunity:"افتح المجتمع ↗", joinConversation:"شارك في النقاش ↗", discover:"اكتشف Raye2", everyFormat:"كل أنواع المحتوى. مجتمع واحد.", watchVideos:"شاهد الفيديوهات", findCreators:"ابحث عن المبدعين", creatorAccess:"دخول المبدعين", haveChannel:"لديك قناة؟", openStudio:"افتح استوديو المبدعين ↗", vote:"تصويت المجتمع", haveSay:"شارك برأيك"
  } : {
    search:"Search videos, creators and community", join:"Join Raye2", home:"Home", watch:"Watch", shorts:"Shorts", community:"Community", explore:"Explore", profile:"Your profile", saved:"Saved", notifications:"Notifications", studio:"Creator Studio", hero:"Watch what matters.", heroLine:"Be part of it.", heroBody:"Official creator videos, community-made Mini’s, and conversations — all connected in one place.", exploreVideos:"Explore videos ↗", joinCommunity:"Join the community", forYou:"For you", videos:"Videos", minis:"Mini’s", latest:"Latest from creators", seeAll:"See all ↗", fromCommunity:"From the community", openCommunity:"Open community ↗", joinConversation:"Join the conversation ↗", discover:"DISCOVER Raye2", everyFormat:"Every format. One community.", watchVideos:"Watch videos", findCreators:"Find creators", creatorAccess:"CREATOR ACCESS", haveChannel:"Have a channel?", openStudio:"Open Creator Studio ↗", vote:"COMMUNITY VOTE", haveSay:"HAVE YOUR SAY"
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
    const homeRefs=(videoRows??[]).flatMap(item=>{
      const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
      return media?.media_type==="video"&&media.storage_path?.startsWith("creator-media-public/")?[{bucketId:"creator-media-public",objectKey:media.storage_path.slice("creator-media-public/".length)}]:[];
    });
    const pooledHome=await resolvePublicObjectUrls(homeRefs);
    videos=(videoRows??[]).flatMap(item=>{
      const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
      if(!media||!media.is_published)return[];
      let src="",youtubeEmbedUrl:string|null=null;
      if(media.media_type==="video"){
        if(!media.storage_path?.startsWith("creator-media-public/"))return[];
        const parts=media.storage_path.split("/");
        if(parts.length<2)return[];
        src=pooledHome.get("creator-media-public\u0000"+media.storage_path.slice("creator-media-public/".length))??supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
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
    events=(Array.isArray(eventRows)?eventRows:[]).map((row:EventCard)=>({id:row.id,title:row.title,description:row.description,starts_at:row.starts_at,ends_at:row.ends_at,status:row.status,event_type:row.event_type,going_count:Number(row.going_count??0),host_count:Number(row.host_count??0),my_rsvp:!!row.my_rsvp,my_rsvp_status:row.my_rsvp_status??null}));
  }
  const videoSectionVisible = config.visibleSections.includes("videos");
  return <main dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"} className={`raye2-app-shell raye2-home-shell theme-${config.theme}`} data-motion={config.motion} data-color-mode={config.colorMode} data-display-font={config.displayFont} data-chalk-texture={config.chalkTexture} data-active-event={config.activeEvent ? "true" : "false"} data-wave-style={config.waveStyle} style={{ "--raye2-accent": config.accent, "--raye2-background-image": config.backgroundUrl ? `url("${config.backgroundUrl}")` : "none" } as CSSProperties}>{config.customFontUrl ? <style>{`@font-face{font-family:"Raye2CustomChalk";src:url("${config.customFontUrl}") format("${config.customFontUrl.endsWith(".woff2") ? "woff2" : config.customFontUrl.endsWith(".woff") ? "woff" : "truetype"}");font-display:swap;font-weight:100 900}`}</style> : null}
    <ShellTopBar locale={isArabic ? "ar" : "en"} mark={config.logoUrl ? <img className="site-logo-image" src={config.logoUrl} alt="" /> : null} />
    <div className="raye2-platform-grid">
      <ShellRail locale={isArabic ? "ar" : "en"} showVideos={videoSectionVisible} />
      <section className="raye2-feed-column">
        <section className="raye2-home-welcome raye2-card raye2-card-pad" id="hero">
          <span className="raye2-section-label">{localizedCopy(config.tagline, "", isArabic ? "ar" : "en")}</span>
          <h1>{localizedCopy(config.heroTitle, t.hero, isArabic ? "ar" : "en")}<br/><em>{t.heroLine}</em></h1>
          <p className="raye2-muted">{localizedCopy(config.heroBody, t.heroBody, isArabic ? "ar" : "en")}</p>{config.heroMediaUrl && (config.heroMediaType === "video" ? <video className="hero-media" src={config.heroMediaUrl} autoPlay muted={config.heroMuted} loop={config.heroLoop} playsInline /> : <img className="hero-media" src={config.heroMediaUrl} alt="" />)}{config.narrationUrl && config.featureFlags.voice && <NarrationControl src={config.narrationUrl} transcript={config.narrationText} autoPlay={config.narrationAutoPlay}/>}
          <div className="raye2-home-quicklinks"><Link className="button button-primary" href="/groups">{isArabic ? "استكشف المجموعات" : "Explore groups"}</Link><Link className="button button-secondary" href="/community">{t.joinCommunity}</Link></div>
        </section>
        
<nav className="raye2-launch-actions" aria-label={isArabic ? "ابدأ من هنا" : "Start here"}>{[
{ href: "/raye2", icon: "chat" as const, en: ["Messages", "Chat one-to-one or with friends"], ar: ["الرسائل", "تحدّث مع أصدقائك"] },
{ href: "/groups", icon: "hash" as const, en: ["Groups", "Rooms, voice and members"], ar: ["المجموعات", "غرف وصوت وأعضاء"] },
{ href: "/#poll", icon: "series" as const, en: ["Polls", "Vote and see live results"], ar: ["الاستطلاعات", "صوّت وتابع النتائج"] },
{ href: "/events", icon: "moment" as const, en: ["Events", "What is happening next"], ar: ["الفعاليات", "ما القادم"] }
].map(item => <Link key={item.href} href={item.href} className="raye2-launch-tile"><span className="raye2-launch-tile-icon"><ShellIcon name={item.icon} size={24} /></span><strong>{isArabic ? item.ar[0] : item.en[0]}</strong><small>{isArabic ? item.ar[1] : item.en[1]}</small></Link>)}</nav>
{config.visibleSections.includes("ideas") && config.featureFlags.ideas && <ApprovedIdeas />}{config.visibleSections.includes("events") && config.featureFlags.events && <PublicEvents initialEvents={events} locale={isArabic?"ar":"en"} />}{config.visibleSections.includes("socials") && <PublicSocialLinks />}
        <div className="raye2-feed-tabs"><Link className="active" href="/">{t.forYou}</Link><Link href="/groups">{isArabic ? "المجموعات" : "Groups"}</Link><Link href="/community">{t.community}</Link>{LAUNCH_MEDIA_VISIBLE && <Link href="/shorts">{t.minis}</Link>}</div>
        {config.visibleSections.includes("poll") && config.featureFlags.polls && <section className="raye2-card raye2-card-pad raye2-home-polls" id="poll" aria-labelledby="raye2-home-polls-title">
          <div className="raye2-card-heading"><div><span className="raye2-section-label">{t.vote}</span><h2 className="raye2-card-title" id="raye2-home-polls-title" style={{marginTop:6}}>{isArabic ? "صوّت وشارك في اختيار القادم." : "Your voice shapes what comes next."}</h2></div><span className="raye2-pill">{t.haveSay}</span></div>
          <PublishedPolls locale={isArabic?"ar":"en"} />
        </section>}
{LAUNCH_MEDIA_VISIBLE && <>        {config.visibleSections.includes("videos") && <PublicVideos />}
        <div className="raye2-card-heading"><h2 className="raye2-card-title">{t.latest}</h2><Link className="raye2-muted" href="/watch">{t.seeAll}</Link></div>
        {videos.length?<div className="raye2-home-video-grid">{videos.slice(0,8).map(video=><article className="raye2-home-video-card" key={video.id}>
          <Link className="raye2-home-video-player" href={"/watch/"+video.slug}><PublicVideoPlayer locale={isArabic?"ar":"en"} src={video.src} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/></Link>
          <div className="raye2-home-video-meta"><span className="raye2-section-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><small>{new Date(video.publishedAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</small></div>
        </article>)}</div>:<div className="raye2-card raye2-empty-state"><strong>{isArabic?"مساحة المشاهدة تستعد لاستقبال الفيديوهات.":"Your watch feed is getting ready."}</strong><p className="raye2-muted">{isArabic?"ستظهر هنا فيديوهات المبدعين الرسمية الجديدة.":"New official creator videos will appear here."}</p></div>}</>}
        <div className="raye2-card-heading"><h2 className="raye2-card-title">{t.fromCommunity}</h2><Link className="raye2-muted" href="/community">{t.openCommunity}</Link></div>
        {posts.length?posts.map(post=><article className="raye2-card raye2-home-post" key={post.id}><div className="raye2-post-header"><div className="raye2-avatar">{post.avatarUrl?<img src={post.avatarUrl} alt=""/>:post.displayName.slice(0,1).toUpperCase()}</div><div><strong>{post.displayName}</strong><div className="raye2-muted">@{post.handle} · {new Date(post.createdAt).toLocaleDateString()}</div></div></div><p className="raye2-post-body">{post.body}</p><Link className="raye2-action" href="/community">{t.joinConversation}</Link></article>):<div className="raye2-card raye2-empty-state"><p className="raye2-muted">{isArabic?"ستظهر هنا نقاشات المجتمع ومشاركاته الجديدة.":"Community conversations will appear here as people share."}</p><Link href="/community">{isArabic?"زيارة المجتمع ↗":"Visit community ↗"}</Link></div>}

      </section>
      <aside className="raye2-discovery-column">
{LAUNCH_MEDIA_VISIBLE && <section className="raye2-card raye2-card-pad"><span className="raye2-section-label">{t.discover}</span><h2 className="raye2-card-title">{t.everyFormat}</h2><p className="raye2-muted">{isArabic ? "فيديوهات المبدعين، ومقاطع المجتمع، واللحظات المشتركة والنقاشات." : "Long-form creator uploads, short community videos, shared moments and conversations."}</p><div className="raye2-home-discovery-links"><Link href="/watch">{t.watchVideos}</Link><Link href="/shorts">✦ {t.minis}</Link><Link href="/community">◉ {t.community}</Link><Link href="/search">{t.findCreators}</Link></div></section>}
        <section className="raye2-card raye2-card-pad"><span className="raye2-section-label">{t.creatorAccess}</span><h2 className="raye2-card-title">{t.haveChannel}</h2><p className="raye2-muted">{isArabic ? "يمكن للمبدعين المعتمدين نشر فيديوهاتهم وإدارة قنواتهم من استوديو Raye2." : "Approved creators can publish official videos and manage their channel from Raye2 Studio."}</p><Link className="button button-secondary" href="/creator/login">{t.openStudio}</Link></section>
      </aside>
    </div>
    {config.mascotUrl && config.featureFlags.mascot && <img className="raye2-floating-mascot" src={config.mascotUrl} alt="" aria-hidden="true"/>}
  </main>;
}
