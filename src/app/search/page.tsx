import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import styles from "./search.module.css";

export const dynamic="force-dynamic";

type SearchParams={q?:string;type?:string;cat?:string;recency?:string};
type Profile={user_id:string;handle:string;display_name:string;bio:string};
type Post={id:string;body:string;created_at:string;author_id:string;post_type:string;author_title?:string;author_handle?:string};
type SearchRow={kind:"video"|"person"|"post"|"tag"|"group"|"short"|"moment"|"event";ref:string;title:string;subtitle:string;snippet:string;rank:number};
type TrendingPost={post_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;post_type:string;excerpt:string;reaction_count:number;comment_count:number;created_at:string};
type TrendingVideo={slug:string;title:string;category:string;description:string;view_count:number;reaction_count:number;comment_count:number;published_at:string};
type TrendingTag={tag:string;video_count:number};
type SearchFacet={category:string;total:number};

export default async function SearchPage({searchParams}:{searchParams:Promise<SearchParams>}){
 const [{q="",type="",cat="",recency=""},cookieStore]=await Promise.all([searchParams,cookies()]);
 const term=q.trim().slice(0,80);
 const selectedType=["videos","people","posts","tags","groups","minis","moments","events"].includes(type)?type:"all";
 const selectedCat=cat.trim().slice(0,40);
 const selectedRecency=["day","week","month","year"].includes(recency)?recency:"";
 const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";
 const isArabic=locale==="ar";
 const t=isArabic?{
  explore:"استكشف Raye2",headline:"اكتشف ما يستحق وقتك.",intro:"ابحث عن الفيديوهات وصُنّاع المحتوى ونقاشات المجتمع في مكان واحد.",placeholder:"ابحث عن فيديوهات وأشخاص ومنشورات…",search:"بحث",all:"الكل",videos:"الفيديوهات",people:"الأشخاص",posts:"منشورات المجتمع",tags:"الوسوم",noVideos:"لا توجد فيديوهات مطابقة.",noPeople:"لا يوجد أعضاء مطابقون.",noPosts:"لا توجد منشورات مطابقة.",noTags:"لا توجد وسوم مطابقة.",member:"عضو Raye2",official:"رسمي",watch:"شاهد",home:"الرئيسية",community:"المجتمع",mini:"Mini's",series:"السلاسل",empty:"ابدأ بالبحث عن صانع محتوى أو موضوع أو فيديو.",browse:"تصفح Raye2",discover:"اكتشف",results:"نتائج البحث عن",viewAll:"عرض الكل",groups:"المساحات",noGroups:"لا توجد مساحات مطابقة.",openGroup:"افتح المساحة",trending:"الأكثر رواجًا الآن",trendingVideos:"فيديوهات رائجة",trendingPosts:"نقاشات رائجة",trendingTags:"وسوم رائجة",views:"مشاهدة",reactions:"تفاعل",comments:"تعليق",noTrending:"سيظهر المحتوى الرائج هنا عندما ينشط المجتمع.",openPost:"افتح النقاش",categories:"الفئات",recency:"الفترة",anyTime:"أي وقت",allCats:"كل الفئات",today:"اليوم",thisWeek:"هذا الأسبوع",thisMonth:"هذا الشهر",thisYear:"هذا العام",noMinis:"لا توجد مقاطع Mini مطابقة.",openMini:"شاهد المقطع",category:"الفئة",moments:"اللحظات",noMoments:"لا توجد لحظات مطابقة.",events:"الفعاليات",noEvents:"لا توجد فعاليات مطابقة.",openEvent:"افتح الفعالية"
 }:{
  explore:"EXPLORE RAYE2",headline:"Find what moves you.",intro:"Search videos, creators and community conversations in one connected place.",placeholder:"Search videos, people and posts…",search:"Search",all:"All",videos:"Videos",people:"People",posts:"Community posts",tags:"Tags",noVideos:"No matching videos.",noPeople:"No matching members.",noPosts:"No matching posts.",noTags:"No matching tags.",member:"Raye2 member",official:"Official",watch:"Watch",home:"Home",community:"Community",mini:"Mini's",series:"Series",empty:"Start with a creator, a topic or a video.",browse:"Browse Raye2",discover:"Discover",results:"Search results for",viewAll:"View all",groups:"Spaces",noGroups:"No matching spaces.",openGroup:"Open space",trending:"Trending now",trendingVideos:"Trending videos",trendingPosts:"Trending conversations",trendingTags:"Trending tags",views:"views",reactions:"reactions",comments:"comments",noTrending:"Trending content will appear here as the community gets active.",openPost:"Open conversation",categories:"Categories",recency:"Recency",anyTime:"Any time",allCats:"All categories",today:"Today",thisWeek:"This week",thisMonth:"This month",thisYear:"This year",noMinis:"No matching Mini’s.",openMini:"Watch Mini",category:"Category",moments:"Moments",noMoments:"No matching Moments.",events:"Events",noEvents:"No matching events.",openEvent:"Open event"
 };
 const supabase=await createSupabaseServerClient();
 let profiles:Profile[]=[];
 let posts:Post[]=[];
 let videos:{slug:string;title:string;description:string;category:string}[]=[];
 let trendingVideos:TrendingVideo[]=[];
 let trendingPosts:TrendingPost[]=[];
 let trendingTags:TrendingTag[]=[];
 let tags:{tag:string}[]=[];
 let groups:{slug:string;name:string;description:string}[]=[];
 let shorts:{id:string;title:string;caption:string}[]=[];
 let facets:SearchFacet[]=[];
 let moments:{id:string;body:string;handle:string;name:string}[]=[];
 let events:{id:string;title:string;description:string;type:string}[]=[];
 const kindMap:Record<string,string>={videos:"video",people:"person",posts:"post",tags:"tag",groups:"group",minis:"short",moments:"moment",events:"event"};
 const kindParam=kindMap[selectedType]??"";
 if(supabase&&term){
  const [searchResult,facetsResult]=await Promise.all([
   supabase.rpc("raye2_search",{p_query:term,p_limit:40,p_kind:kindParam||null,p_category:selectedCat||null,p_recency:selectedRecency||null}),
   supabase.rpc("raye2_get_search_facets",{p_query:term})
  ]);
  const rows=(searchResult.data??[]) as SearchRow[];
  videos=rows.filter(row=>row.kind==="video").map(row=>({slug:row.ref,title:row.title,description:row.snippet,category:row.subtitle}));
  profiles=rows.filter(row=>row.kind==="person").map(row=>({user_id:row.ref,handle:row.subtitle.replace(/^@/,""),display_name:row.title,bio:row.snippet}));
  posts=rows.filter(row=>row.kind==="post").map(row=>({id:row.ref,body:row.snippet,created_at:"",author_id:"",post_type:"member",author_title:row.title,author_handle:row.subtitle.replace(/^@/,"")}));
  tags=rows.filter(row=>row.kind==="tag").map(row=>({tag:row.ref}));
  groups=rows.filter(row=>row.kind==="group").map(row=>({slug:row.ref,name:row.title,description:row.snippet}));
  shorts=rows.filter(row=>row.kind==="short").map(row=>({id:row.ref,title:row.title,caption:row.snippet}));
  moments=rows.filter(row=>row.kind==="moment").map(row=>({id:row.ref,body:row.snippet,handle:row.subtitle.replace(/^@/,""),name:row.title}));
  events=rows.filter(row=>row.kind==="event").map(row=>({id:row.ref,title:row.title,description:row.snippet,type:row.subtitle}));
  facets=((facetsResult.data??[]) as SearchFacet[]);
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
 const href=(next?:string,nextCat?:string,nextRecency?:string)=>{const params=new URLSearchParams({q:term});const tt=next??selectedType;if(tt!=="all")params.set("type",tt);const cc=nextCat??selectedCat;if(cc)params.set("cat",cc);const rr=nextRecency??selectedRecency;if(rr)params.set("recency",rr);return "/search?"+params.toString()};
 const showVideos=selectedType==="all"||selectedType==="videos";
 const showMinis=selectedType==="all"||selectedType==="minis";
 const showMoments=selectedType==="all"||selectedType==="moments";
 const showEvents=selectedType==="all"||selectedType==="events";
 const showPeople=selectedType==="all"||selectedType==="people";
 const showPosts=selectedType==="all"||selectedType==="posts";
 const showTags=selectedType==="all"||selectedType==="tags";
 const showGroups=selectedType==="all"||selectedType==="groups";
 return <main className={styles.page} dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className={styles.top}><Link className={styles.brand} href="/raye2/home">RAYE<span>2</span></Link><nav className={styles.topLinks}><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/community">{t.community}</Link></nav></header>
  <div className={styles.layout}>
       <aside className={styles.rail}><span className={styles.railLabel}>RAYE2 / DISCOVER</span><Link className={styles.railLink} href="/raye2/home">⌂ {t.home}</Link><Link className={styles.railLink} href="/watch">▶ {t.watch}</Link><Link className={styles.railLink} href="/shorts">▤ {t.mini}</Link><Link className={styles.railLink} href="/search">⌕ {t.discover}</Link><Link className={styles.railLink} href="/series">▥ {t.series}</Link><Link className={styles.railLink} href="/creators">✦ {isArabic?"صُنّاع المحتوى":"Creators"}</Link><Link className={styles.railLink} href="/community">◉ {t.community}</Link></aside>
   <section className={styles.main}>
    <section className={styles.hero}><span className={styles.eyebrow}>{t.explore}</span><h1>{t.headline}</h1><p>{t.intro}</p><form className={styles.searchForm} action="/search"><input name="q" type="search" maxLength={80} defaultValue={term} placeholder={t.placeholder} aria-label={t.placeholder}/><button type="submit">{t.search} ↗</button></form></section>
    {term?<><div className={styles.tabs}><Link className={selectedType==="all"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("all")}>{t.all}</Link><Link className={selectedType==="videos"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("videos")}>{t.videos}</Link><Link className={selectedType==="people"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("people")}>{t.people}</Link><Link className={selectedType==="posts"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("posts")}>{t.posts}</Link><Link className={selectedType==="tags"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("tags")}>{t.tags}</Link><Link className={selectedType==="minis"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("minis")}>{t.mini}</Link><Link className={selectedType==="moments"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("moments")}>{t.moments}</Link><Link className={selectedType==="events"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("events")}>{t.events}</Link><Link className={selectedType==="groups"?`${styles.tab} ${styles.tabActive}`:styles.tab} href={href("groups")}>{t.groups}</Link></div><span className={styles.eyebrow}>{t.results} “{term}”</span><div className={styles.filters}><div className={styles.filterGroup}><span className={styles.filterLabel}>{t.categories}</span><Link className={!selectedCat?styles.chipActive:styles.chip} href={href(selectedType,"","")}>{t.allCats}</Link>{facets.map(f=><Link key={f.category} className={selectedCat===f.category?styles.chipActive:styles.chip} href={href(selectedType,f.category)}>{f.category}<span>{Number(f.total)}</span></Link>)}</div><div className={styles.filterGroup}><span className={styles.filterLabel}>{t.recency}</span><Link className={!selectedRecency?styles.chipActive:styles.chip} href={href(selectedType,undefined,"")}>{t.anyTime}</Link>{(["day","week","month","year"] as const).map(r=><Link key={r} className={selectedRecency===r?styles.chipActive:styles.chip} href={href(selectedType,undefined,r)}>{r==="day"?t.today:r==="week"?t.thisWeek:r==="month"?t.thisMonth:t.thisYear}</Link>)}</div></div></>:<div className={styles.tabs}><span className={`${styles.tab} ${styles.tabActive}`}>{t.discover}</span><span className={styles.tab}>{t.videos}</span><span className={styles.tab}>{t.people}</span><span className={styles.tab}>{t.posts}</span><span className={styles.tab}>{t.tags}</span></div>}
    {!term&&<section className={styles.section} aria-label={t.trending}><div className={styles.sectionHead}><h2>{t.trending}</h2></div>{trendingTags.length>0&&<div className={styles.tagRow}>{trendingTags.map(tag=><Link className={styles.tag} key={tag.tag} href={"/search?q="+encodeURIComponent(tag.tag)}>#{tag.tag}<span>{Number(tag.video_count)}</span></Link>)}</div>}{trendingVideos.length>0&&<><div className={styles.sectionHead}><h3>{t.trendingVideos}</h3><Link className={styles.count} href="/watch">{t.viewAll} ↗</Link></div><div className={styles.videoGrid}>{trendingVideos.map(video=><article className={styles.video} key={video.slug}><Link href={"/watch/"+video.slug}><div className={styles.thumb}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p><small className={styles.metrics}>{Number(video.view_count)} {t.views} · {Number(video.reaction_count)} {t.reactions} · {Number(video.comment_count)} {t.comments}</small></div></Link></article>)}</div></>}{trendingPosts.length>0&&<><div className={styles.sectionHead}><h3>{t.trendingPosts}</h3><Link className={styles.count} href="/community">{t.viewAll} ↗</Link></div><div className={styles.resultList}>{trendingPosts.map(post=><Link className={styles.result} key={post.post_id} href={"/community#post-"+post.post_id}><span className={styles.resultIcon}>{post.post_type==="official"?"✦":"◉"}</span><span className={styles.resultText}><strong>{post.author_display_name??t.member} · @{post.author_handle??"member"}</strong><small>{post.excerpt}</small><small className={styles.metrics}>{Number(post.reaction_count)} {t.reactions} · {Number(post.comment_count)} {t.comments}</small></span><b className={styles.arrow}>↗</b></Link>)}</div></>}{trendingVideos.length===0&&trendingPosts.length===0&&trendingTags.length===0&&<div className={styles.empty}>{t.noTrending}</div>}</section>}
    {showVideos&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.videos}</h2><Link className={styles.count} href="/watch">{t.viewAll} ↗</Link></div>{videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.video} key={video.slug}><Link href={"/watch/"+video.slug}><div className={styles.thumb}>▶</div><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p></div></Link></article>)}</div>:<div className={styles.empty}>{term?t.noVideos:t.empty}</div>}</section>}
    {showPeople&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.people}</h2><span className={styles.count}>{profiles.length}</span></div>{profiles.length?<div className={styles.resultList}>{profiles.map(person=><Link className={styles.result} key={person.user_id} href={"/u/"+person.handle}><span className={styles.resultIcon}>◎</span><span className={styles.resultText}><strong>{person.display_name}</strong><small>@{person.handle} · {person.bio||t.member}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noPeople:t.empty}</div>}</section>}
    {showPosts&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.posts}</h2><span className={styles.count}>{posts.length}</span></div>{posts.length?<div className={styles.resultList}>{posts.map(post=><Link className={styles.result} key={post.id} href={"/community#post-"+post.id}><span className={styles.resultIcon}>◉</span><span className={styles.resultText}><strong>{post.author_title??t.member} · @{post.author_handle??"member"}</strong><small>{post.body}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noPosts:t.empty}</div>}</section>}
    {showTags&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.tags}</h2><span className={styles.count}>{tags.length}</span></div>{tags.length?<div className={styles.tagRow}>{tags.map(tag=><Link className={styles.tag} key={tag.tag} href={"/topics/"+encodeURIComponent(tag.tag)}>#{tag.tag}</Link>)}</div>:<div className={styles.empty}>{term?t.noTags:t.empty}</div>}</section>}
{showMinis&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.mini}</h2><span className={styles.count}>{shorts.length}</span></div>{shorts.length?<div className={styles.resultList}>{shorts.map(short=><Link className={styles.result} key={short.id} href="/shorts"><span className={styles.resultIcon}>▤</span><span className={styles.resultText}><strong>{short.title}</strong><small>{short.caption||t.openMini}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noMinis:t.empty}</div>}</section>}
  {showMoments&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.moments}</h2><span className={styles.count}>{moments.length}</span></div>{moments.length?<div className={styles.resultList}>{moments.map(moment=><Link className={styles.result} key={moment.id} href={"/community#post-"+moment.id}><span className={styles.resultIcon}>✦</span><span className={styles.resultText}><strong>{moment.name} · @{moment.handle}</strong><small>{moment.body}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noMoments:t.empty}</div>}</section>}
  {showEvents&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.events}</h2><span className={styles.count}>{events.length}</span></div>{events.length?<div className={styles.resultList}>{events.map(ev=><Link className={styles.result} key={ev.id} href="/events"><span className={styles.resultIcon}>◈</span><span className={styles.resultText}><strong>{ev.title}</strong><small>{ev.description||t.openEvent}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noEvents:t.empty}</div>}</section>}
  {showGroups&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t.groups}</h2><span className={styles.count}>{groups.length}</span></div>{groups.length?<div className={styles.resultList}>{groups.map(group=><Link className={styles.result} key={group.slug} href={"/groups/"+group.slug}><span className={styles.resultIcon}>#</span><span className={styles.resultText}><strong>{group.name}</strong><small>{group.description||t.openGroup}</small></span><b className={styles.arrow}>↗</b></Link>)}</div>:<div className={styles.empty}>{term?t.noGroups:t.empty}</div>}</section>}
   </section>
   <aside className={styles.side}><section className={styles.sideCard}><h2>{t.browse}</h2><Link href="/watch">{t.videos} ↗</Link><Link href="/shorts">{t.mini} ↗</Link><Link href="/series">{t.series} ↗</Link><Link href="/community">{t.community} ↗</Link></section><section className={styles.sideCard}><h2>{t.discover}</h2><p>{isArabic?"اكتشف أعمالًا جديدة وتعرّف على صُنّاع المحتوى وشارك في النقاشات.":"Find new work, meet creators and join conversations across Raye2."}</p><Link href="/raye2/home">{t.home} ↗</Link></section></aside>
  </div>
 </main>;
}
