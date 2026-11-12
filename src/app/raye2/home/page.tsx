import Link from "next/link";
import Image from "next/image";
import HomeFeedPost from "./home-feed-post";
import HomeFeedMore from "./home-feed-more";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

type FeedPost = { id:string; author_id:string; post_type:string; body:string; created_at:string };
type VideoCard = { id:string; slug:string; title:string; description:string; category:string; published_at:string; thumbnail_url:string|null; thumbnail_alt:string };
type LiveCard = { stream_id:string; title:string; handle:string|null; display_name:string|null; status:string; health:string; started_at:string|null; replay_until:string|null };
type RecCard = { slug:string; title:string; category:string; description:string; reason:string; matched_category:string|null };

export default async function Raye2HomePage({searchParams}:{searchParams:Promise<{feed?:string}>}) {
  const [{feed}, cookieStore]=await Promise.all([searchParams,cookies()]);
  const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
  const locale=isArabic?"ar":"en";
  const selectedFeed=feed==="following"?"following":"latest";
  const supabase=await createSupabaseServerClient();
  let posts:FeedPost[]=[];
  let authors=new Map<string,{handle:string;display_name:string;avatar_url:string|null}>();
  let videos:VideoCard[]=[];
  let liveNow:LiveCard[]=[];
  let recommended:RecCard[]=[];
  let memberId:string|null=null;
  const reactionCounts=new Map<string,number>();
  const myReactions=new Map<string,string>();
  const savedIds=new Set<string>();
  const followedAuthorIds=new Set<string>();
  if(supabase){
    const {data:claims}=await supabase.auth.getClaims();
    const subject=claims?.claims?.sub;
    memberId=typeof subject==="string"?subject:null;
    let followedIds:string[]|null=null;
    if(selectedFeed==="following"){
      if(memberId){
        const {data:follows}=await supabase.from("member_follows").select("followed_id").eq("follower_id",memberId);
        followedIds=(follows??[]).map(row=>row.followed_id);
      }else followedIds=[];
    }
    let query=supabase.from("community_posts").select("id,author_id,post_type,body,created_at").eq("status","published");
    if(followedIds!==null) query=followedIds.length?query.in("author_id",followedIds):query.in("author_id",["00000000-0000-0000-0000-000000000000"]);
    const [{data:postRows},{data:videoRows},{data:liveRows},{data:recRows}]=await Promise.all([
      query.order("pinned",{ascending:false}).order("created_at",{ascending:false}).limit(30),
      supabase.from("video_catalog").select("media_id,slug,description,category,published_at,thumbnail_media_id,media_items!video_catalog_media_id_fkey!inner(title,is_published,media_type),thumbnail:media_items!video_catalog_thumbnail_media_id_fkey(storage_path,is_published,media_type,alt_text)").not("published_at","is",null).eq("media_items.is_published",true).order("published_at",{ascending:false}).limit(4),
      supabase.rpc("raye2_get_live_now",{p_limit:4}),
      supabase.rpc("raye2_get_recommended_videos",{p_limit:4})
    ]);
    liveNow=(liveRows??[]) as LiveCard[];
    recommended=(recRows??[]) as RecCard[];
    posts=(postRows??[]) as FeedPost[];
    const authorIds=[...new Set(posts.map(post=>post.author_id))];
    if(authorIds.length){
      const {data:profiles}=await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id",authorIds);
      authors=new Map((profiles??[]).map(profile=>[profile.user_id,{handle:profile.handle,display_name:profile.display_name,avatar_url:profile.avatar_url}]));
    }
    if(posts.length){
      const postIds=posts.map(post=>post.id);
      const [counts,ownReactions,bookmarks,follows]=await Promise.all([
        supabase.rpc("get_community_reaction_counts",{p_post_ids:postIds}),
        memberId?supabase.from("community_reactions").select("post_id,reaction").eq("user_id",memberId).in("post_id",postIds):Promise.resolve({data:[]}),
        memberId?supabase.from("community_bookmarks").select("post_id").eq("user_id",memberId).in("post_id",postIds):Promise.resolve({data:[]}),
        memberId&&authorIds.length?supabase.from("member_follows").select("followed_id").eq("follower_id",memberId).in("followed_id",authorIds):Promise.resolve({data:[]})
      ]);
      for(const item of counts.data??[])reactionCounts.set(item.post_id,Number(item.reaction_count)||0);
      for(const item of ownReactions.data??[])myReactions.set(item.post_id,item.reaction);
      for(const item of bookmarks.data??[])savedIds.add(item.post_id);
      for(const item of follows.data??[])followedAuthorIds.add(item.followed_id);
    }
    videos=(videoRows??[]).flatMap(row=>{
      const media=Array.isArray(row.media_items)?row.media_items[0]:row.media_items;
      const thumbnail=Array.isArray(row.thumbnail)?row.thumbnail[0]:row.thumbnail;
      if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
      let thumbnailUrl:string|null=null;
      if(thumbnail?.is_published&&thumbnail.media_type==="image"&&thumbnail.storage_path?.startsWith("creator-media-public/")){
        const parts=thumbnail.storage_path.split("/");
        if(parts.length>1)thumbnailUrl=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
      }
      return[{id:row.media_id,slug:row.slug,title:media.title,description:row.description||"",category:row.category||"Video",published_at:row.published_at!,thumbnail_url:thumbnailUrl,thumbnail_alt:thumbnail?.alt_text||media.title}];
    });
  }
  return <main className={styles.shell} dir={isArabic?"rtl":"ltr"} lang={locale}>
    <header className={styles.topbar}>
      <Link className={styles.brandMark} href="/raye2/home" aria-label={isArabic?"الصفحة الرئيسية":"Raye2 home"}><span className={styles.brandGlyph}>R</span><span className={styles.brandPulse}/></Link>
      <div className={styles.topbarContext}><span className={styles.topbarEyebrow}>{isArabic?"مساحتك":"YOUR SPACE"}</span><strong>{isArabic?"اكتشف وتواصل":"Discover & connect"}</strong></div>
      <form className={styles.topbarSearch} action="/search"><span aria-hidden="true">⌕</span><input name="q" placeholder={isArabic?"ابحث عن فيديوهات وصُنّاع محتوى":"Search videos, creators and communities"} aria-label={isArabic?"بحث":"Search"}/><kbd>↵</kbd></form>
      <div className={styles.topbarActions}><Link href="/notifications" aria-label={isArabic?"الإشعارات":"Notifications"} className={styles.topbarIcon}>♧</Link><Link href="/profile" className={styles.profileShortcut}>{isArabic?"ملفي الشخصي":"My profile"} <span>↗</span></Link></div>
    </header>
    <div className={styles.layout}>
      <aside className={`${styles.rail} ${styles.leftRail}`}><span className={styles.railTitle}>{isArabic?"مساحتك / RAYE2":"YOUR SPACE / RAYE2"}</span>
        <Link className={`${styles.railLink} ${styles.railActive}`} href="/raye2/home"><span className={styles.railIcon}>⌂</span>{isArabic?"الرئيسية":"Home"}</Link>
        <Link className={styles.railLink} href="/watch"><span className={styles.railIcon}>▶</span>{isArabic?"مشاهدة":"Watch"}</Link>
        <Link className={styles.railLink} href="/shorts"><span className={styles.railIcon}>▤</span>{isArabic?"مقاطع قصيرة":"Mini’s"}</Link>
        <Link className={styles.railLink} href="/live"><span className={styles.railIcon}>●</span>{isArabic?"مباشر":"Live"}</Link>
        <Link className={styles.railLink} href="/search"><span className={styles.railIcon}>⌕</span>{isArabic?"استكشف":"Explore"}</Link>
        <Link className={styles.railLink} href="/series"><span className={styles.railIcon}>▥</span>{isArabic?"السلاسل":"Series"}</Link>
        <Link className={styles.railLink} href="/creators"><span className={styles.railIcon}>✦</span>{isArabic?"صُنّاع المحتوى":"Creators"}</Link>
        <Link className={styles.railLink} href="/groups"><span className={styles.railIcon}>#</span>{isArabic?"المساحات":"Spaces"}</Link>
        <Link className={styles.railLink} href="/community"><span className={styles.railIcon}>◉</span>{isArabic?"المجتمعات":"Communities"}</Link>
        <Link className={styles.railLink} href="/raye2"><span className={styles.railIcon}>✉</span>{isArabic?"الرسائل":"Messages"}</Link>
        <Link className={styles.railLink} href="/profile"><span className={styles.railIcon}>◎</span>{isArabic?"ملفي الشخصي":"My profile"}</Link>
      </aside>
      <section className={styles.main}>
        <section className={styles.welcome}><div className={styles.welcomeTopline}><span className={styles.eyebrow}>{isArabic?"مجتمع RAYE2 / الرئيسية":"RAYE2 COMMUNITY / HOME"}</span><span className={styles.liveDot}>{isArabic?"مساحتك":"YOUR SPACE"}</span></div><h1>{isArabic?"عالمك.":"Your world."}<br/><em>{isArabic?"مجتمعك.":"Your people."}</em></h1><p>{isArabic?"مساحة تجمع تحديثات صُنّاع المحتوى ونقاشات المجتمع والفيديوهات المميزة. اكتشف شيئًا جديدًا وشارك في الحوار.":"A connected place for creator updates, community conversations and videos worth your time. Find something new, then join the conversation."}</p>
          <div className={styles.welcomeActions}><Link className={`${styles.button} ${styles.buttonPrimary}`} href="/watch">{isArabic?"استكشف الفيديوهات ↗":"Explore videos ↗"}</Link><Link className={styles.button} href="/community">{isArabic?"افتح المجتمعات":"Open communities"}</Link></div>
        </section>
        {recommended.length?<><div className={styles.sectionHead}><h2>{isArabic?"مقترح لك":"Recommended for you"}</h2><span className={styles.count}>{isArabic?"مبني على اهتماماتك":"Tuned to your interests"}</span></div><div className={styles.videoGrid}>{recommended.map(item=><article className={styles.videoCard} key={item.slug}><Link href={`/watch/${item.slug}`}><div className={styles.videoFrame}><span aria-hidden="true">★</span><span className={styles.videoPlay} aria-hidden="true">▶</span></div><div className={styles.videoInfo}><span className={styles.eyebrow}>{item.category.toUpperCase()}</span><h3>{item.title}</h3><p>{item.reason==="based_on_watch_history"?(isArabic?`لأنك تشاهد ${item.matched_category??item.category}`:`Because you watch ${item.matched_category??item.category}`):(isArabic?"الأكثر رواجًا الآن":"Trending now")}</p></div></Link></article>)}</div></>:null}
        {liveNow.length?<><div className={styles.sectionHead}><h2>{isArabic?"مباشر الآن":"Live now"}</h2><Link className={styles.count} href="/live">{isArabic?"كل البث ↗":"View all live ↗"}</Link></div><div className={styles.videoGrid}>{liveNow.map(item=><article className={styles.videoCard} key={item.stream_id}><Link href={`/live/${item.stream_id}`}><div className={styles.videoFrame}><span aria-hidden="true">{item.status==="live"?"◉":"▷"}</span><span className={styles.videoPlay} aria-hidden="true">{item.status==="live"?"●":"▶"}</span></div><div className={styles.videoInfo}><span className={styles.eyebrow}>{item.status==="live"?(isArabic?"مباشر":"LIVE"):(isArabic?"إعادة":"REPLAY")}</span><h3>{item.title}</h3><p>{item.display_name??item.handle??""}</p></div></Link></article>)}</div></>:null}
        <div className={styles.sectionHead}><h2>{isArabic?"نُشر حديثًا":"Recently published"}</h2><Link className={styles.count} href="/watch">View all videos ↗</Link></div>
        {videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.videoCard} key={video.id}><Link href={`/watch/${video.slug}`}><div className={styles.videoFrame}>{video.thumbnail_url?<Image className={styles.videoThumbnail} src={video.thumbnail_url} alt={video.thumbnail_alt} fill sizes="(max-width: 720px) 100vw, 360px" unoptimized/>:<span aria-hidden="true">▶</span>}<span className={styles.videoPlay} aria-hidden="true">▶</span></div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p></div></Link></article>)}</div>:<div className={styles.empty}>{isArabic?"ستظهر فيديوهات المبدعين هنا عند نشرها.":"New creator videos will appear here when published."}</div>}
        <div className={styles.feedBar}><div><span className={styles.eyebrow}>{isArabic?"منشورات المجتمع":"COMMUNITY FEED"}</span><h2 style={{fontSize:19,margin:"6px 0 0"}}>{isArabic?"حوارات تستحق وقتك":"Conversations that matter"}</h2></div><div className={styles.feedTabs}><Link className={selectedFeed==="latest"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=latest">{isArabic?"الأحدث":"Latest"}</Link><Link className={selectedFeed==="following"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=following">{isArabic?"تتابعهم":"Following"}</Link></div></div>
        {posts.length?<>{posts.map(post=><HomeFeedPost key={post.id} post={post} author={authors.get(post.author_id)} isArabic={isArabic} currentUserId={memberId} initialCount={reactionCounts.get(post.id)??0} initialMine={myReactions.get(post.id)??null} initialSaved={savedIds.has(post.id)} initialFollowing={followedAuthorIds.has(post.author_id)}/>)}{posts.length>=30?<HomeFeedMore isArabic={isArabic} currentUserId={memberId} following={selectedFeed==="following"} before={posts[posts.length-1].created_at} beforeId={posts[posts.length-1].id}/>:null}</>:<div className={styles.empty}>{selectedFeed==="following"?(memberId?(isArabic?"لا توجد منشورات من الأشخاص الذين تتابعهم بعد. استكشف المجتمع وتابع بعض الأعضاء.":"No posts from followed creators yet. Explore the community and follow members to shape this feed."):(isArabic?"سجّل الدخول لمشاهدة منشورات من تتابعهم.":"Sign in to see posts from members you follow.")):(isArabic?"لا توجد منشورات مجتمعية منشورة بعد. عُد لاحقًا.":"No published community posts yet. Check back when creators and members start a conversation.")}</div>}
      </section>
      <aside className={`${styles.rail} ${styles.rightRail}`}><section className={styles.sideCard}><h2>Find your next thing</h2><form className={styles.search} action="/search"><input name="q" placeholder={isArabic?"ابحث عن صُنّاع المحتوى والفيديوهات":"Search creators and videos"}/><button type="submit">↗</button></form></section><section className={styles.sideCard}><h2>Explore Raye2</h2><Link className={styles.sideLink} href="/watch">{isArabic?"شاهد أحدث الفيديوهات":"Watch the latest videos"}</Link><Link className={styles.sideLink} href="/shorts">Discover Mini&apos;s</Link><Link className={styles.sideLink} href="/series">{isArabic?"تصفح السلاسل":"Browse series"}</Link><Link className={styles.sideLink} href="/community">{isArabic?"انضم إلى مساحات المجتمع":"Join community spaces"}</Link></section><section className={styles.sideCard}><h2>Be part of it</h2><p style={{fontSize:11,lineHeight:1.7,color:"var(--r-muted)"}}>{isArabic?"تابع صُنّاع المحتوى وشارك منشورات مفيدة واكتشف أصحاب الأعمال.":"Follow creators, share thoughtful posts and discover the people behind the work."}</p><Link className={styles.sideLink} href="/profile">{isArabic?"أكمل ملفك الشخصي ↗":"Set up your profile ↗"}</Link></section></aside>
    </div>
    <nav className={styles.mobileNav} aria-label={isArabic?"التنقل الرئيسي":"Main navigation"}>
      <Link className={styles.mobileNavActive} href="/raye2/home"><span>⌂</span>{isArabic?"الرئيسية":"Home"}</Link>
      <Link href="/watch"><span>▶</span>{isArabic?"مشاهدة":"Watch"}</Link>
      <Link href="/shorts"><span>▤</span>{isArabic?"مقاطع":"Mini’s"}</Link>
      <Link href="/community"><span>◉</span>{isArabic?"مجتمع":"Community"}</Link>
      <Link href="/profile"><span>◎</span>{isArabic?"ملفي":"Profile"}</Link>
    </nav>
  </main>;
}
