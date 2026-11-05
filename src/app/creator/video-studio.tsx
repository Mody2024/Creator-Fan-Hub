"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Asset={media_id:string;title:string;media_type:string;is_published:boolean;storage_path:string|null;alt_text:string};
type Video={media_id:string;slug:string;description:string;category:string;tags:string[];featured:boolean;allow_comments:boolean;published_at:string|null;duration_seconds:number|null};
type Playlist={id:string;slug:string;title:string;description:string;is_published:boolean;position:number};

function slugify(value:string){return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,110)}

export default function VideoStudio(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [assets,setAssets]=useState<Asset[]>([]),[videos,setVideos]=useState<Video[]>([]),[playlists,setPlaylists]=useState<Playlist[]>([]);
 const [selected,setSelected]=useState(""),[slug,setSlug]=useState(""),[description,setDescription]=useState(""),[category,setCategory]=useState("Other"),[tags,setTags]=useState(""),[duration,setDuration]=useState(""),[featured,setFeatured]=useState(false),[allowComments,setAllowComments]=useState(true),[publishedAt,setPublishedAt]=useState(false);
 const [playlistTitle,setPlaylistTitle]=useState(""),[playlistDescription,setPlaylistDescription]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("Loading video studio…");
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{
  section:"مشاهدة / 07",title:"استوديو ",emphasis:"نشر الفيديو.",intro:"حوّل الملفات المرفوعة إلى صفحات مشاهدة منظمة. أدر العناوين والأوصاف والتصنيفات والوسوم وقوائم التشغيل والنشر بشكل مستقل عن مكتبة الملفات.",source:"مصدر الفيديو",choose:"اختر فيديو مرفوعًا…",youtube:"مصدر يوتيوب",public:"ملف عام",private:"ملف خاص",slug:"رابط صفحة المشاهدة",description:"الوصف",category:"التصنيف",tags:"الوسوم",duration:"المدة بالثواني",optional:"اختياري",feature:"تمييز هذا الفيديو",comments:"السماح بالتعليقات الخاضعة للمراجعة",publish:"نشر صفحة المشاهدة (يتطلب مصدرًا عامًا)",save:"حفظ تفاصيل الفيديو ↗",saving:"جارٍ الحفظ…",catalog:"كتالوج الفيديوهات",configured:"فيديوهات مُعدة",published:"منشور",draft:"مسودة",noVideos:"ستظهر الفيديوهات التي أعددتها هنا.",playlists:"السلاسل وقوائم التشغيل",organize:"نظّم مكتبة المشاهدة",playlistTitle:"عنوان القائمة",playlistDesc:"الوصف",create:"إنشاء قائمة خاصة",publicList:"قائمة عامة",privateList:"مسودة خاصة",add:"إضافة المحدد",makePrivate:"جعلها خاصة",publishList:"نشر",loading:"جارٍ تحميل استوديو الفيديو…",ready:"استوديو الفيديو جاهز. أضف مصادر يوتيوب أو ارفع ملفات من مكتبة الوسائط، ثم أعد صفحات المشاهدة هنا.",notConfigured:"Supabase غير مُعد.",loadError:"تعذر تحميل الوسائط. تحقق من صلاحية حساب المبدع.",selectFirst:"اختر فيديو مصدرًا أولًا.",slugError:"يجب أن يحتوي رابط المشاهدة على ثلاثة أحرف أو أرقام على الأقل.",durationError:"أدخل مدة صحيحة بالثواني من 1 إلى 86400، أو اتركها فارغة.",descriptionError:"يجب ألا يتجاوز الوصف 5000 حرف.",categoryError:"يجب ألا يتجاوز اسم التصنيف 40 حرفًا.",tagsError:"استخدم 12 وسمًا كحد أقصى، ولا يتجاوز كل وسم 40 حرفًا.",privateError:"انشر مصدر الفيديو من مكتبة الوسائط أولًا. لا يمكن للكتالوج جعل ملف خاص عامًا.",savedPublic:"تم حفظ تفاصيل الفيديو. صفحة المشاهدة متاحة للعامة.",savedDraft:"تم حفظ تفاصيل الفيديو كمسودة.",playlistShort:"عنوان القائمة قصير جدًا.",playlistSaved:"تم إنشاء القائمة كمسودة خاصة.",added:"تمت إضافة الفيديو إلى القائمة.",playlistPublic:"تم نشر القائمة.",playlistPrivate:"أصبحت القائمة خاصة.",updateFailed:"فشل تحديث القائمة."
 }:{
  section:"WATCH / 07",title:"Video ",emphasis:"publishing studio.",intro:"Turn uploaded files into structured watch pages. Manage titles, descriptions, categories, tags, playlists and publication separately from the raw asset library.",source:"Source video",choose:"Choose an uploaded video…",youtube:"YouTube source",public:"Public file",private:"Private file",slug:"Watch URL slug",description:"Description",category:"Category",tags:"Tags",duration:"Duration in seconds",optional:"Optional",feature:"Feature this video",comments:"Allow moderated comments",publish:"Publish watch page (requires public source)",save:"Save video details ↗",saving:"Saving…",catalog:"YOUR VIDEO CATALOG",configured:"configured videos",published:"PUBLISHED",draft:"DRAFT",noVideos:"Your configured videos will appear here.",playlists:"SERIES & PLAYLISTS",organize:"Organize your watch library",playlistTitle:"Playlist title",playlistDesc:"Description",create:"Create private playlist",publicList:"Public playlist",privateList:"Private draft",add:"Add selected",makePrivate:"Make private",publishList:"Publish",loading:"Loading video studio…",ready:"Video studio ready. Add YouTube sources or upload files in Media Library, then configure their watch pages here.",notConfigured:"Supabase is not configured.",loadError:"Could not load creator media. Check your creator access.",selectFirst:"Select a source video first.",slugError:"The watch URL needs at least three letters or numbers.",durationError:"Enter a whole-number duration from 1 to 86400 seconds, or leave it blank.",descriptionError:"The description must be 5,000 characters or fewer.",categoryError:"The category must be 40 characters or fewer.",tagsError:"Use up to 12 tags, with no tag longer than 40 characters.",privateError:"Publish the source video in Media Library first. The catalog cannot make a private file public.",savedPublic:"Video details saved. Its watch page is public.",savedDraft:"Video details saved as a draft.",playlistShort:"Playlist title is too short.",playlistSaved:"Playlist created as a private draft.",added:"Video added to playlist.",playlistPublic:"Playlist published.",playlistPrivate:"Playlist made private.",updateFailed:"Playlist update failed."
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 const load=useCallback(async()=>{
  if(!supabase){setStatus(t.notConfigured);return}
  const [mediaResult,videoResult,playlistResult]=await Promise.all([
   supabase.rpc("get_creator_media",{p_limit:200}),
   supabase.from("video_catalog").select("media_id,slug,description,category,tags,featured,allow_comments,published_at,duration_seconds").order("updated_at",{ascending:false}),
   supabase.from("video_playlists").select("id,slug,title,description,is_published,position").order("position")
  ]);
  if(mediaResult.error){setStatus(t.loadError);return}
  setAssets(((mediaResult.data??[]) as Asset[]).filter(x=>x.media_type==="video"||x.media_type==="youtube"));
  setVideos((videoResult.data??[]) as Video[]);setPlaylists((playlistResult.data??[]) as Playlist[]);
  setStatus(t.ready);
 },[supabase]);
 useEffect(()=>{void load()},[load]);
 const current=videos.find(v=>v.media_id===selected);
 function choose(id:string){setSelected(id);const v=videos.find(x=>x.media_id===id);const asset=assets.find(x=>x.media_id===id);setSlug(v?.slug??slugify(asset?.title??""));setDescription(v?.description??asset?.alt_text??"");setCategory(v?.category??"Other");setTags((v?.tags??[]).join(", "));setDuration(v?.duration_seconds?String(v.duration_seconds):"");setFeatured(v?.featured??false);setAllowComments(v?.allow_comments??true);setPublishedAt(!!v?.published_at)}
 async function save(){
  if(!supabase||!selected||busy)return;setBusy(true);setStatus("");
  try{
   const asset=assets.find(x=>x.media_id===selected);if(!asset)throw new Error(t.selectFirst);
   const safeSlug=slugify(slug);if(safeSlug.length<3)throw new Error(t.slugError);
   const cleanDescription=description.trim();
   const cleanCategory=category.trim()||"Other";
   const cleanTags=[...new Set(tags.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean))];
   const parsedDuration=duration.trim()===""?null:Number(duration);
   if(cleanDescription.length>5000)throw new Error(t.descriptionError);
   if(cleanCategory.length>40)throw new Error(t.categoryError);
   if(cleanTags.length>12||cleanTags.some(tag=>tag.length>40))throw new Error(t.tagsError);
   if(parsedDuration!==null&&(!Number.isSafeInteger(parsedDuration)||parsedDuration<1||parsedDuration>86400))throw new Error(t.durationError);
   const row={media_id:selected,slug:safeSlug,description:cleanDescription,category:cleanCategory,tags:cleanTags,duration_seconds:parsedDuration,featured,allow_comments:allowComments,published_at:publishedAt?(current?.published_at??new Date().toISOString()):null,updated_at:new Date().toISOString()};
   if(publishedAt&&!asset.is_published)throw new Error(t.privateError);
   const {error}=await supabase.from("video_catalog").upsert(row,{onConflict:"media_id"});if(error)throw error;
   setStatus(publishedAt?t.savedPublic:t.savedDraft);await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save video details.")}finally{setBusy(false)}
 }
 async function createPlaylist(){
  if(!supabase||busy||!playlistTitle.trim())return;setBusy(true);
  try{const safe=slugify(playlistTitle);if(safe.length<3)throw new Error(t.playlistShort);const {error}=await supabase.from("video_playlists").insert({slug:safe,title:playlistTitle.trim().slice(0,100),description:playlistDescription.trim().slice(0,1000),is_published:false,position:playlists.length});if(error)throw error;setPlaylistTitle("");setPlaylistDescription("");setStatus(t.playlistSaved);await load()}catch(e){setStatus(e instanceof Error?e.message:"Could not create playlist.")}finally{setBusy(false)}
 }
 async function addToPlaylist(playlistId:string){
  if(!supabase||!selected||busy)return;setBusy(true);
  try{const {data}=await supabase.from("video_playlist_items").select("position").eq("playlist_id",playlistId).order("position",{ascending:false}).limit(1);const {error}=await supabase.from("video_playlist_items").upsert({playlist_id:playlistId,media_id:selected,position:(data?.[0]?.position??-1)+1},{onConflict:"playlist_id,media_id"});if(error)throw error;setStatus(t.added)}catch(e){setStatus(e instanceof Error?e.message:"Could not add video.")}finally{setBusy(false)}
 }
 async function togglePlaylist(p:Playlist){
  if(!supabase||busy)return;setBusy(true);const {error}=await supabase.from("video_playlists").update({is_published:!p.is_published,updated_at:new Date().toISOString()}).eq("id",p.id);setStatus(error?t.updateFailed:p.is_published?t.playlistPrivate:t.playlistPublic);await load();setBusy(false)
 }
 return <section id="creator-video-studio" className="nhen-video-studio raye2-video-studio" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="editor-section-title"><span>{t.section}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div>
  <div className="nhen-video-studio-grid">
   <div className="poll-create-form">
    <label>{t.source}<select value={selected} onChange={e=>choose(e.target.value)}><option value="">{t.choose}</option>{assets.map(a=><option key={a.media_id} value={a.media_id}>{a.title} · {a.media_type==="youtube"?t.youtube:a.is_published?t.public:t.private}</option>)}</select></label>
    <label>{t.slug}<input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-new-video"/></label>
    <label>{t.description}<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} maxLength={5000}/></label>
    <label>{t.category}<select value={category} onChange={e=>setCategory(e.target.value)}>{["Other","Gaming","Entertainment","Behind the scenes","Announcements","Tutorials","Mini's"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>{t.tags}<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="gaming, funny, challenge"/></label>
    <label>{t.duration}<input type="number" min="1" max="86400" value={duration} onChange={e=>setDuration(e.target.value)} placeholder={t.optional}/></label>
    <label className="nhen-video-check"><input type="checkbox" checked={featured} onChange={e=>setFeatured(e.target.checked)}/> {t.feature}</label>
    <label className="nhen-video-check"><input type="checkbox" checked={allowComments} onChange={e=>setAllowComments(e.target.checked)}/> {t.comments}</label>
    <label className="nhen-video-check"><input type="checkbox" checked={publishedAt} onChange={e=>setPublishedAt(e.target.checked)}/> {t.publish}</label>
    <button className="button button-primary" type="button" disabled={busy||!selected} onClick={()=>void save()}>{busy?t.saving:t.save}</button>
   </div>
   <div className="nhen-video-studio-side">
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">{t.catalog}</span><h3>{videos.length} {t.configured}</h3>{videos.map(v=><button type="button" key={v.media_id} className="nhen-video-admin-row" onClick={()=>choose(v.media_id)}><span><strong>{assets.find(a=>a.media_id===v.media_id)?.title??v.slug}</strong><small>/{v.slug} · {v.published_at?t.published:t.draft}</small></span><b>↗</b></button>)}{!videos.length&&<p className="nhen-muted">{t.noVideos}</p>}</div>
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">{t.playlists}</span><h3>{t.organize}</h3><label>{t.playlistTitle}<input value={playlistTitle} onChange={e=>setPlaylistTitle(e.target.value)} maxLength={100} placeholder="Season one / Best moments"/></label><label>{t.playlistDesc}<textarea value={playlistDescription} onChange={e=>setPlaylistDescription(e.target.value)} rows={2} maxLength={1000}/></label><button className="button button-secondary" type="button" disabled={busy||!playlistTitle.trim()} onClick={()=>void createPlaylist()}>{t.create}</button>{playlists.map(p=><div className="nhen-playlist-row" key={p.id}><span><strong>{p.title}</strong><small>{p.is_published?t.publicList:t.privateList}</small></span><div><button type="button" disabled={busy||!selected} onClick={()=>void addToPlaylist(p.id)}>{t.add}</button><button type="button" disabled={busy} onClick={()=>void togglePlaylist(p)}>{p.is_published?t.makePrivate:t.publishList}</button></div></div>)}</div>
   </div>
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}
