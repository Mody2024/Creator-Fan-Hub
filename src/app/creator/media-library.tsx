"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";

type MediaKind = "image" | "video" | "audio" | "sprite";
type StorageCapacity = {used_bytes:number;reserved_bytes:number;quota_bytes:number;available_bytes:number;usage_percent:number};
type MediaHealth = StorageCapacity & {orphan_candidate_count:number;orphan_candidate_bytes:number;oldest_orphan_candidate_at:string|null;expired_reservations_cleaned:number};
type MediaRow = { media_id: string; title: string; media_type: MediaKind | "model3d" | "youtube"; source_url: string | null; storage_path: string | null; alt_text: string; metadata: Record<string, unknown>; is_published: boolean; created_at: string; processing_status?: string; processing_attempts?: number; processing_error?: string|null; processing_updated_at?: string; processing_completed_at?: string|null; size_bytes?: number|null; mime_type?: string|null; thumbnail_path?: string|null; preview_url?: string | null };
const LIMIT = 50 * 1024 * 1024;
const ACCEPTED: Record<string, MediaKind> = { "image/jpeg":"image", "image/png":"image", "image/webp":"image", "image/gif":"image", "video/mp4":"video", "video/webm":"video", "audio/mpeg":"audio", "audio/mp4":"audio", "audio/wav":"audio", "audio/ogg":"audio" };

function safeFileName(name: string) { return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-100) || "asset"; }

export default function MediaLibrary() {
  const [rows,setRows] = useState<MediaRow[]>([]);
  const [capacity,setCapacity] = useState<StorageCapacity|null>(null);
  const [health,setHealth] = useState<MediaHealth|null>(null);
  const [file,setFile] = useState<File|null>(null);
  const [title,setTitle] = useState("");
  const [alt,setAlt] = useState("");
  const [youtubeUrl,setYoutubeUrl] = useState("");
  const [editingId,setEditingId] = useState("");
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState<"all"|"published"|"drafts">("all");
  const [kind,setKind] = useState<MediaKind>("image");
  const [busy,setBusy] = useState(false);
  const [uploadProgress,setUploadProgress] = useState<number|null>(null);
  const [uploadController,setUploadController] = useState<AbortController|null>(null);
  const [status,setStatus] = useState("Media uploads use the free Supabase Storage project.");
  const [ready,setReady] = useState(false);
  const [locale,setLocale]=useState<"en"|"ar">("en");
  const isArabic=locale==="ar";
  const t=isArabic?{
    eyebrow:"الوسائط / 06",title:"مكتبة ",emphasis:"ملفاتك.",intro:"ارفع الشعارات والصور والمقاطع القصيرة والصوت وصور الـ sprites. تظل الملفات خاصة حتى تنشرها.",storage:"حد التخزين الآمن المجاني في Raye2",available:"متاح",storageNote:"تتوقف عمليات الرفع قبل حد الخطة المجانية الاحترازي. يشمل الحساب ملفات المشروع على Supabase.",health:"صحة التخزين",orphanCandidates:"ملفات يتيمة محتملة",expiredCleaned:"حجوزات منتهية تم تنظيفها",healthNote:"هذه مؤشرات للمراجعة فقط؛ لا يتم حذف أي ملف وسائط تلقائيًا.",external:"أضف فيديو رسميًا مستضافًا خارجيًا",youtube:"رابط فيديو يوتيوب",addYoutube:"إضافة مصدر يوتيوب ↗",youtubeNote:"يستضيف يوتيوب الفيديو؛ بينما تدير Raye2 صفحة المشاهدة وميزات المجتمع. لا يستهلك هذا تخزين فيديوهات Raye2.",choose:"اختر ملفًا",editing:"تعديل البيانات الوصفية فقط. لن يتغير الملف المخزن أو حالة النشر.",selected:"الملف المحدد",uploading:"جارٍ الرفع",resume:"إذا انقطع الاتصال، اختر الملف نفسه مرة أخرى لاستكمال الرفع.",name:"اسم الملف",alt:"نص بديل / وصف",altPlaceholder:"صف الصورة لتسهيل الوصول",limits:"الحد الأقصى 50 ميجابايت لكل ملف. لا تُقبل ملفات SVG أو الملفات التنفيذية. ملفات النماذج ثلاثية الأبعاد غير مفعلة بعد.",working:"جارٍ التنفيذ…",save:"حفظ تفاصيل الملف ↗",upload:"رفع كمسودة خاصة ↗",cancel:"إلغاء",stored:"الملفات المخزنة",refresh:"تحديث",search:"البحث في الملفات",searchPlaceholder:"الاسم أو النوع أو الوصف",visibility:"إمكانية الظهور",all:"كل الملفات",published:"منشور",drafts:"مسودات خاصة",loading:"جارٍ تحميل الوسائط…",empty:"لا توجد ملفات بعد. ارفع أول ملف للبدء.",noMatch:"لا توجد ملفات مطابقة.",tryAgain:"جرّب بحثًا آخر أو غيّر عامل التصفية.",clear:"مسح عوامل التصفية",edit:"تعديل التفاصيل",private:"نقل إلى الخاص",publish:"نشر",delete:"حذف الملف",youtubeSource:"يوتيوب · مصدر خارجي",hosted:"مستضاف لدى يوتيوب",public:"عام",privateDraft:"مسودة خاصة",status:"حالة المكتبة",loaded:"تم تحميل مكتبة الوسائط. تظل الملفات غير المنشورة في التخزين الخاص.",previewError:"تم تحميل المكتبة، لكن بعض المعاينات غير متاحة. تحقق من أذونات التخزين ومسارات الملفات.",signedOut:"سجّل الدخول بحساب مبدع مصرح له لإدارة الوسائط.",capacityError:"تعذر حجز مساحة تخزين مجانية. لم يبدأ الرفع.",unsupported:"نوع ملف غير مدعوم. اختر صورة أو فيديو MP4/WebM أو ملف صوت مدعوم.",tooLarge:"يتجاوز هذا الملف حد 50 ميجابايت لكل ملف.",youtubeAdded:"تمت إضافة مصدر يوتيوب كمسودة خاصة في Raye2. أعد إعداد صفحة المشاهدة في استوديو الفيديو."
  }:{
    eyebrow:"MEDIA / 06",title:"Your asset ",emphasis:"library.",intro:"Upload logos, photos, short clips, sound and sprite images. Files stay private until you publish them.",storage:"Raye2 free storage safety limit",available:"available",storageNote:"Uploads stop before the conservative free-plan limit. This counts files across the Supabase project.",health:"Storage health",orphanCandidates:"possible orphan objects",expiredCleaned:"expired upload reservations cleaned",healthNote:"These are review candidates only. Media objects are never deleted automatically.",external:"Add an externally hosted official video",youtube:"YouTube video URL",addYoutube:"Add YouTube source ↗",youtubeNote:"YouTube hosts the video; Raye2 manages its watch page and community features. It does not use Raye2 video storage.",choose:"Choose file",editing:"Editing metadata only. The stored file and publication state will not change.",selected:"Selected file",uploading:"Uploading",resume:"If the connection drops, select the same file again to resume this upload.",name:"Asset name",alt:"Alternative text / description",altPlaceholder:"Describe the image for accessibility",limits:"Maximum 50 MB per file. SVG and executable files are not accepted. 3D model files are not enabled yet.",working:"Working…",save:"Save asset details ↗",upload:"Upload private draft ↗",cancel:"Cancel",stored:"Stored assets",refresh:"Refresh",search:"Search assets",searchPlaceholder:"Name, type or description",visibility:"Visibility",all:"All assets",published:"Published",drafts:"Private drafts",loading:"Loading media…",empty:"No assets yet. Upload your first file to begin.",noMatch:"No matching assets.",tryAgain:"Try another search or change the visibility filter.",clear:"Clear filters",edit:"Edit details",private:"Move to private",publish:"Publish",delete:"Delete file",youtubeSource:"YOUTUBE · EXTERNAL SOURCE",hosted:"Hosted by YouTube",public:"PUBLIC",privateDraft:"PRIVATE DRAFT",status:"Library status",loaded:"Media library loaded. Unpublished files stay in private storage.",previewError:"Media library loaded, but some previews are unavailable. Check storage permissions and file paths.",signedOut:"Sign in with an authorized creator account to manage media.",capacityError:"Free storage capacity could not be reserved. No upload was started.",unsupported:"Unsupported file type. Choose an image, MP4/WebM video, or supported audio file.",tooLarge:"This file exceeds the 50 MB per-file limit.",youtubeAdded:"YouTube source added as a private Raye2 draft. Configure its watch page in Video Studio."
  };
  useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

  const load = useCallback(async () => {
    setReady(false);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("Supabase is not configured for this preview."); setReady(true); return; }
    try {
      const {data:userData,error:userError} = await supabase.auth.getUser();
      if (userError || !userData.user) { setRows([]); setStatus("Sign in with an authorized creator account to manage media."); setReady(true); return; }
      const [{data,error},{data:capacityData},{data:healthData,error:healthError}] = await Promise.all([
        supabase.rpc("get_creator_media",{p_limit:100}),
        supabase.rpc("get_nhen_storage_capacity"),
        supabase.rpc("get_nhen_media_health")
      ]);
      if (error) throw new Error("Could not load media. Confirm the creator-media migration is applied and this account is authorized.");
      setCapacity((capacityData?.[0] as StorageCapacity|undefined)??null);
      if(!healthError) setHealth((healthData?.[0] as MediaHealth|undefined)??null);
      const items = (data ?? []) as MediaRow[];
      const {data:processingRows,error:processingError}=items.length
        ? await supabase.rpc("get_creator_media_processing_status",{p_media_ids:items.map(item=>item.media_id)})
        : {data:[],error:null};
      const processingById=new Map((processingRows??[]).map((entry:{media_id:string;processing_status:string;processing_attempts:number;processing_error:string|null;processing_updated_at:string;processing_completed_at:string|null;size_bytes:number|null;mime_type:string|null;thumbnail_path:string|null})=>[entry.media_id,entry]));
      const enriched = await Promise.all(items.map(async original => {
        const item={...original,...(processingById.get(original.media_id)??{})};

        if (item.media_type === "youtube" && item.source_url) {
          const id = item.source_url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1];
          return {...item,preview_url:id ? "https://img.youtube.com/vi/"+id+"/hqdefault.jpg" : null};
        }
        const previewPath=item.thumbnail_path??item.storage_path;
        if (!previewPath) return {...item,preview_url:null};
        const [bucket,...parts] = previewPath.split("/");
        const path = parts.join("/");
        if (!path || !["creator-media-private","creator-media-public"].includes(bucket) || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path)) return {...item,preview_url:null};
        try {
          if (bucket === "creator-media-public" && item.is_published) {
            const {data:publicData} = supabase.storage.from(bucket).getPublicUrl(path);
            return {...item,preview_url:publicData.publicUrl || null};
          }
          if (bucket === "creator-media-private" && !item.is_published) {
            const {data:signed,error:signedError} = await supabase.storage.from(bucket).createSignedUrl(path,300);
            if (signedError) return {...item,preview_url:null};
            return {...item,preview_url:signed?.signedUrl ?? null};
          }
          return {...item,preview_url:null};
        } catch {
          return {...item,preview_url:null};
        }
      }));
      setRows(enriched);
      const missingPreviews = enriched.some(item => (item.thumbnail_path || item.storage_path) && !item.preview_url);
      const waitingProcessing=enriched.filter(item=>item.media_type!=="youtube"&&item.processing_status!=="ready").length;
      setStatus(processingError
        ? "Media loaded, but processing status is unavailable. Apply the media lifecycle migration."
        : waitingProcessing
          ? `Media loaded. ${waitingProcessing} asset(s) are uploaded and awaiting a processing worker; they are not marked playback-ready.`
          : missingPreviews
            ? "Media library loaded, but some previews are unavailable. Check storage permissions and file paths."
            : "Media library loaded. Unpublished files stay in private storage.");
    } catch (e) {
      setRows([]);
      setStatus(e instanceof Error ? e.message : "Could not load the media library. Check your connection and try again.");
    } finally {
      setReady(true);
    }
  },[]);

  useEffect(()=>{ void load(); },[load]);

  function selectFile(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) return;
    if (!ACCEPTED[selected.type]) { setStatus("Unsupported file type. Choose an image, MP4/WebM video, or supported audio file."); e.target.value=""; return; }
    if (selected.size > LIMIT) { setStatus("This file exceeds the 50 MB per-file limit."); e.target.value=""; return; }
    setFile(selected); setKind(ACCEPTED[selected.type]); setTitle(current=>current || selected.name.replace(/\.[^.]+$/,"").slice(0,120)); setStatus("File selected and type checked.");
  }

  async function upload() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !file || busy) return;
    setBusy(true);
    let reservationId:string|null=null;
    let uploadSession:ReturnType<typeof getResumableUploadSession>|null=null;
    let uploaded=false;
    try {
      const {data:userData} = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in before uploading.");
      const {data:admin,error:adminError} = await supabase.from("creator_admins").select("role").eq("user_id",userData.user.id).eq("active",true).maybeSingle();
      if (adminError || !admin || !["owner","admin","creator"].includes(admin.role)) throw new Error("Official video and media publishing is restricted to assigned Raye2 creators.");
      uploadSession=getResumableUploadSession(userData.user.id,"creator-media-private",file);
      const previousReservation=uploadSession.getReservationId();
      if(previousReservation){
        const {data:reused,error:reuseError}=await supabase.rpc("reuse_nhen_media_upload_reservation",{p_reservation_id:previousReservation,p_bytes:file.size,p_bucket:"creator-media-private"});
        if(!reuseError && reused) reservationId=previousReservation;
      }
      if(!reservationId){
        const {data:reservation,error:reservationError}=await supabase.rpc("reserve_nhen_media_upload",{p_bytes:file.size,p_bucket:"creator-media-private"});
        if(reservationError || !reservation?.[0]?.reservation_id) throw reservationError??new Error("Free storage capacity could not be reserved. No upload was started.");
        const newReservationId=reservation[0].reservation_id as string;
        reservationId=newReservationId;
        uploadSession.saveReservation(newReservationId);
      }
      const path = uploadSession.objectName;
      const controller=new AbortController();
      setUploadController(controller);
      await uploadToSupabaseStorage({client:supabase,bucketName:"creator-media-private",objectName:path,file,onProgress:setUploadProgress,signal:controller.signal});
      uploaded=true;
      const {data:saved,error:saveError} = await supabase.rpc("save_creator_media",{
        p_media_id:null,p_title:title.trim(),p_media_type:kind,p_source_url:null,
        p_storage_path:`creator-media-private/${path}`,p_alt_text:alt.trim(),
        p_metadata:{originalName:file.name,mimeType:file.type,size:file.size},
        p_is_published:false
      });
      if (saveError || !saved?.[0]?.saved) {
        const {error:cleanupError}=await supabase.storage.from("creator-media-private").remove([path]);
        if(cleanupError) {
          throw new Error("Media metadata was not saved, and the uploaded private file could not be cleaned up. Refresh the library and contact the site administrator if it remains orphaned.");
        }
        throw saveError ?? new Error("Media metadata was not saved. The uploaded file was removed.");
      }
      setFile(null); setTitle(""); setAlt("");
      const input=document.getElementById("creator-media-file") as HTMLInputElement|null; if(input) input.value="";
      setStatus("Upload saved as a private draft. Publish it when ready.");
      await load();
    } catch (e) { setStatus(!uploaded ? "Upload interrupted. Your resumable session is retained; choose the same file again to continue. " + (e instanceof Error ? e.message : "") : e instanceof Error ? e.message : "The uploaded file could not be saved. Please refresh the media library."); }
    finally {
      if(uploaded && uploadSession) {
        uploadSession.clear();
        if(reservationId) { try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:reservationId}); } catch { /* reservation expires automatically */ } }
      }
      setUploadController(null);
      setUploadProgress(null);
      setBusy(false);
    }
  }

  async function addYoutubeSource() {
    const supabase=getSupabaseBrowserClient();
    if(!supabase || busy || editingId) return;
    let parsed: URL;
    try { parsed=new URL(youtubeUrl.trim()); } catch { setStatus("Enter a valid YouTube video URL."); return; }
    const host=parsed.hostname.replace(/^www\./,"").toLowerCase();
    const parts=parsed.pathname.split("/").filter(Boolean);
    const videoId=host==="youtu.be" ? parts[0] :
      ["youtube.com","m.youtube.com","youtube-nocookie.com"].includes(host) ?
        (parsed.pathname==="/watch" ? parsed.searchParams.get("v") : ["shorts","live","embed"].includes(parts[0]??"") ? parts[1] : null) : null;
    if(!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) { setStatus("That is not a supported YouTube video URL."); return; }
    if(!title.trim()) { setStatus("Add a title before adding the YouTube source."); return; }
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("save_creator_media",{
        p_media_id:null,p_title:title.trim(),p_media_type:"youtube",
        p_source_url:"https://www.youtube.com/watch?v="+videoId,p_storage_path:null,
        p_alt_text:alt.trim(),p_metadata:{provider:"youtube",assetKey:videoId,playbackKind:"youtube_embed"},
        p_is_published:false
      });
      if(error || !data?.[0]?.saved) throw error ?? new Error("YouTube source could not be saved.");
      setYoutubeUrl("");setTitle("");setAlt("");
      setStatus("YouTube source added as a private Raye2 draft. Configure its watch page in Video Studio.");
      await load();
    } catch(e) { setStatus(e instanceof Error ? e.message : "Could not add the YouTube source."); }
    finally { setBusy(false); }
  }

  function beginEdit(item: MediaRow) { setEditingId(item.media_id); setTitle(item.title); setAlt(item.alt_text); setStatus("Editing asset details. Save to update its library metadata."); }

  async function saveMetadata() {
    const supabase=getSupabaseBrowserClient();
    const item=rows.find(row=>row.media_id===editingId);
    if(!supabase||!item||busy||!title.trim()) return;
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("save_creator_media",{p_media_id:item.media_id,p_title:title.trim(),p_media_type:item.media_type,p_source_url:item.source_url,p_storage_path:item.storage_path,p_alt_text:alt.trim(),p_metadata:item.metadata??{},p_is_published:item.is_published});
      if(error||!Array.isArray(data)||!data[0]?.saved) throw error??new Error("Asset metadata could not be saved.");
      setRows(old=>old.map(row=>row.media_id===item.media_id?{...row,title:title.trim(),alt_text:alt.trim()}:row));
      setEditingId("");setTitle("");setAlt("");setStatus("Asset details saved. Publication status and file URL were preserved.");
    } catch(e) { setStatus(e instanceof Error?e.message:"Could not save asset details."); }
    finally { setBusy(false); }
  }

  async function setPublished(item: MediaRow) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    if(item.media_type === "youtube") {
      setBusy(true);
      try {
        const {data,error}=await supabase.rpc("save_creator_media",{
          p_media_id:item.media_id,p_title:item.title,p_media_type:"youtube",p_source_url:item.source_url,
          p_storage_path:null,p_alt_text:item.alt_text,p_metadata:item.metadata??{},p_is_published:!item.is_published
        });
        if(error || !data?.[0]?.saved) throw error ?? new Error("YouTube publication state could not be updated.");
        setStatus(item.is_published ? "YouTube source moved back to private drafts." : "YouTube source published. Configure its watch page in Video Studio.");
        await load();
      } catch(e) { setStatus(e instanceof Error ? e.message : "Could not update YouTube source."); }
      finally { setBusy(false); }
      return;
    }
    if(!item.storage_path) return;
    setBusy(true);
    let destinationReservationId: string | null = null;
    try {
      const {data:userData} = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in before changing publication.");
      const [bucket,...parts]=item.storage_path.split("/");
      const oldPath=parts.join("/");
      if (!["creator-media-private","creator-media-public"].includes(bucket) || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(oldPath) || (item.is_published && bucket!=="creator-media-public") || (!item.is_published && bucket!=="creator-media-private")) throw new Error("The stored path and publication state do not match. Refresh the library and check the media record.");
      if (oldPath.split("/")[0] !== userData.user.id) throw new Error("This file does not belong to the signed-in creator.");
      const nextBucket=item.is_published?"creator-media-private":"creator-media-public";
      const fileName=safeFileName(oldPath.split("/").pop() || "asset");
      const nextPath=userData.user.id+"/"+crypto.randomUUID()+"-"+fileName;
      const {data:download,error:downloadError}=await supabase.storage.from(bucket).download(oldPath);
      if(downloadError || !download) throw downloadError ?? new Error("Could not read the stored file.");

      // Every destination object must have its own quota reservation. The
      // Storage trigger consumes this reservation atomically on object insert.
      const {data:reservation,error:reservationError}=await supabase.rpc("reserve_nhen_media_upload",{
        p_bytes:download.size,
        p_bucket:nextBucket
      });
      if(reservationError || !reservation?.[0]?.reservation_id) {
        throw reservationError ?? new Error("Destination storage capacity could not be reserved. The original asset was not changed.");
      }
      destinationReservationId=reservation[0].reservation_id as string;

      const {error:copyError}=await supabase.storage.from(nextBucket).upload(nextPath,download,{contentType:download.type || String(item.metadata?.mimeType || "application/octet-stream"),upsert:false});
      if(copyError) throw copyError;

      // Revoke public access before changing the database publication state.
      if (item.is_published) {
        const {error:removePublicError}=await supabase.storage.from(bucket).remove([oldPath]);
        if (removePublicError) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw new Error("Could not revoke the public file. The asset remains published; check Storage permissions and retry.");
        }
      }

      const {data:saved,error:saveError}=await supabase.rpc("save_creator_media",{
        p_media_id:item.media_id,p_title:item.title,p_media_type:item.media_type,p_source_url:item.source_url,
        p_storage_path:nextBucket+"/"+nextPath,p_alt_text:item.alt_text,p_metadata:item.metadata ?? {},
        p_is_published:!item.is_published
      });
      if(saveError || !saved?.[0]?.saved) {
        const {error:cleanupError}=await supabase.storage.from(nextBucket).remove([nextPath]);
        if (item.is_published) {
          // The original public object was removed before the database update.
          // A rollback upload is a new object and must reserve destination quota too.
          const {data:restoreReservation,error:restoreReservationError}=await supabase.rpc("reserve_nhen_media_upload",{
            p_bytes:download.size,
            p_bucket:bucket
          });
          if(restoreReservationError || !restoreReservation?.[0]?.reservation_id) {
            throw new Error("Database update failed after the public object was removed, and Raye2 could not reserve space to restore it. Keep this item private and contact the site administrator immediately.");
          }
          const restoreReservationId=restoreReservation[0].reservation_id as string;
          const {error:restoreError}=await supabase.storage.from(bucket).upload(oldPath,download,{contentType:download.type || String(item.metadata?.mimeType || "application/octet-stream"),upsert:false});
          if(restoreError) {
            try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:restoreReservationId}); } catch { /* Expires automatically. */ }
            throw new Error("Database update failed and the original public file could not be restored. Contact the site administrator immediately.");
          }
        }
        if(cleanupError) {
          throw new Error(nextBucket==="creator-media-public"
            ? "Database publication failed, but the new public object could not be removed. It may remain publicly accessible; contact the site administrator immediately."
            : "Database update failed and a stale private storage copy could not be removed. Contact the site administrator for cleanup.");
        }
        throw saveError ?? new Error("Publication status was not saved. The temporary copy was removed.");
      }
      if (!item.is_published) {
        const {error:cleanupError}=await supabase.storage.from(bucket).remove([oldPath]);
        setStatus(cleanupError ? "Asset published. The old private copy could not be cleaned up; it remains private and needs storage cleanup." : "Asset published. Its public URL is now available.");
      } else {
        setStatus("Asset moved back to private drafts; the public object was removed before metadata changed.");
      }
      await load();
    } catch(e) { setStatus(e instanceof Error ? e.message : "Could not change publication status."); }
    finally {
      if(destinationReservationId) {
        try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:destinationReservationId}); }
        catch { /* A consumed reservation is already gone; an unused one expires automatically. */ }
      }
      setBusy(false);
    }
  }

  async function removeItem(item: MediaRow) {
    const supabase=getSupabaseBrowserClient();
    if(!supabase || busy) return;
    if(item.media_type === "youtube") {
      if(item.is_published) { setStatus("Move this YouTube source to private drafts before deleting it."); return; }
      if(!window.confirm(`Remove “${item.title}” from Raye2? The original YouTube video will remain on YouTube.`)) return;
      setBusy(true);
      try {
        const {data,error}=await supabase.rpc("delete_creator_media",{p_media_id:item.media_id});
        if(error || !data?.[0]?.deleted) throw error ?? new Error("YouTube source could not be removed.");
        setStatus("YouTube source removed from Raye2. The original video was not deleted.");
        await load();
      } catch(e) { setStatus(e instanceof Error ? e.message : "Could not remove YouTube source."); }
      finally { setBusy(false); }
      return;
    }
    if(!item.storage_path) return;
    if(item.is_published || !item.storage_path.startsWith("creator-media-private/")) {
      setStatus("Move this asset to private drafts before deleting it."); return;
    }
    if(!window.confirm(`Delete “${item.title}” permanently?`)) return;
    setBusy(true);
    let deletedStoragePath: string | null = null;
    let backup: Blob | null = null;
    let contentType = "application/octet-stream";
    try {
      const {data:userData,error:userError}=await supabase.auth.getUser();
      if(userError || !userData.user) throw new Error("Sign in before deleting media.");
      const [bucket,...parts]=item.storage_path.split("/");
      const path=parts.join("/");
      if(bucket!=="creator-media-private" || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path) || path.split("/")[0]!==userData.user.id) {
        throw new Error("This private file does not belong to the signed-in creator.");
      }
      const {data:download,error:downloadError}=await supabase.storage.from(bucket).download(path);
      if(downloadError || !download) throw downloadError ?? new Error("Could not verify the stored file before deletion.");
      backup=download;
      contentType=download.type || String(item.metadata?.mimeType || contentType);
      const {error:storageError}=await supabase.storage.from(bucket).remove([path]);
      if(storageError) throw new Error("The storage file could not be deleted, so its metadata was kept.");
      deletedStoragePath=path;
      const {data:deleted,error:deleteError}=await supabase.rpc("delete_creator_media",{p_media_id:item.media_id});
      if(deleteError || !deleted?.[0]?.deleted) {
        const {error:restoreError}=await supabase.storage.from(bucket).upload(path,backup,{contentType,upsert:false});
        deletedStoragePath=null;
        if(restoreError) throw new Error("Metadata deletion failed and the file could not be restored. Contact the site administrator.");
        throw deleteError ?? new Error("Media record could not be deleted; the original file was restored.");
      }
      deletedStoragePath=null;
      const originalPath = typeof item.metadata?.originalStoragePath === "string" ? item.metadata.originalStoragePath : "";
      let backupNotice = "";
      if (originalPath.startsWith("creator-media-private/")) {
        const [originalBucket,...originalParts] = originalPath.split("/");
        const originalObjectPath = originalParts.join("/");
        if (originalBucket === "creator-media-private" && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(originalObjectPath) && originalObjectPath.split("/")[0] === userData.user.id) {
          const {error:backupCleanupError} = await supabase.storage.from("creator-media-private").remove([originalObjectPath]);
          if (backupCleanupError) backupNotice = " The private original-logo backup could not be removed and needs storage cleanup.";
        }
      }
      setStatus("Private media and metadata deleted." + backupNotice);
      await load();
    } catch(e) {
      if(deletedStoragePath && backup) {
        const {error:restoreError}=await supabase.storage.from("creator-media-private").upload(deletedStoragePath,backup,{contentType,upsert:false});
        if(restoreError) setStatus("Deletion failed and the storage backup could not be restored. Contact the site administrator.");
        else setStatus(e instanceof Error ? e.message : "Delete failed; the original file was restored.");
      } else {
        setStatus(e instanceof Error ? e.message : "Delete failed.");
      }
    } finally { setBusy(false); }
  }

  return <section id="creator-media" className="media-library" dir={isArabic?"rtl":"ltr"} lang={locale} aria-labelledby="media-library-title">
    <div className="editor-section-title"><span>{t.eyebrow}</span><h2 id="media-library-title">{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div>
    {capacity&&<div className="media-upload-note" role="status"><strong>{t.storage}</strong><p>{(Number(capacity.used_bytes+capacity.reserved_bytes)/1048576).toFixed(1)} MiB used or reserved of 750 MiB · {(Number(capacity.available_bytes)/1048576).toFixed(1)} MiB {t.available}</p><progress max={100} value={Math.min(100,Number(capacity.usage_percent))} aria-label={t.storage}/><small>{t.storageNote}</small></div>}
    {health&&<div className="media-upload-note media-health-note" role="status"><strong>{t.health}</strong><p>{health.orphan_candidate_count.toLocaleString(locale)} {t.orphanCandidates} · {(Number(health.orphan_candidate_bytes)/1048576).toFixed(1)} MiB · {health.expired_reservations_cleaned.toLocaleString(locale)} {t.expiredCleaned}</p>{health.oldest_orphan_candidate_at&&Number.isFinite(Date.parse(health.oldest_orphan_candidate_at))&&<small>{new Date(health.oldest_orphan_candidate_at).toLocaleString(locale)}</small>}<small>{t.healthNote}</small></div>}
    <div className="media-upload-layout">
      <form className="poll-create-form" onSubmit={e=>{e.preventDefault();if(editingId) void saveMetadata(); else void upload();}}>
        {!editingId && <div className="media-upload-note"><strong>{t.external}</strong><label>{t.youtube}<input type="url" value={youtubeUrl} onChange={e=>setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label><button className="button button-secondary" type="button" disabled={busy||!youtubeUrl.trim()||!title.trim()} onClick={()=>void addYoutubeSource()}>{t.addYoutube}</button><p>{t.youtubeNote}</p></div>}
        {!editingId && <label>{t.choose}<input id="creator-media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg" onChange={selectFile} required /></label>}{editingId && <p className="media-upload-note">{t.editing}</p>}
        {!editingId && file && <p className="media-selected-file">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</p>}{uploadProgress!==null&&<div className="media-upload-note" role="status"><strong>{t.uploading} · {uploadProgress}%</strong><progress max={100} value={uploadProgress} aria-label={t.uploading}/><small>{t.resume}</small><button type="button" className="button button-secondary" disabled={!uploadController} onClick={()=>uploadController?.abort()}>Pause upload</button></div>}
        <label>{t.name}<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} required /></label>
        <label>{t.alt}<input value={alt} maxLength={500} onChange={e=>setAlt(e.target.value)} placeholder={t.altPlaceholder} /></label>
        {!editingId && <p className="media-upload-note">{t.limits}</p>}
        <div className="media-row-actions"><button className="button button-primary" type="submit" disabled={busy||!title.trim()||(!editingId&&!file)}>{busy?t.working:editingId?t.save:t.upload}</button>{editingId&&<button className="button button-secondary" type="button" disabled={busy} onClick={()=>{setEditingId("");setTitle("");setAlt("");setStatus("Metadata edit cancelled.");}}>{t.cancel}</button>}</div>
      </form>
      <div className="media-library-list"><div className="media-list-heading"><h3>{t.stored} ({rows.length})</h3><button className="button button-secondary" type="button" onClick={()=>void load()} disabled={busy}>{t.refresh}</button></div><div className="media-filters"><label>{t.search}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.searchPlaceholder} /></label><label>{t.visibility}<select value={filter} onChange={e=>setFilter(e.target.value as "all"|"published"|"drafts")}><option value="all">{t.all}</option><option value="published">{t.published}</option><option value="drafts">{t.drafts}</option></select></label></div>
        {!ready ? <p className="editor-status" role="status" aria-live="polite">{t.loading}</p> : rows.length===0 ? <p className="editor-status" role="status">{t.empty}</p> : rows.filter(item=>(filter==="all"||(filter==="published"?item.is_published:!item.is_published))&&[item.title,item.media_type,item.alt_text].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))).length===0 ? <div className="moderation-empty" role="status"><h3>{t.noMatch}</h3><p>{t.tryAgain}</p><button className="button button-secondary" type="button" onClick={()=>{setSearch("");setFilter("all");}}>{t.clear}</button></div> : rows.filter(item=>(filter==="all"||(filter==="published"?item.is_published:!item.is_published))&&[item.title,item.media_type,item.alt_text].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))).map(item=><article className="media-row" key={item.media_id}>
          <div className="media-preview">{item.preview_url && (item.media_type==="image"||item.media_type==="sprite"||item.media_type==="youtube") ? <img src={item.preview_url} alt={item.alt_text||item.title} loading="lazy" /> : item.preview_url && item.media_type==="video" ? <video src={item.preview_url} controls preload="metadata" playsInline aria-label={item.title} /> : item.preview_url && item.media_type==="audio" ? <audio src={item.preview_url} controls preload="metadata" aria-label={item.title} /> : <span>{item.media_type.toUpperCase()}</span>}</div>
          <div className="media-details"><strong>{item.title}</strong><small>{item.media_type==="youtube"?t.youtubeSource:item.media_type+" · "+(item.is_published?t.public:t.privateDraft)}</small><small>{item.media_type==="youtube"?t.hosted:item.storage_path?.split("/").slice(1).join("/")}</small>{item.media_type!=="youtube"&&<small className={"media-processing-status media-processing-"+(item.processing_status??"unknown")}><strong>Processing: {(item.processing_status??"unknown").replaceAll("_"," ")}</strong>{item.size_bytes!=null?` · ${(item.size_bytes/1048576).toFixed(1)} MiB`:""}{item.mime_type?` · ${item.mime_type}`:""}{item.processing_error?` · ${item.processing_error}`:""}</small>}<div className="media-row-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>beginEdit(item)}>{t.edit}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void setPublished(item)}>{item.is_published?t.private:t.publish}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void removeItem(item)}>{t.delete}</button></div></div>
        </article>)}
      </div>
    </div>
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
