import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import "../topics.css";

export const dynamic="force-dynamic";

type TopicVideo={slug:string;title:string;category:string;description:string;published_at:string};

export default async function TopicPage({params}:{params:Promise<{tag:string}>}){
 const [{tag},cookieStore]=await Promise.all([params,cookies()]);
 const clean=decodeURIComponent(tag).trim().toLowerCase().slice(0,40);
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const t=isArabic?{
  eyebrow:"موضوع",heading:"فيديوهات بوسم",empty:"لا توجد فيديوهات بهذا الموضوع بعد.",back:"كل المواضيع",watch:"شاهد",home:"الرئيسية",community:"المجتمع",discover:"اكتشف",count:"فيديو"
 }:{
  eyebrow:"TOPIC",heading:"Videos tagged",empty:"No videos carry this topic yet.",back:"All topics",watch:"Watch",home:"Home",community:"Community",discover:"Discover",count:"videos"
 };
 const supabase=await createSupabaseServerClient();
 let videos:TopicVideo[]=[];
 if(supabase&&clean){
  const {data}=await supabase.rpc("raye2_get_topic_videos",{p_tag:clean,p_limit:60});
  videos=(data??[]) as TopicVideo[];
 }
 return <main className="raye2-topic-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-topic-header"><Link className="raye2-topic-brand" href="/raye2/home">Raye2<span>.</span></Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/search">{t.discover}</Link><Link href="/community">{t.community}</Link></nav></header>
  <section className="raye2-topic-hero"><span className="raye2-topic-label">{t.eyebrow}</span><h1>{t.heading} <em>#{clean}</em></h1><p>{videos.length} {t.count}</p><Link className="raye2-topic-back" href="/search">← {t.back}</Link></section>
  {videos.length?<div className="raye2-topic-grid">{videos.map(video=><article className="raye2-topic-card" key={video.slug}><Link href={"/watch/"+video.slug}><div className="raye2-topic-thumb">▶</div><div className="raye2-topic-copy"><span className="raye2-topic-label">{video.category.toUpperCase()}</span><h3>{video.title}</h3><p>{video.description}</p><time>{new Date(video.published_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div></Link></article>)}</div>:<div className="raye2-topic-empty">{t.empty}</div>}
 </main>;
}
