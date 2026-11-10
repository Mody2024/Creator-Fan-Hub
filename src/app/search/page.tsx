import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import styles from "./search.module.css";

export const dynamic="force-dynamic";

type SearchParams={q?:string;type?:string};
type Profile={user_id:string;handle:string;display_name:string;bio:string};
type Post={id:string;body:string;created_at:string;author_id:string;post_type:string;author_title?:string;author_handle?:string};
type SearchRow={kind:"video"|"person"|"post"|"tag";ref:string;title:string;subtitle:string;snippet:string;rank:number};
type TrendingPost={post_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;post_type:string;excerpt:string;reaction_count:number;comment_count:number;created_at:string};
type TrendingVideo={slug:string;title:string;category:string;description:string;view_count:number;reaction_count:number;comment_count:number;published_at:string};
type TrendingTag={tag:string;video_count:number};

export default async function SearchPage({searchParams}:{searchParams:Promise<SearchParams>}){
 const [{q="",type=""},cookieStore]=await Promise.all([searchParams,cookies()]);
 const term=q.trim().slice(0,80);
 const selectedType=["videos","people","posts","tags"].includes(type)?type:"all";
 const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";
 const isArabic=locale==="ar";
 const t=isArabic?{
  explore:"استكشف Raye2",headline:"اكتشف ما يستحق وقتك.",intro:"ابحث عن الفيديوهات وصُنّاع المحتوى ونقاشات المجتمع في مكان واحد.",placeholder:"ابحث عن فيديوهات وأشخاص ومنشورات…",search:"بحث",all:"الكل",videos:"الفيديوهات",people:"الأشخاص",posts:"منشورات المجتمع",tags:"الوسوم",noVideos:"لا توجد فيديوهات مطابقة.",noPeople:"لا يوجد أعضاء مطابقون.",noPosts:"لا توجد منشورات مطابقة.",noTags:"لا توجد وسوم مطابقة.",member:"عضو Raye2",official:"رسمي",watch:"شاهد",home:"الرئيسية",community:"المجتمع",mini:"Mini's",series:"السلاسل",empty:"ابدأ بالبحث عن صانع محتوى أو موضوع أو فيديو.",browse:"تصفح Raye2",discover:"اكتشف",results:"نتائج البحث عن",viewAll:"عرض الكل",trending:"الأكثر رواجًا الآن",trendingVideos:"فيديوهات رائجة",trendingPosts:"نقاشات رائجة",trendingTags:"وسوم رائجة",views:"مشاهدة",reactions:"تفاعل",comments:"تعليق",noTrending:"سيظهر المحتوى الرائج هنا عندما ينشط المجتمع.",openPost:"افتح النقاش"
 }:{
  explore:"EXPLORE RAYE2",headline:"Find what moves you.",intro:"Search videos, creators and community conversations in one connected place.",placeholder:"Search videos, people and posts…",search:"Search",all:"All",videos:"Videos",people:"People",posts:"Community posts",tags:"Tags",noVideos:"No matching videos.",noPeople:"No matching members.",noPosts:"No matching posts.",noTags:"No matching tags.",member:"Raye2 member",official:"Official",watch:"Watch",home:"Home",community:"Community",mini:"Mini's",series:"Series",empty:"Start with a creator, a topic or a video.",browse:"Browse Raye2",discover:"Discover",results:"Search results for",viewAll:"View all",trending:"Trending now",trendingVideos:"Trending videos",trendingPosts:"Trending conversations",trendingTags:"Trending tags",views:"views",reactions:"reactions",comments:"comments",noTrending:"Trending content will appear here as the community gets active.",openPost:"Open conversation"
 };
 const supabase=await createSupabaseServerClient();
 let profiles:Profile[]=[];
 let posts:Post[]=[];
 let videos:{slug:string;title:string;description:string;category:string}[]=[];
 let trendingVideos:TrendingVideo[]=[];
 let trendingPosts:TrendingPost[]=[];
 let trendingTags:TrendingTag[]=[];
 let tags:{tag:string}[]=[];
 if(supabase&&term){
  const {data}=await supabase.rpc("raye2_search",{p_query:term,p_limit:40});
  const rows=(data??[]) as SearchRow[];
  videos=rows.filter(row=>row.kind==="video").map(row=>({slug:row.ref,title:row.title,description:row.snippet,category:row.subtitle}));
  profiles=rows.filter(row=>row.kind==="person").map(row=>({user_id:row.ref,handle:row.subtitle.replace(/^@/,""),display_name:row.title,bio:row.snippet}));
  posts=rows.filter(row=>row.kind==="post").map(row=>({id:row.ref,body:row.snippet,created_at:"",author_id:"",post_type:"member",author_title:row.title,author_handle:row.subtitle.replace(/^@/,"")}));
  tags=rows.filter(row=>row.kind==="tag").map(row=>({tag:row.ref}));
 }
 if(supabase&&!term){
  const [videosResult,postsResult,tagsResult]=await Promise.all([
   supabase.rpc("raye2_get_trending_videos",{p_limit:6,p_window_days:90}),
   supabase.rpc("raye2_get_trending_posts",{p_limit:6,p_window_hours:336}),
   supabase.rpc("raye2_get_trending_tags",{p_limit:12,p_window_days:180})
  ]);
  trendingVideos=(videosResult.data??[]) as TrendingVideo[];
  trendingPosts=(postsResult.data??[]) as TrendingPost[];
  trendingTags=(tagsResult.data??[]) as TrendingTag[];
 }
 const query=(next:string)=>`/search?q=${encodeURIComponent(term)}${next==="all"?"": "&type="+next}`;
 const showVideos=selectedType==="all"||selectedType==="videos";
 const showPeople=selectedType==="all"||selectedType==="people";
 const showPosts=selectedType==="all"||selectedType==="posts";
 const showTags=selectedType==="all"||selectedType==="tags";
 return <main className={styles.page} dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className={styles.top}><Link className={styles.brand} href="/raye2/home">RAYE<span>2</span></Link><nav className={styles.topLinks}><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/community">{t.community}</Link></nav></header>
  <div className={styles.layout}>
       <aside className={styles.rail}><span className={styles.railLabel}>RAYE2 / DISCOVER</span><Link className={styles.railLink} href="/raye2/home">⌂ {t.home}</Link><Link className={styles.railLink} href="/watch">▶ {t.watch}</Link><Link className={styles.railLink} href="/shorts">▤ {t.mini}</Link><Link className={styles.railLink} href="/search">⌕ {t.discover}</Link><Link className={styles.railLink} href="/series">▥ {t.series}</Link><Link className={styles.railLink} href="/creators">✦ {isArabic?"صُنّاع المحتوى":"Creators"}</Link><Link className={styles.railLink} href="/community">◉ {t.community}</Link></aside>
   <section className={styles.main}>
    <section className={styles.hero}><span className={styles.eyebrow}>{t.explore}</span><h1>{t.headline}</h1><p>{t.intro}</p><form className={styles.searchForm} action="/search"><input name="q" type="search" maxLength={80} defaultValue={term} placeholder={t.placeholder} aria-label={t.placeholder}/><button type="submit">{t.search} ↗</button></form></section>
    {term?<><div className={styles.tabs}><Link className={selectedType==="all"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={query("all")}>{t.all}</Link><Link className={selectedType==="videos"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={query("videos")}>{t.videos}</Link><Link className={selectedType==="people"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={query("people")}>{t.people}</Link><Link className={selectedType==="posts"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={query("posts")}>{t.posts}</Link><Link className={selectedType==="tags"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={query("tags")}>{t.tags}</Link></div><span className={styles.eyebrow}>{t.results} “{term}”</span></>:<div className={styles.tabs}><span className={`${styles.tab} ${styles.tabActive}`}>{t.discover}</span><span className={styles.tab}>{t.videos}</span><span className={styles.tab}>{t.people}</span><span className={styles.tab}>{t.posts}</span><span className={styles.tab}>{t.tags}</span></div>}
    {!term&&<section className={styles.section} aria-label={t.trending}><div className={styles.sectionHead}><h2>{t.trending}</h2></div>{trendingTags.length>0&&<div className={styles.tagRow}>{trendingTags.map(tag=><Link className={styles.tag} key={tag.tag} href={"/search?q="+encodeURIComponent(tag.tag)}>#{tag.tag}<span>{Number(tag.video_count)}</span></Link>)}</div>}{trendingVideos.length>0&&<><div className={styles.sectionHead}><h3>{t.trendingVideos}</h3><Link className={styles.count} href="/watch">{t.viewAll} ↗</Link></div><div className={styles.videoGrid}>{trendingVideos.map(video=><article className={styles.video} key={video.slug}><Link href={"/watch/"+video.slug}><div className={styles.thumb}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p><small className={styles.metrics}>{Number(video.view_count)} {t.views} · {Number(video.reaction_count)} {t.reactions} · {Number(video.comment_count)} {t.comments}</small></div></Link></article>)}</div></>}{trendingPosts.length>0&&<><div className={styles.sectionHead}><h3>{t.trendingPosts}</h3><Link className={styles.count} href="/community">{t.viewAll} ↗</Link></div><div className={styles.resultList}>{trendingPosts.map(post=><Link className={styles.result} key={post.post_id} href={"/community#post-"+post.post_id}><span className={styles.resultIcon}>{post.post_type==="official"?"✦":"◉"}</span><span className={styles.resultText}><strong>{post.author_display_name??t.member} · @{post.author_handle??"member"}</strong><small>{post.excerpt}</small><small className={styles.metrics}>{Number(post.reaction_count)} {t.reactions} · {Number(post.comment_count)} {t.comments}</small></span><b className={styles.arrow}>↗</b></Link>)}</div></>}{trendingVideos.length===0&&trendingPosts.length===0&&trendingTags.length===0&&<div className={styles.empty}>{t.noTrending}</div>}</section>}
    {showVideos&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.videos}</h2><Link className={styles.count} href="/watch">{t.viewAll} ↗</Link></div>{videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.video} key={video.slug}><Link href={"/watch/"+video.slug}><div className={styles.thumb}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p></div></Link></article>)}</div>:<div className={styles.empty}>{term?t.noVideos:t.empty}</div>}</section>}
    {showPeople&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.people}</h2><span className={styles.count}>{profiles.length}</span></div>{profiles.length?<div className={styles.resultList}>{profiles.map(person=><Link className={styles.result} key={person.user_id} href={"/u/"+person.handle}><span className={styles.resultIcon}>◎</span><span className={styles.resultText}><strong>{person.display_name}</strong><small>@{person.handle} · {person.bio||t.member}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noPeople:t.empty}</div>}</section>}
    {showPosts&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.posts}</h2><span className={styles.count}>{posts.length}</span></div>{posts.length?<div className={styles.resultList}>{posts.map(post=><Link className={styles.result} key={post.id} href={"/community#post-"+post.id}><span className={styles.resultIcon}>◉</span><span className={styles.resultText}><strong>{post.author_title??t.member} · @{post.author_handle??"member"}</strong><small>{post.body}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noPosts:t.empty}</div>}</section>}
    {showTags&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.tags}</h2><span className={styles.count}>{tags.length}</span></div>{tags.length?<div className={styles.tagRow}>{tags.map(tag=><Link className={styles.tag} key={tag.tag} href={"/topics/"+encodeURIComponent(tag.tag)}>#{tag.tag}</Link>)}</div>:<div className={styles.empty}>{term?t.noTags:t.empty}</div>}</section>}
   </section>
   <aside className={styles.side}><section className={styles.sideCard}><h2>{t.browse}</h2><Link href="/watch">{t.videos} ↗</Link><Link href="/shorts">{t.mini} ↗</Link><Link href="/series">{t.series} ↗</Link><Link href="/community">{t.community} ↗</Link></section><section className={styles.sideCard}><h2>{t.discover}</h2><p>{isArabic?"اكتشف أعمالًا جديدة وتعرّف على صُنّاع المحتوى وشارك في النقاشات.":"Find new work, meet creators and join conversations across Raye2."}</p><Link href="/raye2/home">{t.home} ↗</Link></section></aside>
  </div>
 </main>;
}
