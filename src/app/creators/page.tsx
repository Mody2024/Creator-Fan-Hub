import Link from "next/link";
import Image from "next/image";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import "./creators.css";

export const dynamic="force-dynamic";

type Creator={handle:string;display_name:string;avatar_url:string|null;bio:string;published_videos:number;follower_count:number;total_views:number};
type SortKey="published"|"followers"|"views";

export default async function CreatorsPage({searchParams}:{searchParams:Promise<{sort?:string}>}){
 const [{sort=""},cookieStore]=await Promise.all([searchParams,cookies()]);
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const selected:SortKey=sort==="followers"||sort==="views"?sort:"published";
 const t=isArabic?{label:"RAYE2 / صُنّاع المحتوى",headline:"تعرّف على",accent:"صُنّاع المحتوى.",intro:"اكتشف الأشخاص الذين ينشرون على Raye2، تابعهم وشاهد أعمالهم.",sortBy:"ترتيب حسب",published:"الأكثر نشرًا",followers:"الأكثر متابعة",views:"الأكثر مشاهدة",videos:"فيديو",followersCount:"متابع",viewsCount:"مشاهدة",empty:"لم ينشر أي صُنّاع محتوى علنيًا بعد.",browse:"تصفح Raye2",home:"الرئيسية",watch:"مشاهدة",community:"المجتمع",series:"السلاسل",discover:"استكشف",open:"افتح الملف الشخصي",member:"صانع محتوى"}
  :{label:"RAYE2 / CREATORS",headline:"Meet the",accent:"creators.",intro:"Discover the people publishing on Raye2, follow them and watch their work.",sortBy:"Sort by",published:"Most published",followers:"Most followed",views:"Most viewed",videos:"videos",followersCount:"followers",viewsCount:"views",empty:"No creators have published publicly yet.",browse:"Browse Raye2",home:"Home",watch:"Watch",community:"Community",series:"Series",discover:"Discover",open:"Open profile",member:"Creator"};
 const supabase=await createSupabaseServerClient();
 let creators:Creator[]=[];
 if(supabase){
  const {data}=await supabase.rpc("raye2_list_creators",{p_limit:48,p_sort:selected});
  creators=(data??[]) as Creator[];
 }
 const query=(next:SortKey)=>`/creators?sort=${next}`;
 return <main className="raye2-creators-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-creators-top"><Link className="raye2-creators-brand" href="/raye2/home" aria-label={isArabic?"الصفحة الرئيسية":"Raye2 home"}>Raye2</Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/community">{t.community}</Link><Link href="/series">{t.series}</Link><Link href="/search">{t.discover}</Link></nav></header>
  <div className="raye2-creators-wrap">
   <section className="raye2-creators-hero"><span className="raye2-creators-label">{t.label}</span><h1>{t.headline} <em>{t.accent}</em></h1><p className="raye2-creators-muted">{t.intro}</p></section>
   <div className="raye2-creators-sortbar"><span className="raye2-creators-label">{t.sortBy}</span><div className="raye2-creators-tabs">
    <Link className={selected==="published"?"active":""} href={query("published")}>{t.published}</Link>
    <Link className={selected==="followers"?"active":""} href={query("followers")}>{t.followers}</Link>
    <Link className={selected==="views"?"active":""} href={query("views")}>{t.views}</Link>
   </div></div>
   {creators.length?<div className="raye2-creators-grid">{creators.map(creator=><article className="raye2-creators-card" key={creator.handle}>
    <Link href={"/u/"+creator.handle}>
     <div className="raye2-creators-avatar" aria-hidden="true">{creator.avatar_url?<Image src={creator.avatar_url} alt="" width={60} height={60} unoptimized/>:<span>{creator.display_name.slice(0,1).toUpperCase()}</span>}</div>
     <div className="raye2-creators-body"><span className="raye2-creators-label">{t.member.toUpperCase()}</span><h2>{creator.display_name}</h2><p className="raye2-creators-handle">@{creator.handle}</p><p className="raye2-creators-bio">{creator.bio||t.intro}</p></div>
     <dl className="raye2-creators-stats"><div><dt>{t.videos}</dt><dd>{Number(creator.published_videos)}</dd></div><div><dt>{t.followersCount}</dt><dd>{Number(creator.follower_count)}</dd></div><div><dt>{t.viewsCount}</dt><dd>{Number(creator.total_views)}</dd></div></dl>
     <span className="raye2-creators-open">{t.open} ↗</span>
    </Link>
   </article>)}</div>:<div className="raye2-creators-empty">{t.empty}</div>}
   <aside className="raye2-creators-side"><h2>{t.browse}</h2><Link href="/watch">{t.watch} ↗</Link><Link href="/series">{t.series} ↗</Link><Link href="/community">{t.community} ↗</Link><Link href="/search">{t.discover} ↗</Link></aside>
  </div>
 </main>;
}
