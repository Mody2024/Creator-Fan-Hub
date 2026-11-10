import {notFound} from "next/navigation";
import Link from "next/link";
import {cookies} from "next/headers";
import "../raye2-series.css";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

type Episode={playlist_slug:string;playlist_title:string;playlist_description:string;video_slug:string;title:string;category:string;description:string;media_type:string;duration_seconds:number|null;position:number};

function formatDuration(seconds:number|null){
 if(!seconds||seconds<=0)return null;
 const m=Math.floor(seconds/60);const s=seconds%60;
 return `${m}:${String(s).padStart(2,"0")}`;
}

export default async function SeriesDetailPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const cookieStore=await cookies();
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const t=isArabic?{back:"→ كل مجموعات RAYE2",watch:"شاهد",external:"خارجي",empty:"لا تحتوي هذه المجموعة على فيديوهات متاحة علنًا بعد.",home:"الرئيسية",series:"السلاسل",community:"المجتمع"}
  :{back:"← ALL RAYE2 COLLECTIONS",watch:"Watch",external:"External",empty:"This collection has no publicly available videos yet.",home:"Home",series:"Series",community:"Community"};
 const supabase=await createSupabaseServerClient();
 if(!supabase)notFound();
 const {data,error}=await supabase.rpc("raye2_get_series",{p_slug:slug,p_limit:200});
 const episodes=(data??[]) as Episode[];
 if(error||episodes.length===0){
  const {data:exists}=await supabase.from("video_playlists").select("slug").eq("slug",slug).eq("is_published",true).maybeSingle();
  if(!exists)notFound();
 }
 const playlist=episodes[0];
 return <main className="raye2-series-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="nhen-watch-top"><Link className="nhen-brand" href="/raye2/home" aria-label={isArabic?"الصفحة الرئيسية":"Raye2 home"}>Raye2</Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/series">{t.series}</Link><Link href="/community">{t.community}</Link></nav></header>
  <div className="nhen-series-wrap"><Link className="nhen-section-label" href="/series">{t.back}</Link>
   <h1>{playlist?.playlist_title??slug}</h1><p className="nhen-muted">{playlist?.playlist_description}</p>
   <div className="nhen-series-video-list">{episodes.length?episodes.map(episode=>{const duration=formatDuration(episode.duration_seconds);return <Link className="nhen-search-result" href={"/watch/"+episode.video_slug} key={episode.video_slug}>
    <span className="nhen-search-result-icon">▶</span>
    <div><strong>{String(Number(episode.position)+1).padStart(2,"0")} · {episode.title}</strong><small>{episode.category}{duration?` · ${duration}`:""}{episode.media_type==="youtube"?` · ${t.external}`:""} · {episode.description}</small></div>
    <b>{t.watch} ↗</b>
   </Link>}):<div className="nhen-card nhen-empty-state">{t.empty}</div>}</div>
  </div>
 </main>;
}
