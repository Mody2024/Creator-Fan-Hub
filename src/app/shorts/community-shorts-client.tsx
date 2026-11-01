"use client";

import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";

type ShortRow={id:string;author_id:string;title:string;caption:string;storage_path:string;duration_seconds:number;created_at:string;status:string};
type ShortProfile={user_id:string;handle:string;display_name:string;avatar_url:string|null};
type ShortCard=ShortRow&{handle:string;displayName:string;avatarUrl:string|null;src:string};
const MAX_BYTES=50*1024*1024;
const MAX_SECONDS=180;

export default function CommunityShortsClient(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const input=useRef<HTMLInputElement>(null);
 const [userId,setUserId]=useState<string|null>(null);
 const [items,setItems]=useState<ShortCard[]>([]);
 const [title,setTitle]=useState("");
 const [caption,setCaption]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [duration,setDuration]=useState(0);
 const [busy,setBusy]=useState(false);
 const [uploadProgress,setUploadProgress]=useState<number|null>(null);
 const [status,setStatus]=useState("");
 const [loading,setLoading]=useState(true);

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return;}
  setLoading(true);
  const {data,error}=await supabase.from("community_short_videos").select("id,author_id,title,caption,storage_path,duration_seconds,created_at,status").eq("status","published").order("created_at",{ascending:false}).limit(60);
  if(error){setStatus("The Nhenbits feed could not load. Please refresh.");setLoading(false);return;}
  const rows=(data??[]) as ShortRow[];
  const ids=[...new Set(rows.map(row=>row.author_id))];
  const {data:profiles}=ids.length?await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id",ids):{data:[]};
  const profileRows=(profiles??[]) as ShortProfile[];
  const byId=new Map<string,ShortProfile>(profileRows.map(p=>[p.user_id,p] as const));
  setItems(rows.map(row=>{
   const profile=byId.get(row.author_id);
   return {...row,handle:profile?.handle??"member",displayName:profile?.display_name??"NHEN member",avatarUrl:profile?.avatar_url??null,src:supabase.storage.from("nhen-community-shorts").getPublicUrl(row.storage_path).data.publicUrl};
  }));
  setLoading(false);
 },[supabase]);

 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void supabase.auth.getUser().then(({data}:{data:{user:{id:string}|null}})=>{if(alive)setUserId(data.user?.id??null);});
  const {data:listener}=supabase.auth.onAuthStateChange((_event:string,session:{user:{id:string}}|null)=>{if(alive)setUserId(session?.user?.id??null);});
  void load();
  return()=>{alive=false;listener.subscription.unsubscribe();};
 },[supabase,load]);

 async function chooseFile(selected:File|null){
  setFile(null);setDuration(0);setStatus("");
  if(!selected)return;
  if(!["video/mp4","video/webm"].includes(selected.type)){setStatus("Choose an MP4 or WebM video.");if(input.current)input.current.value="";return;}
  if(selected.size>MAX_BYTES){setStatus("This video exceeds the current 50 MB community upload limit.");if(input.current)input.current.value="";return;}
  const url=URL.createObjectURL(selected);
  try{
   const seconds=await new Promise<number>((resolve,reject)=>{
    const video=document.createElement("video");video.preload="metadata";video.onloadedmetadata=()=>resolve(video.duration);video.onerror=()=>reject(new Error("This video could not be read. Try another MP4 or WebM file."));video.src=url;
   });
   if(!Number.isFinite(seconds)||seconds<=0||seconds>MAX_SECONDS)throw new Error("Nhenbits must be 3 minutes or shorter.");
   setFile(selected);setDuration(Math.ceil(seconds));setTitle(value=>value||selected.name.replace(/\.[^.]+$/,"").slice(0,100));setStatus("Video ready. Add a title and publish it to the community.");
  }catch(error){setStatus(error instanceof Error?error.message:"Could not read this video.");if(input.current)input.current.value="";}
  finally{URL.revokeObjectURL(url);}
 }

 async function publish(){
  if(!supabase||!userId||!file||!title.trim()||busy)return;
  setBusy(true);setStatus("");
  let reservationId:string|null=null;
  let uploadSession:ReturnType<typeof getResumableUploadSession>|null=null;
  let uploaded=false;
  try{
   uploadSession=getResumableUploadSession(userId,"nhen-community-shorts",file);
   const previousReservation=uploadSession.getReservationId();
   if(previousReservation){
    const {data:reused,error:reuseError}=await supabase.rpc("reuse_nhen_media_upload_reservation",{p_reservation_id:previousReservation,p_bytes:file.size,p_bucket:"nhen-community-shorts"});
    if(!reuseError&&reused)reservationId=previousReservation;
   }
   if(!reservationId){
    const {data:reservation,error:reservationError}=await supabase.rpc("reserve_nhen_media_upload",{p_bytes:file.size,p_bucket:"nhen-community-shorts"});
    if(reservationError || !reservation?.[0]?.reservation_id) throw reservationError??new Error("NHEN free storage capacity is unavailable. No upload was started.");
    reservationId=reservation[0].reservation_id;
    uploadSession.saveReservation(reservationId);
   }
   const path=uploadSession.objectName;
   await uploadToSupabaseStorage({client:supabase,bucketName:"nhen-community-shorts",objectName:path,file,onProgress:setUploadProgress});
   uploaded=true;
   const {error:saveError}=await supabase.from("community_short_videos").insert({author_id:userId,title:title.trim(),caption:caption.trim(),storage_path:path,duration_seconds:duration,status:"published"});
   if(saveError){
    const {error:cleanupError}=await supabase.storage.from("nhen-community-shorts").remove([path]);
    if(cleanupError)throw new Error("The post could not be saved and its uploaded file needs administrator cleanup.");
    throw saveError;
   }
   setTitle("");setCaption("");setFile(null);setDuration(0);if(input.current)input.current.value="";
   setStatus("Your Nhenbit is live in the community.");await load();
  }catch(error){setStatus(!uploaded?"Upload interrupted. Your resumable session is retained; choose the same file again to continue. "+(error instanceof Error?error.message:""):error instanceof Error?error.message:"The uploaded file could not be saved. Please refresh the feed.");}
  finally{
   if(uploaded&&uploadSession){
    uploadSession.clear();
    if(reservationId) { try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:reservationId}); } catch { /* reservation expires automatically */ } }
   }
   setUploadProgress(null);
   setBusy(false);
  }
 }

 async function remove(item:ShortCard){
  if(!supabase||!userId||item.author_id!==userId)return;
  if(!window.confirm("Remove this Nhenbit from the community?"))return;
  setBusy(true);
  try{
   const {error}=await supabase.from("community_short_videos").delete().eq("id",item.id).eq("author_id",userId);
   if(error)throw error;
   const {error:storageError}=await supabase.storage.from("nhen-community-shorts").remove([item.storage_path]);
   if(storageError)setStatus("The Nhenbit was removed from the feed; its media file may need cleanup.");
   else setStatus("Your Nhenbit was removed.");
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:"Could not remove this Nhenbit.");}
  finally{setBusy(false);}
 }

 return <section className="nhen-community-shorts-section">
  <div className="nhen-card-heading"><div><span className="nhen-section-label">COMMUNITY STREAM</span><h2>Shared by the community</h2></div><span className="nhen-muted">Member videos</span></div>
  <section className="nhen-community-short-composer">
   <div><span className="nhen-section-label">YOUR MOMENT</span><h2>Share a Nhenbit</h2><p>Community members can publish directly. MP4 or WebM · up to 3 minutes · 50 MB per video.</p></div>
   {userId?<div className="nhen-community-short-fields">
    <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder="Give your video a title" aria-label="Video title"/>
    <textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={500} rows={2} placeholder="Add a caption (optional)" aria-label="Video caption"/>
    <div className="nhen-community-short-controls"><label className="nhen-short-file-label"><input ref={input} type="file" accept="video/mp4,video/webm" onChange={e=>void chooseFile(e.target.files?.[0]??null)}/><span>＋ Choose video</span></label><span className="nhen-muted">{file?file.name+" · "+duration+" sec":"No video selected"}</span><button className="button button-primary" disabled={!file||!title.trim()||busy} onClick={()=>void publish()}>{busy?"Publishing…":"Publish Nhenbit ↗"}</button></div>
   </div>:<p><Link className="nhen-action" href="/community#join">Join or sign in to upload a community Nhenbit ↗</Link></p>}
   {uploadProgress!==null&&<div className="media-upload-note" role="status"><strong>Uploading · {uploadProgress}%</strong><progress max={100} value={uploadProgress} aria-label="Community upload progress"/><small>If interrupted, choose the same file again to resume.</small></div>}{status&&<p role="status" aria-live="polite" className="nhen-muted">{status}</p>}
  </section>
  <div className="nhen-community-shorts-grid">{loading?<div className="nhen-card nhen-empty-state">Loading community videos…</div>:items.length?items.map(item=><article className="nhen-community-short-card" key={item.id}>
   <video src={item.src} controls playsInline preload="metadata" aria-label={item.title}/>
   <div className="nhen-community-short-card-body"><div className="nhen-community-short-author">{item.avatarUrl?<img src={item.avatarUrl} alt=""/>:<span>{item.displayName.slice(0,1).toUpperCase()}</span>}<Link href={"/u/"+item.handle}>@{item.handle}</Link><time>{new Date(item.created_at).toLocaleDateString()}</time></div><h3>{item.title}</h3>{item.caption&&<p>{item.caption}</p>}{item.author_id===userId&&<button className="nhen-action" disabled={busy} onClick={()=>void remove(item)}>Remove your video</button>}</div>
  </article>):<div className="nhen-card nhen-empty-state">No community Nhenbits yet. Be the first to share one.</div>}</div>
 </section>;
}
