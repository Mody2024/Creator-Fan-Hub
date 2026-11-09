import Link from "next/link";
import "./raye2-series.css";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function SeriesPage(){
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data}=await supabase.from("video_playlists").select("id,slug,title,description,position").eq("is_published",true).order("position");
 const playlists=data??[];
 const counts=await Promise.all(playlists.map(async p=>{const {count}=await supabase.from("video_playlist_items").select("*",{count:"exact",head:true}).eq("playlist_id",p.id);return [p.id,count??0] as const}));
 const countMap=new Map(counts);
 return <main className="raye2-series-page" dir="ltr"><header className="nhen-watch-top"><Link className="nhen-brand" href="/raye2/home" aria-label="Raye2 home">Raye2</Link><nav><Link href="/watch">Watch</Link><Link href="/community">Community</Link></nav></header><div className="nhen-series-wrap"><span className="nhen-section-label">RAYE2 / SERIES & COLLECTIONS</span><h1>Series & <em>playlists.</em></h1><p className="nhen-muted">Explore creator collections, connected episodes and playlists in one place.</p><div className="nhen-series-grid">{playlists.length?playlists.map(p=><Link href={"/series/"+p.slug} className="nhen-series-card" key={p.id}><span className="nhen-series-icon">▤</span><span className="nhen-section-label">COLLECTION / {String(p.position+1).padStart(2,"0")}</span><h2>{p.title}</h2><p>{p.description||"A curated collection of creator videos."}</p><small>{countMap.get(p.id)} videos · Open collection ↗</small></Link>):<div className="nhen-card nhen-empty-state">No public series yet. Check back after the creator publishes a collection.</div>}</div></div></main>
}
