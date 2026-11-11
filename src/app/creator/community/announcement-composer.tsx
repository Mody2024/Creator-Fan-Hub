"use client";

import {useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

export default function AnnouncementComposer(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const [body,setBody]=useState("");
 const [pin,setPin]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const isArabic=locale==="ar";
 const t=isArabic?{
  title:"إعلان رسمي",hint:"يظهر الإعلان بوسم رسمي منفصل عن منشورات الأعضاء، ويصل إلى متابعيك كإشعار.",placeholder:"اكتب إعلانًا رسميًا…",pin:"ثبّت الإعلان أعلى المجتمع",publish:"انشر الإعلان ↗",published:"تم نشر الإعلان وإشعار متابعيك.",error:"تعذر نشر الإعلان. تأكد من صلاحياتك وحاول مجددًا.",empty:"اكتب نص الإعلان أولًا.",counter:"حرف"
 }:{
  title:"Official announcement",hint:"Announcements carry an official badge separate from member posts and notify your followers.",placeholder:"Write an official announcement…",pin:"Pin to the top of the community",publish:"Publish announcement ↗",published:"Announcement published and your followers were notified.",error:"The announcement could not be published. Check your access and try again.",empty:"Write the announcement text first.",counter:"chars"
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 async function publish(){
  if(!supabase||busy)return;
  if(!body.trim()){setNotice(t.empty);return;}
  setBusy(true);setNotice("");
  const {error}=await supabase.rpc("raye2_create_community_announcement",{p_body:body.trim(),p_linked_video_id:null,p_pin:pin});
  if(error)setNotice(t.error);
  else{setBody("");setPin(false);setNotice(t.published);}
  setBusy(false);
 }
 return <section className="nhen-card nhen-card-pad" aria-label={t.title} dir={isArabic?"rtl":"ltr"}>
  <div className="nhen-card-heading"><strong>{t.title}</strong><span className="nhen-pill nhen-pill-official">{isArabic?"رسمي":"OFFICIAL"}</span></div>
  <p className="nhen-muted" style={{fontSize:13,lineHeight:1.7}}>{t.hint}</p>
  <textarea value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} rows={4} placeholder={t.placeholder} style={{width:"100%",resize:"vertical",border:"1px solid var(--nhen-line)",borderRadius:16,background:"var(--nhen-bg)",color:"var(--nhen-ink)",padding:15}}/>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,gap:12,flexWrap:"wrap"}}>
   <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><input type="checkbox" checked={pin} onChange={event=>setPin(event.target.checked)}/>{t.pin}</label>
   <div style={{display:"flex",alignItems:"center",gap:12}}><span className="nhen-muted" style={{fontSize:11}}>{body.length}/2000 · {t.counter}</span><button className="button button-primary" disabled={busy||!body.trim()} onClick={()=>void publish()}>{t.publish}</button></div>
  </div>
  {notice&&<p className="nhen-muted" role="status" style={{fontSize:12,marginTop:10}}>{notice}</p>}
 </section>;
}
