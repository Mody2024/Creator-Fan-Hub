import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

type FeedPost = { id:string; author_id:string; post_type:string; body:string; created_at:string };
type VideoCard = { id:string; slug:string; title:string; description:string; category:string; published_at:string };

export default async function Raye2HomePage({searchParams}:{searchParams:Promise<{feed?:string}>}) {
  const {feed}=await searchParams;
  const selectedFeed=feed==="following"?"following":"latest";
  const supabase=await createSupabaseServerClient();
  let posts:FeedPost[]=[];
  let authors=new Map<string,{handle:string;display_name:string}>();
  let videos:VideoCard[]=[];
  let memberId:string|null=null;
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
      const {data:profiles}=await supabase.from("member_profiles").select("user_id,handle,display_name").in("user_id",authorIds);
      authors=new Map((profiles??[]).map(profile=>[profile.user_id,{handle:profile.handle,display_name:profile.display_name}]));
    }
    videos=(videoRows??[]).flatMap(row=>{
      const media=Array.isArray(row.media_items)?row.media_items[0]:row.media_items;
      if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
      return[{id:row.media_id,slug:row.slug,title:media.title,description:row.description||"",category:row.category||"Video",published_at:row.published_at!}];
    });
  }
  const isArabic=false;
  return <main className={styles.shell} dir="ltr">
    <div className={styles.layout}>
      <aside className={`${styles.rail} ${styles.leftRail}`}><span className={styles.railTitle}>RAYE2 / YOUR SPACE</span>
        <Link className={`${styles.railLink} ${styles.railActive}`} href="/raye2/home"><span className={styles.railIcon}>⌂</span>Home</Link>
        <Link className={styles.railLink} href="/watch"><span className={styles.railIcon}>▶</span>Watch</Link>
        <Link className={styles.railLink} href="/shorts"><span className={styles.railIcon}>▤</span>Mini's</Link>
        <Link className={styles.railLink} href="/search"><span className={styles.railIcon}>⌕</span>Explore</Link>
        <Link className={styles.railLink} href="/series"><span className={styles.railIcon}>▥</span>Series</Link>
        <Link className={styles.railLink} href="/community"><span className={styles.railIcon}>◉</span>Communities</Link>
        <Link className={styles.railLink} href="/raye2"><span className={styles.railIcon}>✉</span>Messages</Link>
        <Link className={styles.railLink} href="/profile"><span className={styles.railIcon}>◎</span>My profile</Link>
      </aside>
      <section className={styles.main}>
        <section className={styles.welcome}><span className={styles.eyebrow}>THE RAYE2 COMMUNITY / HOME</span><h1>Your world.<br/><em>Your people.</em></h1><p>A connected place for creator updates, community conversations and videos worth your time. Find something new, then join the conversation.</p>
          <div className={styles.welcomeActions}><Link className={`${styles.button} ${styles.buttonPrimary}`} href="/watch">Explore videos ↗</Link><Link className={styles.button} href="/community">Open communities</Link></div>
        </section>
        <div className={styles.sectionHead}><h2>Recently published</h2><Link className={styles.count} href="/watch">View all videos ↗</Link></div>
        {videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.videoCard} key={video.id}><Link href={`/watch/${video.slug}`}><div className={styles.videoFrame}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p></div></Link></article>)}</div>:<div className={styles.empty}>New creator videos will appear here when published.</div>}
        <div className={styles.feedBar}><div><span className={styles.eyebrow}>COMMUNITY FEED</span><h2 style={{fontSize:19,margin:"6px 0 0"}}>Conversations that matter</h2></div><div className={styles.feedTabs}><Link className={selectedFeed==="latest"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=latest">Latest</Link><Link className={selectedFeed==="following"?`${styles.feedTab} ${styles.feedTabActive}`:styles.feedTab} href="/raye2/home?feed=following">Following</Link></div></div>
        {posts.length?posts.map(post=>{const author=authors.get(post.author_id);return <article className={styles.post} key={post.id}><div className={styles.postHead}><div className={styles.avatar}>{(author?.display_name??"R").slice(0,1).toUpperCase()}</div><div><Link className={styles.author} href={author?.handle?`/u/${author.handle}`:"/community"}>{author?.display_name??"Raye2 member"}</Link><div className={styles.handle}>@{author?.handle??"member"} · <time className={styles.date} dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString("en",{month:"short",day:"numeric"})}</time></div></div><span className={styles.postType}>{post.post_type==="official"?"OFFICIAL":"COMMUNITY"}</span></div><p className={styles.body}>{post.body}</p><div className={styles.postFoot}><Link href="/community">Open discussion ↗</Link><Link href={`/u/${author?.handle??""}`}>View profile</Link></div></article>;}):<div className={styles.empty}>{selectedFeed==="following"?(memberId?"No posts from followed creators yet. Explore the community and follow members to shape this feed.":"Sign in to see posts from members you follow."):"No published community posts yet. Check back when creators and members start a conversation."}</div>}
      </section>
      <aside className={`${styles.rail} ${styles.rightRail}`}><section className={styles.sideCard}><h2>Find your next thing</h2><form className={styles.search} action="/search"><input name="q" placeholder="Search creators and videos"/><button type="submit">↗</button></form></section><section className={styles.sideCard}><h2>Explore Raye2</h2><Link className={styles.sideLink} href="/watch">Watch the latest videos</Link><Link className={styles.sideLink} href="/shorts">Discover Mini's</Link><Link className={styles.sideLink} href="/series">Browse series</Link><Link className={styles.sideLink} href="/community">Join community spaces</Link></section><section className={styles.sideCard}><h2>Be part of it</h2><p style={{fontSize:11,lineHeight:1.7,color:"var(--r-muted)"}}>Follow creators, share thoughtful posts and discover the people behind the work.</p><Link className={styles.sideLink} href="/profile">Set up your profile ↗</Link></section></aside>
    </div>
  </main>;
}
