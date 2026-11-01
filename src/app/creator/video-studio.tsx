"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Asset={media_id:string;title:string;media_type:string;is_published:boolean;storage_path:string|null;alt_text:string};
type Video={media_id:string;slug:string;description:string;category:string;tags:string[];featured:boolean;allow_comments:boolean;published_at:string|null;duration_seconds:number|null};
type Playlist={id:string;slug:string;title:string;description:string;is_published:boolean;position:number};
type Analytics={media_id:string;title:string;view_count:number;reaction_count:number;comment_count:number;published_at:string|null};

function slugify(value:string){return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,110)}

export default function VideoStudio(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [assets,setAssets]=useState<Asset[]>([]),[videos,setVideos]=useState<Video[]>([]),[playlists,setPlaylists]=useState<Playlist[]>([]),[analytics,setAnalytics]=useState<Analytics[]>([]);
 const [selected,setSelected]=useState(""),[slug,setSlug]=useState(""),[description,setDescription]=useState(""),[category,setCategory]=useState("Other"),[tags,setTags]=useState(""),[duration,setDuration]=useState(""),[featured,setFeatured]=useState(false),[allowComments,setAllowComments]=useState(true),[publishedAt,setPublishedAt]=useState(false);
 const [playlistTitle,setPlaylistTitle]=useState(""),[playlistDescription,setPlaylistDescription]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("Loading video studio…");
 const load=useCallback(async()=>{
  if(!supabase){setStatus("Supabase is not configured.");return}
  const [mediaResult,videoResult,playlistResult,analyticsResult]=await Promise.all([
   supabase.rpc("get_creator_media",{p_limit:200}),
   supabase.from("video_catalog").select("media_id,slug,description,category,tags,featured,allow_comments,published_at,duration_seconds").order("updated_at",{ascending:false}),
   supabase.from("video_playlists").select("id,slug,title,description,is_published,position").order("position"),
   supabase.rpc("get_creator_video_analytics")
  ]);
  if(mediaResult.error){setStatus("Could not load creator media. Check your creator access.");return}
  setAssets(((mediaResult.data??[]) as Asset[]).filter(x=>x.media_type==="video"||x.media_type==="youtube"));
  setVideos((videoResult.data??[]) as Video[]);setPlaylists((playlistResult.data??[]) as Playlist[]);setAnalytics((analyticsResult.data??[]) as Analytics[]);
  setStatus("Video studio ready. Upload source files in Media Library, then configure their watch pages here.");
 },[supabase]);
 useEffect(()=>{void load()},[load]);
 const current=videos.find(v=>v.media_id===selected);
 function choose(id:string){setSelected(id);const v=videos.find(x=>x.media_id===id);const asset=assets.find(x=>x.media_id===id);setSlug(v?.slug??slugify(asset?.title??""));setDescription(v?.description??asset?.alt_text??"");setCategory(v?.category??"Other");setTags((v?.tags??[]).join(", "));setDuration(v?.duration_seconds?String(v.duration_seconds):"");setFeatured(v?.featured??false);setAllowComments(v?.allow_comments??true);setPublishedAt(!!v?.published_at)}
 async function save(){
  if(!supabase||!selected||busy)return;setBusy(true);setStatus("");
  try{
   const asset=assets.find(x=>x.media_id===selected);if(!asset)throw new Error("Select a source video first.");
   const safeSlug=slugify(slug);if(safeSlug.length<3)throw new Error("The watch URL needs at least three letters or numbers.");
   const row={media_id:selected,slug:safeSlug,description:description.trim(),category:category.trim()||"Other",tags:tags.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,12),duration_seconds:duration?Math.max(1,Math.min(86400,Math.floor(Number(duration)))):null,featured,allow_comments:allowComments,published_at:publishedAt?(current?.published_at??new Date().toISOString()):null,updated_at:new Date().toISOString()};
   if(publishedAt&&!asset.is_published)throw new Error("Publish the source video in Media Library first. The catalog cannot make a private file public.");
   const {error}=await supabase.from("video_catalog").upsert(row,{onConflict:"media_id"});if(error)throw error;
   setStatus(publishedAt?"Video details saved. Its watch page is public.":"Video details saved as a draft.");await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save video details.")}finally{setBusy(false)}
 }
 async function createPlaylist(){
  if(!supabase||busy||!playlistTitle.trim())return;setBusy(true);
  try{const safe=slugify(playlistTitle);if(safe.length<3)throw new Error("Playlist title is too short.");const {error}=await supabase.from("video_playlists").insert({slug:safe,title:playlistTitle.trim().slice(0,100),description:playlistDescription.trim().slice(0,1000),is_published:false,position:playlists.length});if(error)throw error;setPlaylistTitle("");setPlaylistDescription("");setStatus("Playlist created as a private draft.");await load()}catch(e){setStatus(e instanceof Error?e.message:"Could not create playlist.")}finally{setBusy(false)}
 }
 async function addToPlaylist(playlistId:string){
  if(!supabase||!selected||busy)return;setBusy(true);
  try{const {data}=await supabase.from("video_playlist_items").select("position").eq("playlist_id",playlistId).order("position",{ascending:false}).limit(1);const {error}=await supabase.from("video_playlist_items").upsert({playlist_id:playlistId,media_id:selected,position:(data?.[0]?.position??-1)+1},{onConflict:"playlist_id,media_id"});if(error)throw error;setStatus("Video added to playlist.")}catch(e){setStatus(e instanceof Error?e.message:"Could not add video.")}finally{setBusy(false)}
 }
 async function togglePlaylist(p:Playlist){
  if(!supabase||busy)return;setBusy(true);const {error}=await supabase.from("video_playlists").update({is_published:!p.is_published,updated_at:new Date().toISOString()}).eq("id",p.id);setStatus(error?"Playlist update failed.":p.is_published?"Playlist made private.":"Playlist published.");await load();setBusy(false)
 }
 return <section id="creator-video-studio" className="nhen-video-studio">
  <div className="editor-section-title"><span>WATCH / 07</span><h2>Video <em>publishing studio.</em></h2><p>Turn uploaded files into structured watch pages. Manage titles, descriptions, categories, tags, playlists and publication separately from the raw asset library.</p></div>
  <div className="nhen-video-studio-grid">
   <div className="poll-create-form">
    <label>Source video<select value={selected} onChange={e=>choose(e.target.value)}><option value="">Choose an uploaded video…</option>{assets.map(a=><option key={a.media_id} value={a.media_id}>{a.title} · {a.is_published?"Public file":"Private file"}</option>)}</select></label>
    <label>Watch URL slug<input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-new-video"/></label>
    <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} maxLength={5000}/></label>
    <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{["Other","Gaming","Entertainment","Behind the scenes","Announcements","Tutorials","Shorts"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Tags<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="gaming, funny, challenge"/></label>
    <label>Duration in seconds<input type="number" min="1" max="86400" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="Optional"/></label>
    <label className="nhen-video-check"><input type="checkbox" checked={featured} onChange={e=>setFeatured(e.target.checked)}/> Feature this video</label>
    <label className="nhen-video-check"><input type="checkbox" checked={allowComments} onChange={e=>setAllowComments(e.target.checked)}/> Allow moderated comments</label>
    <label className="nhen-video-check"><input type="checkbox" checked={publishedAt} onChange={e=>setPublishedAt(e.target.checked)}/> Publish watch page (requires public source file)</label>
    <button className="button button-primary" type="button" disabled={busy||!selected} onClick={()=>void save()}>{busy?"Saving…":"Save video details ↗"}</button>
   </div>
   <div className="nhen-video-studio-side">
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">YOUR VIDEO CATALOG</span><h3>{videos.length} configured videos</h3>{videos.map(v=><button type="button" key={v.media_id} className="nhen-video-admin-row" onClick={()=>choose(v.media_id)}><span><strong>{assets.find(a=>a.media_id===v.media_id)?.title??v.slug}</strong><small>/{v.slug} · {v.published_at?"PUBLISHED":"DRAFT"}</small></span><b>↗</b></button>)}{!videos.length&&<p className="nhen-muted">Your configured videos will appear here.</p>}</div>
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">PERFORMANCE</span><h3>Video analytics</h3><p className="nhen-muted" style={{fontSize:11}}>Unique signed-in members, reactions and approved comments. Anonymous views are not counted.</p>{analytics.map(a=><div className="nhen-video-analytics-row" key={a.media_id}><strong>{a.title}</strong><span><b>{a.view_count}</b> views</span><span><b>{a.reaction_count}</b> reactions</span><span><b>{a.comment_count}</b> comments</span></div>)}{!analytics.length&&<p className="nhen-muted">Publish a video to begin seeing its performance.</p>}</div>
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">SERIES & PLAYLISTS</span><h3>Organize your watch library</h3><label>Playlist title<input value={playlistTitle} onChange={e=>setPlaylistTitle(e.target.value)} maxLength={100} placeholder="Season one / Best moments"/></label><label>Description<textarea value={playlistDescription} onChange={e=>setPlaylistDescription(e.target.value)} rows={2} maxLength={1000}/></label><button className="button button-secondary" type="button" disabled={busy||!playlistTitle.trim()} onClick={()=>void createPlaylist()}>Create private playlist</button>{playlists.map(p=><div className="nhen-playlist-row" key={p.id}><span><strong>{p.title}</strong><small>{p.is_published?"Public playlist":"Private draft"}</small></span><div><button type="button" disabled={busy||!selected} onClick={()=>void addToPlaylist(p.id)}>Add selected</button><button type="button" disabled={busy} onClick={()=>void togglePlaylist(p)}>{p.is_published?"Make private":"Publish"}</button></div></div>)}</div>
   </div>
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}
