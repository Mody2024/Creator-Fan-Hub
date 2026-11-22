import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {resolvePublicObjectUrls} from "@/lib/storage/resolve.server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import WatchLibraryMore from "./watch-library-more";
import {buildWatchCard,type WatchRow} from "./watch-library-media";
import ContinueWatching from "./continue-watching";
import "./watch-library.css";
export const dynamic="force-dynamic";
export default async function WatchLibraryPage(){
 const supabase=await createSupabaseServerClient();
 if(!supabase)return <main className="raye2-app-shell"><p>Raye2 Watch is temporarily unavailable.</p></main>;
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
 return <main className="raye2-watch-library" dir="ltr">
   <div className="raye2-watch-layout">
   <section className="raye2-watch-content">
    <div className="raye2-watch-hero"><span className="raye2-watch-label">RAYE2 / WATCH</span><h1>Stories worth<br/><em>your time.</em></h1><p>Discover videos published by creators across Raye2. Watch, react, save and join the conversation.</p><div className="raye2-watch-hero-meta"><span><i/> CREATOR PUBLISHED</span><span>{videos.length} {videos.length===1?"VIDEO":"VIDEOS"}</span></div></div>
    <ContinueWatching/>
    <div className="raye2-watch-section-head"><div><span className="raye2-watch-label">THE LIBRARY</span><h2>Latest videos</h2></div><span>{videos.length} available</span></div>
    <div className="raye2-watch-grid">{videos.map(video=><article className="raye2-watch-card" key={video.id}><Link className="raye2-watch-card-media" href={"/watch/"+video.slug}><PublicVideoPlayer src={video.src} poster={video.poster} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl}/><span className="raye2-watch-play">▶</span></Link><div className="raye2-watch-card-copy"><span className="raye2-watch-label">{video.category.toUpperCase()} · OFFICIAL</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><time>{new Date(video.publishedAt).toLocaleDateString()}</time></div></article>)}</div>{(videos.length>=24)&&<WatchLibraryMore initial={videos} before={videos[videos.length-1].publishedAt} beforeId={videos[videos.length-1].id}/>}
    {!videos.length&&<div className="raye2-watch-empty"><span>▶</span><h2>Your next favourite video is on its way.</h2><p>There are no published videos available yet. Check back soon.</p></div>}
   </section>
   <aside className="raye2-watch-aside"><section><span className="raye2-watch-label">EXPLORE MORE</span><h2>Find your next moment.</h2><p>Meet creators, discover communities and find something worth sharing.</p><Link href="/shorts">Explore Mini’s ↗</Link><Link href="/community">Join communities ↗</Link></section></aside>
  </div>
 </main>;
}
