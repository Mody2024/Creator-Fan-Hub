import Link from "next/link";
import HomeFeedPost from "./home-feed-post";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

type FeedPost = { id:string; author_id:string; post_type:string; body:string; created_at:string };
type VideoCard = { id:string; slug:string; title:string; description:string; category:string; published_at:string };

export default async function Raye2HomePage({searchParams}:{searchParams:Promise<{feed?:string}>}) {
  const [{feed}, cookieStore]=await Promise.all([searchParams,cookies()]);
  const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
  const locale=isArabic?"ar":"en";
  const selectedFeed=feed==="following"?"following":"latest";
  const supabase=await createSupabaseServerClient();
  let posts:FeedPost[]=[];
  let authors=new Map<string,{handle:string;display_name:string;avatar_url:string|null}>();
  let videos:VideoCard[]=[];
  let memberId:string|null=null;
  let reactionCounts=new Map<string,number>();
  let myReactions=new Map<string,string>();
  let savedIds=new Set<string>();
  let followedAuthorIds=new Set<string>();
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
    const [{data:postRows},{data:videoRows}]=await Promise.all([
      query.order("pinned",{ascending:false}).order("created_at",{ascending:false}).limit(30),
      supabase.from("video_catalog").select("media_id,slug,description,category,published_at,media_items!inner(title,is_published,media_type)").not("published_at","is",null).eq("media_items.is_published",true).order("published_at",{ascending:false}).limit(4)
    ]);
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
      if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
      return[{id:row.media_id,slug:row.slug,title:media.title,description:row.description||"",category:row.category||"Video",published_at:row.published_at!}];
    });
  }
  return <main className={styles.shell} dir={isArabic?"rtl":"ltr"} lang={locale}>
    <div className={styles.layout}>
      <aside className={`${styles.rail} ${styles.leftRail}`}><span className={styles.railTitle}>RAYE2 / YOUR SPACE</span>
        <Link className={`${styles.railLink} ${styles.railActive}`} href="/raye2/home"><span className={styles.railIcon}>⌂</span>Home</Link>
        <Link className={styles.railLink} href="/watch"><span className={styles.railIcon}>▶</span>Watch</Link>
        <Link className={styles.railLink} href="/shorts"><span className={styles.railIcon}>▤</span>Mini&apos;s</Link>
        <Link className={styles.railLink} href="/search"><span className={styles.railIcon}>⌕</span>Explore</Link>
        <Link className={styles.railLink} href="/series"><span className={styles.railIcon}>▥</span>Series</Link>
        <Link className={styles.railLink} href="/community"><span className={styles.railIcon}>◉</span>Communities</Link>
        <Link className={styles.railLink} href="/raye2"><span className={styles.railIcon}>✉</span>Messages</Link>
        <Link className={styles.railLink} href="/profile"><span className={styles.railIcon}>◎</span>My profile</Link>
      </aside>
      <section className={styles.main}>
        <section className={styles.welcome}><span className={styles.eyebrow}>THE RAYE2 COMMUNITY / HOME</span><h1>{isArabic?"عالمك.":"Your world."}<br/><em>{isArabic?"مجتمعك.":"Your people."}</em></h1><p>{isArabic?"مساحة تجمع تحديثات صُنّاع المحتوى ونقاشات المجتمع والفيديوهات المميزة. اكتشف شيئًا جديدًا وشارك في الحوار.":"A connected place for creator updates, community conversations and videos worth your time. Find something new, then join the conversation."}</p>
          <div className={styles.welcomeActions}><Link className={`${styles.button} ${styles.buttonPrimary}`} href="/watch">Explore videos ↗</Link><Link className={styles.button} href="/community">Open communities</Link></div>
        </section>
        <div className={styles.sectionHead}><h2>{isArabic?"نُشر حديثًا":"Recently published"}</h2><Link className={styles.count} href="/watch">View all videos ↗</Link></div>
        {videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.videoCard} key={video.id}><Link href={`/watch/${video.slug}`}><div className={styles.videoFrame}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p></div></Link></article>)}</div>:<div className={styles.empty}>{isArabic?"ستظهر فيديوهات المبدعين هنا عند نشرها.":"New creator videos will appear here when published."}</div>}
        <div className={styles.feedBar}><div><span className={styles.eyebrow}>{isArabic?"منشورات المجتمع":"COMMUNITY FEED"}</span><h2 style={{fontSize:19,margin:"6px 0 0"}}>{isArabic?"حوارات تستحق وقتك":"Conversations that matter"}</h2></div><div className={styles.feedTabs}><Link className={selectedFeed==="latest"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=latest">{isArabic?"الأحدث":"Latest"}</Link><Link className={selectedFeed==="following"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=following">{isArabic?"تتابعهم":"Following"}</Link></div></div>
        {posts.length?posts.map(post=><HomeFeedPost key={post.id} post={post} author={authors.get(post.author_id)} isArabic={isArabic} currentUserId={memberId} initialCount={reactionCounts.get(post.id)??0} initialMine={myReactions.get(post.id)??null} initialSaved={savedIds.has(post.id)} initialFollowing={followedAuthorIds.has(post.author_id)}/>):<div className={styles.empty}>{selectedFeed==="following"?(memberId?(isArabic?"لا توجد منشورات من الأشخاص الذين تتابعهم بعد. استكشف المجتمع وتابع بعض الأعضاء.":"No posts from followed creators yet. Explore the community and follow members to shape this feed."):(isArabic?"سجّل الدخول لمشاهدة منشورات من تتابعهم.":"Sign in to see posts from members you follow.")):(isArabic?"لا توجد منشورات مجتمعية منشورة بعد. عُد لاحقًا.":"No published community posts yet. Check back when creators and members start a conversation.")}</div>}
      </section>
      <aside className={`${styles.rail} ${styles.rightRail}`}><section className={styles.sideCard}><h2>Find your next thing</h2><form className={styles.search} action="/search"><input name="q" placeholder={isArabic?"ابحث عن صُنّاع المحتوى والفيديوهات":"Search creators and videos"}/><button type="submit">↗</button></form></section><section className={styles.sideCard}><h2>Explore Raye2</h2><Link className={styles.sideLink} href="/watch">{isArabic?"شاهد أحدث الفيديوهات":"Watch the latest videos"}</Link><Link className={styles.sideLink} href="/shorts">Discover Mini's</Link><Link className={styles.sideLink} href="/series">{isArabic?"تصفح السلاسل":"Browse series"}</Link><Link className={styles.sideLink} href="/community">{isArabic?"انضم إلى مساحات المجتمع":"Join community spaces"}</Link></section><section className={styles.sideCard}><h2>Be part of it</h2><p style={{fontSize:11,lineHeight:1.7,color:"var(--r-muted)"}}>{isArabic?"تابع صُنّاع المحتوى وشارك منشورات مفيدة واكتشف أصحاب الأعمال.":"Follow creators, share thoughtful posts and discover the people behind the work."}</p><Link className={styles.sideLink} href="/profile">{isArabic?"أكمل ملفك الشخصي ↗":"Set up your profile ↗"}</Link></section></aside>
    </div>
  </main>;
}
