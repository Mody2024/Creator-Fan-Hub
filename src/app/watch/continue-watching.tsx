"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Progress={slug:string;title:string;category:string;description:string;position_seconds:number;duration_seconds:number;updated_at:string};

function formatTime(seconds:number,isArabic:boolean){
 const m=Math.floor(seconds/60),s=Math.floor(seconds%60);
 return `${m}:${String(s).padStart(2,"0")}${isArabic?" د":" min"}`;
}

export default function ContinueWatching(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [items,setItems]=useState<Progress[]>([]);
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{heading:"متابعة المشاهدة",resume:"أكمل المشاهدة",watched:"شوهد"}:{heading:"Continue watching",resume:"Resume",watched:"watched"};

 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void (async()=>{
   try{
    const {data:userData}=await supabase.auth.getUser();
    if(!alive||!userData.user)return;
    const {data}=await supabase.rpc("raye2_get_continue_watching",{p_limit:8});
    if(alive)setItems((data??[]) as Progress[]);
   }catch{}
  })();
  return ()=>{alive=false};
 },[supabase]);

 if(!items.length)return null;
 return <section className="raye2-continue" dir={isArabic?"rtl":"ltr"} aria-label={t.heading}>
  <div className="raye2-continue-head"><span className="raye2-watch-label">{t.heading}</span><h2>{t.heading}</h2></div>
  <div className="raye2-continue-grid">{items.map(item=>{
   const pct=item.duration_seconds>0?Math.min(100,Math.round(item.position_seconds/item.duration_seconds*100)):0;
   return <article className="raye2-continue-card" key={item.slug}>
    <Link href={"/watch/"+item.slug+"?t="+item.position_seconds}>
     <div className="raye2-continue-thumb"><span aria-hidden="true">▶</span><div className="raye2-continue-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{width:pct+"%"}}/></div></div>
     <div className="raye2-continue-copy"><span className="raye2-watch-label">{item.category.toUpperCase()}</span><h3>{item.title}</h3><p>{t.resume} · {formatTime(item.position_seconds,isArabic)} {t.watched}</p></div>
    </Link>
   </article>;
  })}</div>
 </section>;
}
