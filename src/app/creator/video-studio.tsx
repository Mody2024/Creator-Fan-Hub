"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import CreatorVideoSponsorship from "./creator-video-sponsorship";

type Asset={media_id:string;title:string;media_type:string;is_published:boolean;storage_path:string|null;source_url:string|null;thumbnail_path:string|null;alt_text:string;processing_status:string;processing_error:string|null;preview_url:string|null;thumbnail_url:string|null};
type Video={media_id:string;slug:string;description:string;category:string;tags:string[];featured:boolean;allow_comments:boolean;published_at:string|null;duration_seconds:number|null};
type Playlist={id:string;slug:string;title:string;description:string;is_published:boolean;position:number};

function slugify(value:string){return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,110)}

export default function VideoStudio(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [assets,setAssets]=useState<Asset[]>([]),[videos,setVideos]=useState<Video[]>([]),[playlists,setPlaylists]=useState<Playlist[]>([]);
 const [catalogLoadFailed,setCatalogLoadFailed]=useState(false),[playlistLoadFailed,setPlaylistLoadFailed]=useState(false);
 const [selected,setSelected]=useState(""),[slug,setSlug]=useState(""),[description,setDescription]=useState(""),[category,setCategory]=useState("Other"),[tags,setTags]=useState(""),[duration,setDuration]=useState(""),[featured,setFeatured]=useState(false),[allowComments,setAllowComments]=useState(true),[publishedAt,setPublishedAt]=useState(false);
 const [playlistTitle,setPlaylistTitle]=useState(""),[playlistDescription,setPlaylistDescription]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("Loading video studio…");
 const [catalogSearch,setCatalogSearch]=useState("");
 const [catalogFilter,setCatalogFilter]=useState<"all"|"published"|"drafts">("all");
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{
  section:"مشاهدة / 07",catalogSearch:"ابحث في كتالوج الفيديوهات",allVideos:"الكل",publishedOnly:"المنشور",draftsOnly:"المسودات",noCatalogMatches:"لا توجد فيديوهات مطابقة. جرّب بحثًا آخر أو غيّر التصفية.",catalogLoadError:"تعذر تحميل كتالوج الفيديوهات. تحقق من الصلاحيات وحاول مرة أخرى.",playlistLoadError:"تعذر تحميل قوائم التشغيل. ما زالت أدوات استوديو الفيديو الأخرى متاحة.",sourcesReady:"مصادر جاهزة",processing:"قيد المعالجة",draftCount:"مسودات",title:"استوديو ",emphasis:"نشر الفيديو.",intro:"حوّل الملفات المرفوعة إلى صفحات مشاهدة منظمة. أدر العناوين والأوصاف والتصنيفات والوسوم وقوائم التشغيل والنشر بشكل مستقل عن مكتبة الملفات.",source:"مصدر الفيديو",choose:"اختر فيديو مرفوعًا…",youtube:"مصدر يوتيوب",public:"ملف عام",private:"ملف خاص",slug:"رابط صفحة المشاهدة",description:"الوصف",category:"التصنيف",tags:"الوسوم",duration:"المدة بالثواني",optional:"اختياري",feature:"تمييز هذا الفيديو",comments:"السماح بالتعليقات الخاضعة للمراجعة",publish:"نشر صفحة المشاهدة (يتطلب مصدرًا عامًا)",save:"حفظ التعديلات المنشورة ↗",saveDraft:"حفظ كمسودة خاصة ↗",publishNow:"نشر صفحة المشاهدة ↗",unpublish:"إلغاء نشر صفحة المشاهدة",unpublishConfirm:"هل تريد تحويل صفحة المشاهدة العامة إلى مسودة خاصة؟ سيظل ملف الفيديو الأصلي كما هو.",unpublished:"تم تحويل صفحة المشاهدة إلى مسودة خاصة. لم يتغير ملف الفيديو الأصلي.",saving:"جارٍ الحفظ…",catalog:"كتالوج الفيديوهات",configured:"فيديوهات مُعدة",published:"منشور",draft:"مسودة",noVideos:"ستظهر الفيديوهات التي أعددتها هنا.",playlists:"السلاسل وقوائم التشغيل",organize:"نظّم مكتبة المشاهدة",playlistTitle:"عنوان القائمة",playlistDesc:"الوصف",create:"إنشاء قائمة خاصة",publicList:"قائمة عامة",privateList:"مسودة خاصة",add:"إضافة المحدد",makePrivate:"جعلها خاصة",publishList:"نشر",loading:"جارٍ تحميل استوديو الفيديو…",ready:"استوديو الفيديو جاهز. أضف مصادر يوتيوب أو ارفع ملفات من مكتبة الوسائط، ثم أعد صفحات المشاهدة هنا.",notConfigured:"Supabase غير مُعد.",loadError:"تعذر تحميل الوسائط. تحقق من صلاحية حساب المبدع.",selectFirst:"اختر فيديو مصدرًا أولًا.",slugError:"يجب أن يحتوي رابط المشاهدة على ثلاثة أحرف أو أرقام على الأقل.",durationError:"أدخل مدة صحيحة بالثواني من 1 إلى 86400، أو اتركها فارغة.",descriptionError:"يجب ألا يتجاوز الوصف 5000 حرف.",categoryError:"يجب ألا يتجاوز اسم التصنيف 40 حرفًا.",tagsError:"استخدم 12 وسمًا كحد أقصى، ولا يتجاوز كل وسم 40 حرفًا.",privateError:"انشر مصدر الفيديو من مكتبة الوسائط أولًا. لا يمكن للكتالوج جعل ملف خاص عامًا.",processingError:"يجب أن تنتهي معالجة الفيديو بنجاح قبل نشر صفحة المشاهدة.",processingReady:"جاهز",processingWaiting:"في انتظار المعالجة",processingRunning:"قيد المعالجة",processingFailed:"فشلت المعالجة",slugConflict:"رابط المشاهدة مستخدم بالفعل. اختر رابطًا آخر.",readiness:"جاهزية النشر",sourceCheck:"مصدر الفيديو محدد",visibilityCheck:"مصدر الفيديو متاح للعامة",processingCheck:"اكتملت معالجة الفيديو",slugCheck:"رابط المشاهدة صالح وفريد",descriptionCheck:"الوصف ضمن الحد المسموح",preview:"معاينة صفحة المشاهدة",sourcePreview:"معاينة المصدر",thumbnail:"الصورة المصغرة",slugPreview:"رابط الصفحة",descriptionCount:"حرف",tagCount:"وسم",noPreview:"لا تتوفر معاينة لهذا المصدر بعد.",publishBlocked:"أكمل المتطلبات قبل نشر صفحة المشاهدة.",remove:"إزالة المحدد",removed:"تمت إزالة الفيديو من القائمة.",savedPublic:"تم حفظ تفاصيل الفيديو. صفحة المشاهدة متاحة للعامة.",savedDraft:"تم حفظ تفاصيل الفيديو كمسودة.",playlistShort:"عنوان القائمة قصير جدًا.",playlistSaved:"تم إنشاء القائمة كمسودة خاصة.",added:"تمت إضافة الفيديو إلى القائمة.",playlistPublic:"تم نشر القائمة.",playlistPrivate:"أصبحت القائمة خاصة.",updateFailed:"فشل تحديث القائمة."
 }:{
  section:"WATCH / 07",catalogSearch:"Search your video catalog",allVideos:"All",publishedOnly:"Published",draftsOnly:"Drafts",noCatalogMatches:"No matching videos. Try another search or change the filter.",catalogLoadError:"Could not load the video catalog. Check your access and try again.",playlistLoadError:"Could not load playlists. Other video studio tools are still available.",sourcesReady:"Ready sources",processing:"Processing",draftCount:"Drafts",title:"Video ",emphasis:"publishing studio.",intro:"Turn uploaded files into structured watch pages. Manage titles, descriptions, categories, tags, playlists and publication separately from the raw asset library.",source:"Source video",choose:"Choose an uploaded video…",youtube:"YouTube source",public:"Public file",private:"Private file",slug:"Watch URL slug",description:"Description",category:"Category",tags:"Tags",duration:"Duration in seconds",optional:"Optional",feature:"Feature this video",comments:"Allow moderated comments",publish:"Publish watch page (requires public source)",save:"Save published changes ↗",saveDraft:"Save private draft ↗",publishNow:"Publish watch page ↗",unpublish:"Unpublish watch page",unpublishConfirm:"Move this public watch page back to a private draft? The source file will remain unchanged.",unpublished:"Watch page moved to private drafts. The source file remains unchanged.",saving:"Saving… ",catalog:"YOUR VIDEO CATALOG",configured:"configured videos",published:"PUBLISHED",draft:"DRAFT",noVideos:"Your configured videos will appear here.",playlists:"SERIES & PLAYLISTS",organize:"Organize your watch library",playlistTitle:"Playlist title",playlistDesc:"Description",create:"Create private playlist",publicList:"Public playlist",privateList:"Private draft",add:"Add selected",makePrivate:"Make private",publishList:"Publish",loading:"Loading video studio…",ready:"Video studio ready. Add YouTube sources or upload files in Media Library, then configure their watch pages here.",notConfigured:"Supabase is not configured.",loadError:"Could not load creator media. Check your creator access.",selectFirst:"Select a source video first.",slugError:"The watch URL needs at least three letters or numbers.",durationError:"Enter a whole-number duration from 1 to 86400 seconds, or leave it blank.",descriptionError:"The description must be 5,000 characters or fewer.",categoryError:"The category must be 40 characters or fewer.",tagsError:"Use up to 12 tags, with no tag longer than 40 characters.",privateError:"Publish the source video in Media Library first. The catalog cannot make a private file public.",processingError:"Video processing must finish successfully before its watch page can be published.",processingReady:"Ready",processingWaiting:"Waiting",processingRunning:"Processing",processingFailed:"Processing failed",slugConflict:"That watch URL is already in use. Choose another slug.",readiness:"PUBLISHING READINESS",sourceCheck:"A source video is selected",visibilityCheck:"The source is publicly available",processingCheck:"Video processing is complete",slugCheck:"The watch URL is valid and unique",descriptionCheck:"Description is within the limit",preview:"WATCH PAGE PREVIEW",sourcePreview:"SOURCE PREVIEW",thumbnail:"THUMBNAIL",slugPreview:"WATCH URL",descriptionCount:"characters",tagCount:"tags",noPreview:"A preview is not available for this source yet.",publishBlocked:"Complete the requirements before publishing this watch page.",remove:"Remove selected",removed:"Video removed from playlist.",savedPublic:"Video details saved. Its watch page is public.",savedDraft:"Video details saved as a draft.",playlistShort:"Playlist title is too short.",playlistSaved:"Playlist created as a private draft.",added:"Video added to playlist.",playlistPublic:"Playlist published.",playlistPrivate:"Playlist made private.",updateFailed:"Playlist update failed."
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
  const rawAssets=((mediaResult.data??[]) as Omit<Asset,"processing_status"|"processing_error">[]).filter(x=>x.media_type==="video"||x.media_type==="youtube");
  const statusResult=await supabase.rpc("get_creator_media_processing_status",{p_media_ids:rawAssets.map(x=>x.media_id)});
  if(statusResult.error){setStatus(t.loadError);return}
  type ProcessingStatus={media_id:string;processing_status:string;processing_error:string|null};
  const processingRows=(statusResult.data??[]) as ProcessingStatus[];
  const processingById=new Map<string,ProcessingStatus>(processingRows.map(row=>[row.media_id,row]));
  // The status RPC is owner-scoped; only assets returned by it may enter this creator studio.
  const ownedAssets=rawAssets.filter(asset=>processingById.has(asset.media_id));
  const resolvedAssets=await Promise.all(ownedAssets.map(async asset=>{
   const resolveManagedUrl=async(path:string|null)=>{
    if(!path)return null;
    const [bucket,...parts]=path.split("/");
    const objectPath=parts.join("/");
    if(!objectPath||!["creator-media-private","creator-media-public"].includes(bucket))return null;
    if(asset.is_published&&bucket==="creator-media-public"){
     const {data}=supabase.storage.from(bucket).getPublicUrl(objectPath);
     return data.publicUrl||null;
    }
    if(!asset.is_published&&bucket==="creator-media-private"){
     const {data,error}=await supabase.storage.from(bucket).createSignedUrl(objectPath,300);
     return error?null:data?.signedUrl??null;
    }
    return null;
   };
   const youtubeId=asset.media_type==="youtube"?asset.source_url?.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]:null;
   const [previewUrl,thumbnailUrl]=await Promise.all([
    asset.media_type==="youtube"?(youtubeId?Promise.resolve("https://img.youtube.com/vi/"+youtubeId+"/hqdefault.jpg"):Promise.resolve(null)):resolveManagedUrl(asset.storage_path),
    resolveManagedUrl(asset.thumbnail_path)
   ]);
   const processing=processingById.get(asset.media_id);
   return {...asset,processing_status:asset.media_type==="youtube"?"ready":processing?.processing_status??"uploaded",processing_error:processing?.processing_error??null,preview_url:previewUrl,thumbnail_url:thumbnailUrl};
  }));
  setAssets(resolvedAssets);
  setCatalogLoadFailed(!!videoResult.error);setPlaylistLoadFailed(!!playlistResult.error);
  setVideos(videoResult.error?[]:(videoResult.data??[]) as Video[]);
  setPlaylists(playlistResult.error?[]:(playlistResult.data??[]) as Playlist[]);
  setStatus(t.ready);
 },[supabase]);
 useEffect(()=>{void load()},[load]);
 const current=videos.find(v=>v.media_id===selected);
 const visibleVideos=useMemo(()=>{
  const query=catalogSearch.trim().toLocaleLowerCase();
  return videos.filter(video=>{
   const asset=assets.find(item=>item.media_id===video.media_id);
   const matchesStatus=catalogFilter==="all"||(catalogFilter==="published"?!!video.published_at:!video.published_at);
   const searchable=[video.slug,video.description,video.category,...video.tags,asset?.title??""].join(" ").toLocaleLowerCase();
   return matchesStatus&&(!query||searchable.includes(query));
  });
 },[videos,assets,catalogSearch,catalogFilter]);
 const readySources=assets.filter(asset=>asset.media_type==="youtube"||asset.processing_status==="ready").length;
 const processingSources=assets.filter(asset=>["uploaded","waiting","queued","processing"].includes(asset.processing_status)).length;
 const draftVideos=videos.filter(video=>!video.published_at).length;
 const selectedAsset=assets.find(asset=>asset.media_id===selected);
 const normalizedSlug=slugify(slug);
 const slugConflict=!!normalizedSlug&&videos.some(video=>video.slug===normalizedSlug&&video.media_id!==selected);
 const sourceIsPublic=!!selectedAsset&&(selectedAsset.media_type==="youtube"||selectedAsset.is_published);
 const sourceIsReady=!!selectedAsset&&(selectedAsset.media_type==="youtube"||selectedAsset.processing_status==="ready");
 const publicationChecks=[!!selectedAsset,sourceIsPublic,sourceIsReady,normalizedSlug.length>=3&&!slugConflict,description.trim().length<=5000];
 const canPublish=publicationChecks.every(Boolean);


 function choose(id:string){setSelected(id);const v=videos.find(x=>x.media_id===id);const asset=assets.find(x=>x.media_id===id);setSlug(v?.slug??slugify(asset?.title??""));setDescription(v?.description??asset?.alt_text??"");setCategory(v?.category??"Other");setTags((v?.tags??[]).join(", "));setDuration(v?.duration_seconds?String(v.duration_seconds):"");setFeatured(v?.featured??false);setAllowComments(v?.allow_comments??true);setPublishedAt(!!v?.published_at)}
 async function save(publish?:boolean){
  const shouldPublish=publish??publishedAt;
  if(!supabase||!selected||busy)return;
  if(current?.published_at&&!shouldPublish&&!window.confirm(t.unpublishConfirm))return;
  setBusy(true);setStatus("");
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
   if(shouldPublish&&!asset.is_published)throw new Error(t.privateError);
   if(shouldPublish){
    const {data:slugOwner,error:slugLookupError}=await supabase.from("video_catalog").select("media_id").eq("slug",safeSlug).neq("media_id",selected).maybeSingle();
    if(slugLookupError)throw slugLookupError;
    if(slugOwner)throw new Error(t.slugConflict);
   }
   if(shouldPublish&&asset.media_type!=="youtube"&&asset.processing_status!=="ready")throw new Error(t.processingError);
   const {data:saved,error}=await supabase.rpc("save_raye2_video_catalog",{
    p_media_id:selected,p_slug:safeSlug,p_description:cleanDescription,p_category:cleanCategory,
    p_tags:cleanTags,p_duration_seconds:parsedDuration,p_featured:featured,
    p_allow_comments:allowComments,p_publish:shouldPublish
   });
   if(error)throw error;
   if(!Array.isArray(saved)||!saved[0]?.saved)throw new Error("This video could not be saved. Confirm it belongs to your creator account.");
   setPublishedAt(shouldPublish);setStatus(shouldPublish?t.savedPublic:t.savedDraft);await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save video details.")}finally{setBusy(false)}
 }
 async function unpublish(){
  if(!supabase||!selected||busy||!current?.published_at)return;
  if(!window.confirm(t.unpublishConfirm))return;
  setBusy(true);setStatus("");
  try{
   const {data:saved,error}=await supabase.rpc("save_raye2_video_catalog",{
    p_media_id:selected,p_slug:current.slug,p_description:current.description,
    p_category:current.category,p_tags:current.tags,p_duration_seconds:current.duration_seconds,
    p_featured:current.featured,p_allow_comments:current.allow_comments,p_publish:false
   });
   if(error)throw error;
   if(!Array.isArray(saved)||!saved[0]?.saved)throw new Error("This watch page could not be moved to drafts.");
   setPublishedAt(false);setStatus(t.unpublished);await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not unpublish watch page.")}
  finally{setBusy(false)}
 }
 async function createPlaylist(){
  if(!supabase||busy||!playlistTitle.trim())return;setBusy(true);
  try{const {data:userData,error:userError}=await supabase.auth.getUser();if(userError||!userData.user)throw new Error("Sign in again to create a playlist.");const safe=slugify(playlistTitle);if(safe.length<3)throw new Error(t.playlistShort);const {error}=await supabase.from("video_playlists").insert({owner_id:userData.user.id,slug:safe,title:playlistTitle.trim().slice(0,100),description:playlistDescription.trim().slice(0,1000),is_published:false,position:playlists.length});if(error)throw error;setPlaylistTitle("");setPlaylistDescription("");setStatus(t.playlistSaved);await load()}catch(e){setStatus(e instanceof Error?e.message:"Could not create playlist.")}finally{setBusy(false)}
 }
 async function addToPlaylist(playlistId:string){
  if(!supabase||!selected||busy)return;setBusy(true);
  try{const {data}=await supabase.from("video_playlist_items").select("position").eq("playlist_id",playlistId).order("position",{ascending:false}).limit(1);const {error}=await supabase.from("video_playlist_items").upsert({playlist_id:playlistId,media_id:selected,position:(data?.[0]?.position??-1)+1},{onConflict:"playlist_id,media_id"});if(error)throw error;setStatus(t.added)}catch(e){setStatus(e instanceof Error?e.message:"Could not add video.")}finally{setBusy(false)}
 }
 async function removeFromPlaylist(playlistId:string){
  if(!supabase||!selected||busy)return;setBusy(true);
  try{
   const {error}=await supabase.from("video_playlist_items").delete().eq("playlist_id",playlistId).eq("media_id",selected);
   if(error)throw error;
   setStatus(t.removed);
  }catch(e){setStatus(e instanceof Error?e.message:"Could not remove video from playlist.")}finally{setBusy(false)}
 }
 async function togglePlaylist(p:Playlist){
  if(!supabase||busy)return;setBusy(true);const {error}=await supabase.from("video_playlists").update({is_published:!p.is_published,updated_at:new Date().toISOString()}).eq("id",p.id);setStatus(error?t.updateFailed:p.is_published?t.playlistPrivate:t.playlistPublic);await load();setBusy(false)
 }
 return <section id="creator-video-studio" className="nhen-video-studio raye2-video-studio" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="editor-section-title"><span>{t.section}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div>
  <div className="raye2-video-overview" aria-label={isArabic?"ملخص استوديو الفيديو":"Video studio overview"}>
   <article><span>{isArabic?"مصادر الفيديو":"VIDEO SOURCES"}</span><strong>{assets.length}</strong><small>{isArabic?"ملفاتك المؤهلة":"Eligible owned assets"}</small></article>
   <article><span>{t.sourcesReady.toUpperCase()}</span><strong>{readySources}</strong><small>{isArabic?"جاهزة لصفحة المشاهدة":"Ready for watch pages"}</small></article>
   <article><span>{t.processing.toUpperCase()}</span><strong>{processingSources}</strong><small>{isArabic?"بانتظار اكتمال المعالجة":"Awaiting processing"}</small></article>
   <article><span>{t.draftCount.toUpperCase()}</span><strong>{draftVideos}</strong><small>{isArabic?"صفحات مشاهدة خاصة":"Private watch pages"}</small></article>
  </div>
  <div className="nhen-video-studio-grid">
   <div className="poll-create-form">
    <label>{t.source}<select value={selected} onChange={e=>choose(e.target.value)}><option value="">{t.choose}</option>{assets.map(a=><option key={a.media_id} value={a.media_id}>{a.title} · {a.media_type==="youtube"?t.youtube:a.is_published?t.public:t.private} · {a.processing_status==="ready"?t.processingReady:a.processing_status==="processing"?t.processingRunning:a.processing_status==="failed"?t.processingFailed:t.processingWaiting}</option>)}</select></label>
    <label>{t.slug}<input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-new-video"/><small className="raye2-field-hint">{t.slugPreview}: /watch/{normalizedSlug||"your-video"}</small></label>
    <label>{t.description}<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} maxLength={5000}/><small className="raye2-field-hint">{description.length.toLocaleString(locale)} / 5,000 {t.descriptionCount}</small></label>
    <label>{t.category}<select value={category} onChange={e=>setCategory(e.target.value)}>{["Other","Gaming","Entertainment","Behind the scenes","Announcements","Tutorials","Mini's"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>{t.tags}<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="gaming, funny, challenge"/><small className="raye2-field-hint">{tags.split(",").map(x=>x.trim()).filter(Boolean).length} / 12 {t.tagCount}</small></label>
    <label>{t.duration}<input type="number" min="1" max="86400" value={duration} onChange={e=>setDuration(e.target.value)} placeholder={t.optional}/></label>
    <label className="nhen-video-check"><input type="checkbox" checked={featured} onChange={e=>setFeatured(e.target.checked)}/> {t.feature}</label>
    <label className="nhen-video-check"><input type="checkbox" checked={allowComments} onChange={e=>setAllowComments(e.target.checked)}/> {t.comments}</label>
    <label className="nhen-video-check"><input type="checkbox" checked={publishedAt} disabled={!canPublish&&!publishedAt} onChange={e=>setPublishedAt(e.target.checked)}/> {t.publish}</label>
    <aside className="raye2-publish-readiness" aria-label={t.readiness}><strong>{t.readiness}</strong><ul>
     {[t.sourceCheck,t.visibilityCheck,t.processingCheck,t.slugCheck,t.descriptionCheck].map((label,index)=><li key={label} data-ready={publicationChecks[index]?"true":"false"}><span aria-hidden="true">{publicationChecks[index]?"✓":"○"}</span>{label}</li>)}
    </ul>{!canPublish&&<p>{t.publishBlocked}</p>}</aside>
    {selectedAsset?.processing_status==="failed"&&<p className="nhen-muted" role="status">{selectedAsset.processing_error??t.processingFailed}</p>}
    <div className="raye2-video-save-actions"><button className="button button-secondary" type="button" disabled={busy||!selected||publishedAt} onClick={()=>void save(false)}>{busy?t.saving:t.saveDraft}</button><button className="button button-primary" type="button" disabled={busy||!selected||!canPublish} onClick={()=>void save(true)}>{busy?t.saving:publishedAt?t.save:t.publishNow}</button>{publishedAt&&<button className="button button-secondary" type="button" disabled={busy||!current?.published_at} onClick={()=>void unpublish()}>{t.unpublish}</button>}</div>
   </div>
   <div className="nhen-video-studio-side">
    <section className="nhen-card nhen-card-pad raye2-watch-preview" aria-label={t.preview}>
     <span className="eyebrow">{t.preview}</span>
     <h3>{current?(assets.find(asset=>asset.media_id===selected)?.title??slug):t.sourcePreview}</h3>
     <div className="raye2-watch-preview-media">
      {selectedAsset?.media_type==="youtube"&&selectedAsset.preview_url?<img src={selectedAsset.preview_url} alt={selectedAsset.title+" "+t.thumbnail} loading="lazy"/>:selectedAsset?.thumbnail_url?<img src={selectedAsset.thumbnail_url} alt={selectedAsset.title+" "+t.thumbnail} loading="lazy"/>:selectedAsset?.preview_url&&selectedAsset.media_type==="video"?<video src={selectedAsset.preview_url} controls preload="metadata" playsInline aria-label={t.sourcePreview}/>:<span>{selectedAsset?t.noPreview:t.choose}</span>}
     </div>
     <div className="raye2-watch-preview-meta"><strong>/watch/{normalizedSlug||"your-video"}</strong><span>{category} · {tags.split(",").map(x=>x.trim()).filter(Boolean).length} {t.tagCount}</span><p>{description.trim()||t.noPreview}</p></div>
    </section>
    <div className="nhen-card nhen-card-pad raye2-video-catalog"><span className="eyebrow">{t.catalog}</span><h3>{visibleVideos.length} / {videos.length} {t.configured}</h3><label className="raye2-video-search"><span>{t.catalogSearch}</span><input type="search" value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder={isArabic?"العنوان أو الرابط أو الوسم":"Title, URL, category or tag"}/></label><div className="raye2-video-filters" role="group" aria-label={isArabic?"تصفية الفيديوهات":"Filter videos"}><button type="button" aria-pressed={catalogFilter==="all"} className={catalogFilter==="all"?"active":""} onClick={()=>setCatalogFilter("all")}>{t.allVideos}</button><button type="button" aria-pressed={catalogFilter==="published"} className={catalogFilter==="published"?"active":""} onClick={()=>setCatalogFilter("published")}>{t.publishedOnly}</button><button type="button" aria-pressed={catalogFilter==="drafts"} className={catalogFilter==="drafts"?"active":""} onClick={()=>setCatalogFilter("drafts")}>{t.draftsOnly}</button></div>{visibleVideos.map(v=>{const asset=assets.find(a=>a.media_id===v.media_id);return <button type="button" key={v.media_id} className={"nhen-video-admin-row "+(selected===v.media_id?"raye2-selected-video":"")} aria-pressed={selected===v.media_id} onClick={()=>choose(v.media_id)}>{asset?.thumbnail_url||asset?.preview_url?<img className="raye2-video-row-thumb" src={asset.thumbnail_url??asset.preview_url??""} alt="" loading="lazy"/>:<span className="raye2-video-row-thumb raye2-video-row-fallback">▶</span>}<span><strong>{asset?.title??v.slug}</strong><small>/{v.slug} · {v.published_at?t.published:t.draft}</small></span><b>↗</b></button>})}{!videos.length&&<p className="nhen-muted" role={catalogLoadFailed?"alert":"status"}>{catalogLoadFailed?t.catalogLoadError:t.noVideos}</p>}{videos.length>0&&!visibleVideos.length&&<p className="nhen-muted">{t.noCatalogMatches}</p>}</div>
    <div className="nhen-card nhen-card-pad"><span className="eyebrow">{t.playlists}</span><h3>{t.organize}</h3><label>{t.playlistTitle}<input value={playlistTitle} onChange={e=>setPlaylistTitle(e.target.value)} maxLength={100} placeholder="Season one / Best moments"/></label><label>{t.playlistDesc}<textarea value={playlistDescription} onChange={e=>setPlaylistDescription(e.target.value)} rows={2} maxLength={1000}/></label><button className="button button-secondary" type="button" disabled={busy||!playlistTitle.trim()} onClick={()=>void createPlaylist()}>{t.create}</button>{playlistLoadFailed?<p className="nhen-muted" role="alert">{t.playlistLoadError}</p>:playlists.map(p=><div className="nhen-playlist-row" key={p.id}><span><strong>{p.title}</strong><small>{p.is_published?t.publicList:t.privateList}</small></span><div><button type="button" disabled={busy||!selected} onClick={()=>void addToPlaylist(p.id)}>{t.add}</button><button type="button" disabled={busy||!selected} onClick={()=>void removeFromPlaylist(p.id)}>{t.remove}</button><button type="button" disabled={busy} onClick={()=>void togglePlaylist(p)}>{p.is_published?t.makePrivate:t.publishList}</button></div></div>)}</div>
   </div>
  </div>
  {selected&&current?.published_at&&<CreatorVideoSponsorship mediaId={selected} assets={assets}/>}
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}
