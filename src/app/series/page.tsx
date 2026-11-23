import Link from "next/link";
import Image from "next/image";
import {cookies} from "next/headers";
import "./raye2-series.css";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {resolvePublicObjectUrls} from "@/lib/storage/resolve.server";

export const dynamic="force-dynamic";

type SeriesRow={slug:string;title:string;description:string;position:number;video_count:number;total_duration_seconds:number;cover_path:string|null;owner_handle:string|null;owner_display_name:string|null};

function formatRuntime(seconds:number,isArabic:boolean){
 const total=Number(seconds)||0;
 if(total<=0)return isArabic?"غير محدد":"Runtime unknown";
 const hours=Math.floor(total/3600);
 const minutes=Math.round((total%3600)/60);
 if(hours>0)return isArabic?`${hours} س ${minutes} د`:`${hours}h ${minutes}m`;
 return isArabic?`${minutes} د`:`${minutes}m`;
}

export default async function SeriesPage(){
 const cookieStore=await cookies();
 const isArabic=cookieStore.get("raye2_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const t=isArabic?{label:"RAYE2 / السلاسل والمجموعات",headline:"السلاسل و",accent:"قوائم التشغيل.",intro:"استكشف مجموعات صُنّاع المحتوى والحلقات المتصلة وقوائم التشغيل في مكان واحد.",home:"الرئيسية",watch:"مشاهدة",community:"المجتمع",creators:"صُنّاع المحتوى",open:"افتح المجموعة",videos:"فيديو",empty:"لا توجد سلاسل عامة بعد. عُد بعد أن ينشر صانع المحتوى مجموعة.",curated:"مجموعة"}
  :{label:"RAYE2 / SERIES & COLLECTIONS",headline:"Series &",accent:"playlists.",intro:"Explore creator collections, connected episodes and playlists in one place.",home:"Home",watch:"Watch",community:"Community",creators:"Creators",open:"Open collection",videos:"videos",empty:"No public series yet. Check back after a creator publishes a collection.",curated:"Collection"};
 const supabase=await createSupabaseServerClient();
 let series:SeriesRow[]=[];
 if(supabase){
  const {data}=await supabase.rpc("raye2_list_series",{p_limit:60});
  series=(data??[]) as SeriesRow[];
 }
 const coverRefs=series.flatMap(item=>item.cover_path?[{bucketId:item.cover_path.split("/")[0],objectKey:item.cover_path.split("/").slice(1).join("/")}]:[]);
 const pooledCovers=await resolvePublicObjectUrls(coverRefs);
 const coverUrl=(path:string|null)=>{if(!path||!supabase)return null;const parts=path.split("/");if(parts.length<2)return null;return pooledCovers.get(parts[0]+"\u0000"+parts.slice(1).join("/"))??supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl};
 return <main className="raye2-series-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="raye2-series-wrap"><span className="raye2-section-label">{t.label}</span><h1>{t.headline} <em>{t.accent}</em></h1><p className="raye2-muted">{t.intro}</p>
   <div className="raye2-series-grid">{series.length?series.map(item=>{const cover=coverUrl(item.cover_path);return <Link href={"/series/"+item.slug} className="raye2-series-card" key={item.slug}>
    {cover&&<span className="raye2-series-cover"><Image src={cover} alt="" fill sizes="(max-width:720px) 100vw, 360px" unoptimized/></span>}
    <span className="raye2-series-icon">▤</span><span className="raye2-section-label">{t.curated.toUpperCase()} / {String(Number(item.position)+1).padStart(2,"0")}</span>
    <h2>{item.title}</h2><p>{item.description||(isArabic?"مجموعة منسّقة من فيديوهات صُنّاع المحتوى.":"A curated collection of creator videos.")}</p>
    {item.owner_handle&&<span className="raye2-series-owner">@{item.owner_handle} · {item.owner_display_name}</span>}
    <small>{Number(item.video_count)} {t.videos} · {formatRuntime(item.total_duration_seconds,isArabic)} · {t.open} ↗</small>
   </Link>}):<div className="raye2-card raye2-empty-state">{t.empty}</div>}</div>
  </div>
 </main>;
}
