import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import "./topics.css";

export const dynamic="force-dynamic";

type Topic={tag:string;video_count:number|string;total_views:number|string;recent_video_count:number|string};

export default async function TopicsIndexPage({searchParams}:{searchParams:Promise<{min?:string}>}){
 const [{min=""},cookieStore]=await Promise.all([searchParams,cookies()]);
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const minCount=min==="2"?2:1;
 const t=isArabic?{eyebrow:"RAYE2 / المواضيع",heading:"تصفّح",accent:"المواضيع.",intro:"كل الوسوم التي يحملها المحتوى المنشور على Raye2، مرتّبة حسب عدد الفيديوهات.",all:"كل المواضيع",popular:"المواضيع النشطة",videos:"فيديو",views:"مشاهدة",recent:"حديث",empty:"لا توجد مواضيع بعد.",home:"الرئيسية",watch:"مشاهدة",community:"المجتمع",search:"استكشف"}:{eyebrow:"RAYE2 / TOPICS",heading:"Browse the",accent:"topics.",intro:"Every tag carried by published Raye2 content, ordered by how many videos use it.",all:"All topics",popular:"Active topics",videos:"videos",views:"views",recent:"recent",empty:"No topics yet.",home:"Home",watch:"Watch",community:"Community",search:"Discover"};
 const supabase=await createSupabaseServerClient();
 let topics:Topic[]=[];
 if(supabase){
  const {data}=await supabase.rpc("raye2_list_topics",{p_limit:120,p_min_count:minCount});
  topics=(data??[]) as Topic[];
 }
 return <main className="raye2-topic-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-topic-header"><Link className="raye2-topic-brand" href="/raye2/home">Raye2<span>.</span></Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/search">{t.search}</Link><Link href="/community">{t.community}</Link></nav></header>
  <section className="raye2-topic-hero"><span className="raye2-topic-label">{t.eyebrow}</span><h1>{t.heading} <em>{t.accent}</em></h1><p>{t.intro}</p><div className="raye2-topic-tabs"><Link className={minCount===1?"active":""} href="/topics">{t.all}</Link><Link className={minCount===2?"active":""} href="/topics?min=2">{t.popular}</Link></div></section>
  {topics.length?<div className="raye2-topic-index-grid">{topics.map(topic=><article className="raye2-topic-index-card" key={topic.tag}>
   <Link href={"/topics/"+encodeURIComponent(topic.tag)}>
    <span className="raye2-topic-label">#{topic.tag}</span>
    <dl className="raye2-topic-index-stats"><div><dt>{t.videos}</dt><dd>{Number(topic.video_count)}</dd></div><div><dt>{t.views}</dt><dd>{Number(topic.total_views)}</dd></div><div><dt>{t.recent}</dt><dd>{Number(topic.recent_video_count)}</dd></div></dl>
   </Link>
  </article>)}</div>:<div className="raye2-topic-empty">{t.empty}</div>}
 </main>;
}
