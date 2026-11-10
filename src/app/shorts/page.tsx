import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import CommunityShortsClient from "./community-shorts-client";
import "./shorts-raye2.css";

export const dynamic="force-dynamic";

export default async function ShortsPage(){
 const cookieStore=await cookies();
 const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";
 const isArabic=locale==="ar";
 const labels=isArabic?{
  watch:"شاهد",series:"السلاسل",community:"المجتمع",eyebrow:"RAYE2 / لحظات المجتمع",
  title:"لحظات <em>رايق.</em>",intro:"أبرز لحظات صانع المحتوى والفيديوهات التي يشاركها المجتمع مباشرة.",
  short:"مقطع",open:"افتح الفيديو كاملًا ↗",empty:"لم تُنشر أي لقطات بعد. غيّر تصنيف الفيديو إلى Shorts في استوديو NHEN ليظهر هنا.",
  official:"مقاطع المجتمع الرسمية",from:"من صُنّاع محتوى RAYE2"
 }:{
  watch:"Watch",series:"Series",community:"Community",eyebrow:"RAYE2 / MINI’S",
  title:"Quick <em>Mini’s.</em>",intro:"Official creator highlights and videos shared directly by the community.",
  short:"SHORT",open:"Open full video ↗",empty:"No Nhenbits have been published yet. Set a video's category to Shorts in NHEN Studio to feature it here.",
  official:"Featured Mini’s",from:"FROM RAYE2 CREATORS"
 };
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data}=await supabase.from("video_catalog").select("media_id,slug,description,category,tags,published_at,media_items!video_catalog_media_id_fkey!inner(title,storage_path,source_url,alt_text,is_published,media_type)").eq("category","Shorts").not("published_at","is",null).order("published_at",{ascending:false}).limit(30);
 const shorts=(data??[]).flatMap(item=>{
  const media=Array.isArray(item.media_items)?item.media_items[0]:item.media_items;
  if(!media?.is_published||!["video","youtube"].includes(media.media_type))return[];
  let src="",youtubeEmbedUrl:string|null=null;
  if(media.media_type==="video"){
   if(!media.storage_path?.startsWith("creator-media-public/"))return[];
   const parts=media.storage_path.split("/");
   src=supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  }else{
   try{const u=new URL(media.source_url??"");if(!["youtube.com","www.youtube.com","m.youtube.com","youtu.be"].includes(u.hostname))return[];const parts=u.pathname.split("/").filter(Boolean);const id=u.hostname==="youtu.be"?parts[0]:u.searchParams.get("v")??parts[parts.length-1];if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return[];youtubeEmbedUrl="https://www.youtube-nocookie.com/embed/"+id+"?rel=0"}catch{return[]}
  }
  return[{mediaId:item.media_id,slug:item.slug,title:media.title,description:item.description||media.alt_text||"",src,youtubeEmbedUrl,publishedAt:item.published_at}];
 });
 return <main className="nhen-shorts-page" dir={isArabic?"rtl":"ltr"} lang={locale}><header className="nhen-watch-top"><Link className="nhen-brand" href="/raye2/home" aria-label="Raye2 home"><span className="raye2-mini-brand-glyph">R</span></Link><nav><Link href="/watch">{labels.watch}</Link><Link href="/series">{labels.series}</Link><Link href="/community">{labels.community}</Link></nav></header><div className="nhen-shorts-heading"><span className="nhen-section-label">{labels.eyebrow}</span><h1>{isArabic?<>لقطات <em>نهين؟</em></>:<>Quick <em>Nhenbits.</em></>}</h1><p className="nhen-muted">{labels.intro}</p></div><div className="nhen-shorts-feed">{shorts.length?shorts.map((v,i)=><article className="nhen-short-card" key={v.mediaId}><div className="nhen-short-player"><PublicVideoPlayer src={v.src} title={v.title} description={v.description} youtubeEmbedUrl={v.youtubeEmbedUrl} locale={locale}/></div><div className="nhen-short-info"><span className="nhen-section-label">{labels.short} / {String(i+1).padStart(2,"0")}</span><h2>{v.title}</h2><p>{v.description}</p><Link href={"/watch/"+v.slug}>{labels.open}</Link></div></article>):<div className="nhen-card nhen-empty-state">{labels.empty}</div>}</div><section className="nhen-official-shorts"><div className="nhen-card-heading"><h2>{labels.official}</h2><span className="nhen-section-label">{labels.from}</span></div></section><CommunityShortsClient/></main>;
}
