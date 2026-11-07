"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Asset={media_id:string;title:string;media_type:string;is_published:boolean};
type Variant={id:string;media_id:string;variant_key:string;active:boolean};
export default function SponsorCreativeVariants({campaignId,campaignType,assets}:{campaignId:string;campaignType:"creator"|"platform";assets:Asset[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [rows,setRows]=useState<Variant[]>([]);
 const [mediaId,setMediaId]=useState("");
 const [variant,setVariant]=useState("standard_10s");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("Add multiple approved creative versions. They are stored but not automatically played.");
 const key=campaignType==="creator"?"creator_campaign_id":"platform_campaign_id";
 const eligible=assets.filter(a=>a.is_published&&(a.media_type==="image"||a.media_type==="video"));
 const load=useCallback(async()=>{
  if(!supabase||!campaignId)return;
  const {data,error}=await supabase.from("raye2_sponsor_creative_variants").select("id,media_id,variant_key,active").eq(key,campaignId).order("created_at");
  if(error){setMessage("Creative variants are unavailable until the free sponsorship migration is applied.");return}
  setRows((data??[]) as Variant[]);
 },[supabase,campaignId,key]);
 useEffect(()=>{void load()},[load]);
 async function save(){
  if(!supabase||busy||!mediaId)return;
  setBusy(true);
  try{
   const {data:user,error:userError}=await supabase.auth.getUser();
   if(userError||!user.user)throw new Error("Sign in again to manage creative variants.");
   const payload={owner_id:user.user.id,media_id:mediaId,variant_key:variant,active:true,[key]:campaignId};
   const {error}=await supabase.from("raye2_sponsor_creative_variants").upsert(payload,{onConflict:key+",variant_key"});
   if(error)throw error;
   setMessage("Creative version saved. Playback selection is not enabled.");setMediaId("");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Could not save creative version.")}
  finally{setBusy(false)}
 }
 async function toggle(row:Variant){
  if(!supabase||busy)return;
  setBusy(true);
  try{const {error}=await supabase.from("raye2_sponsor_creative_variants").update({active:!row.active}).eq("id",row.id);if(error)throw error;setMessage("Creative version updated.");await load()}
  catch(error){setMessage(error instanceof Error?error.message:"Could not update creative version.")}
  finally{setBusy(false)}
 }
 return <div className="raye2-sponsor-creative-variants">
  <strong>Creative versions</strong>
  <div className="poll-create-form">
   <label>Approved image/video<select value={mediaId} onChange={e=>setMediaId(e.target.value)}><option value="">Choose a published creative…</option>{eligible.map(a=><option key={a.media_id} value={a.media_id}>{a.title}</option>)}</select></label>
   <label>Version<select value={variant} onChange={e=>setVariant(e.target.value)}><option value="short_5s">Short · 5 seconds</option><option value="standard_10s">Standard · 10 seconds</option><option value="extended">Extended</option><option value="alternate">Alternate</option></select></label>
   <button className="button button-secondary" type="button" disabled={busy||!mediaId} onClick={()=>void save()}>{busy?"Saving…":"Save creative version"}</button>
  </div>
  <div className="nhen-playlist-list">{rows.map(row=><article className="nhen-playlist-row" key={row.id}>
   <span><strong>{row.variant_key.replaceAll("_"," ")}</strong><small>{eligible.find(a=>a.media_id===row.media_id)?.title??row.media_id} · {row.active?"enabled":"disabled"}</small></span>
   <button type="button" disabled={busy} onClick={()=>void toggle(row)}>{row.active?"Disable":"Enable"}</button>
  </article>)}</div>
  <p className="editor-status" role="status" aria-live="polite">{message}</p>
 </div>
}
