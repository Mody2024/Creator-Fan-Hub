import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {resolvePublicObjectUrls} from "@/lib/storage/resolve.server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import WatchLibraryMore from "./watch-library-more";
import {buildWatchCard,type WatchRow} from "./watch-library-media";
import ContinueWatching from "./continue-watching";
import "./watch-library.css";
export const dynamic="force-dynamic";
export default async function WatchLibraryPage(){
 const ar=(await cookies()).get("raye2_locale")?.value==="ar";
 const t=ar?{unavailable:"مشاهدة Raye2 غير متاحة مؤقتًا.",label:"RAYE2 / مشاهدة",h1a:"قصص تستحق",h1b:"وقتك.",intro:"اكتشف الفيديوهات التي ينشرها المبدعون عبر Raye2. شاهد وتفاعل واحفظ وشارك في النقاش.",published:"نشره المبدعون",video:"فيديو",videos:"فيديوهات",library:"المكتبة",latest:"أحدث الفيديوهات",available:"متاح",official:"رسمي",emptyTitle:"فيديو مفضلك القادم في الطريق.",emptyBody:"لا توجد فيديوهات منشورة بعد. عد قريبًا.",explore:"استكشف المزيد",findTitle:"اعثر على لحظتك القادمة.",findBody:"تعرّف على المبدعين واكتشف المجتمعات وجد ما يستحق المشاركة.",minis:"استكشف المقاطع القصيرة",communities:"انضم إلى المجتمعات"}:{unavailable:"Raye2 Watch is temporarily unavailable.",label:"RAYE2 / WATCH",h1a:"Stories worth",h1b:"your time.",intro:"Discover videos published by creators across Raye2. Watch, react, save and join the conversation.",published:"CREATOR PUBLISHED",video:"VIDEO",videos:"VIDEOS",library:"THE LIBRARY",latest:"Latest videos",available:"available",official:"OFFICIAL",emptyTitle:"Your next favourite video is on its way.",emptyBody:"There are no published videos available yet. Check back soon.",explore:"EXPLORE MORE",findTitle:"Find your next moment.",findBody:"Meet creators, discover communities and find something worth sharing.",minis:"Explore Minis",communities:"Join communities"};
 const supabase=await createSupabaseServerClient();
 if(!supabase)return <main className="raye2-app-shell"><p>{t.unavailable}</p></main>;
 const {data}=await supabase.rpc("raye2_get_watch_library_page",{p_limit:24});
 const rows=(data??[]) as WatchRow[];
 const pooledRefs:Array<{bucketId:string;objectKey:string}>=rows.flatMap(row=>{
  const refs:Array<{bucketId:string;objectKey:string}>=[];
  if(row.storage_path?.startsWith("creator-media-public/"))refs.push({bucketId:"creator-media-public",objectKey:row.storage_path.slice("creator-media-public/".length)});
  if(row.thumbnail_path?.startsWith("creator-media-public/"))refs.push({bucketId:"creator-media-public",objectKey:row.thumbnail_path.slice("creator-media-public/".length)});
  return refs;
 });
 const pooled=await resolvePublicObjectUrls(pooledRefs);
 const pooledUrl=(storagePath:string)=>pooled.get("creator-media-public\u0000"+storagePath.slice("creator-media-public/".length))??null;
 const videos=rows.flatMap(row=>{const card=buildWatchCard(supabase,row,pooledUrl);return card?[card]:[];});
 return <main className="raye2-watch-library" dir={ar?"rtl":"ltr"} lang={ar?"ar":"en"}>
   <div className="raye2-watch-layout">
   <section className="raye2-watch-content">
    <div className="raye2-watch-hero"><span className="raye2-watch-label">{t.label}</span><h1>{t.h1a}<br/><em>{t.h1b}</em></h1><p>{t.intro}</p><div className="raye2-watch-hero-meta"><span><i/> {t.published}</span><span>{videos.length} {videos.length===1?t.video:t.videos}</span></div></div>
    <ContinueWatching/>
    <div className="raye2-watch-section-head"><div><span className="raye2-watch-label">{t.library}</span><h2>{t.latest}</h2></div><span>{videos.length} {t.available}</span></div>
    <div className="raye2-watch-grid">{videos.map(video=><article className="raye2-watch-card" key={video.id}><Link className="raye2-watch-card-media" href={"/watch/"+video.slug}><PublicVideoPlayer src={video.src} poster={video.poster} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/><span className="raye2-watch-play">▶</span></Link><div className="raye2-watch-card-copy"><span className="raye2-watch-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><time>{new Date(video.publishedAt).toLocaleDateString(ar?"ar":undefined)}</time></div></article>)}</div>{(videos.length>=24)&&<WatchLibraryMore locale={ar?"ar":"en"} initial={videos} before={videos[videos.length-1].publishedAt} beforeId={videos[videos.length-1].id}/>}
    {!videos.length&&<div className="raye2-watch-empty"><span>▶</span><h2>{t.emptyTitle}</h2><p>{t.emptyBody}</p></div>}
   </section>
   <aside className="raye2-watch-aside"><section><span className="raye2-watch-label">{t.explore}</span><h2>{t.findTitle}</h2><p>{t.findBody}</p><Link href="/shorts">Explore Mini’s ↗</Link><Link href="/community">{t.communities} ↗</Link></section></aside>
  </div>
 </main>;
}
