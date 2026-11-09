"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";

type MediaKind = "image" | "video" | "audio" | "sprite";
type ProcessingFilter = "all" | "waiting" | "processing" | "ready" | "failed";
type StorageCapacity = {used_bytes:number;reserved_bytes:number;quota_bytes:number;available_bytes:number;usage_percent:number};
type MediaHealth = StorageCapacity & {orphan_candidate_count:number;orphan_candidate_bytes:number;oldest_orphan_candidate_at:string|null;expired_reservations_cleaned:number};
type MediaRow = { media_id: string; title: string; media_type: MediaKind | "model3d" | "youtube"; source_url: string | null; storage_path: string | null; alt_text: string; metadata: Record<string, unknown>; is_published: boolean; created_at: string; processing_status?: string; processing_attempts?: number; processing_error?: string|null; processing_updated_at?: string; processing_completed_at?: string|null; size_bytes?: number|null; mime_type?: string|null; thumbnail_path?: string|null; preview_url?: string | null };
const LIMIT = 50 * 1024 * 1024;
async function copyHlsPackage(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  masterPath: string,
  destinationBucket: "creator-media-private" | "creator-media-public",
  ownerId: string,
  mediaId: string
): Promise<{ masterPath: string; copiedPaths: string[]; sourceBucket: string; sourcePaths: string[] }> {
  const [sourceBucket, ...masterParts] = masterPath.split("/");
  const masterObject = masterParts.join("/");
  const streamRoot = masterObject.replace(/\/master\/master\.m3u8$/, "");
  if (!["creator-media-private", "creator-media-public"].includes(sourceBucket)
    || sourceBucket === destinationBucket
    || !masterObject.endsWith("/master/master.m3u8")
    || !streamRoot.startsWith(`${ownerId}/streams/${mediaId}-`)
    || !streamRoot.split("/").every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))) {
    throw new Error("The adaptive video package path does not match this creator and media item.");
  }
  const sourcePaths: string[] = [];
  const copiedPaths: string[] = [];
  const copyFolder = async (folder: string): Promise<void> => {
    const { data: entries, error: listError } = await supabase.storage.from(sourceBucket).list(folder, { limit: 1000 });
    if (listError) throw listError;
    for (const entry of entries ?? []) {
      if (!entry.name || !/^[A-Za-z0-9_.-]+$/.test(entry.name)) continue;
      const objectPath = `${folder}/${entry.name}`;
      if (entry.id === null) { await copyFolder(objectPath); continue; }
      const { data: blob, error: downloadError } = await supabase.storage.from(sourceBucket).download(objectPath);
      if (downloadError || !blob) throw downloadError ?? new Error("Could not read an adaptive video segment.");
      const { data: reservation, error: reservationError } = await supabase.rpc("reserve_nhen_media_upload", { p_bytes: blob.size, p_bucket: destinationBucket });
      if (reservationError || !reservation?.[0]?.reservation_id) throw reservationError ?? new Error("Could not reserve storage for the adaptive video package.");
      const { error: uploadError } = await supabase.storage.from(destinationBucket).upload(objectPath, blob, {
        contentType: entry.name.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t", cacheControl: "3600", upsert: false
      });
      if (uploadError) {
        await supabase.rpc("release_nhen_media_upload_reservation", { p_reservation_id: reservation[0].reservation_id });
        throw uploadError;
      }
      sourcePaths.push(objectPath); copiedPaths.push(objectPath);
    }
  };
  try {
    await copyFolder(streamRoot);
    if (!copiedPaths.includes(`${streamRoot}/master/master.m3u8`)) throw new Error("The adaptive video master playlist is missing.");
    return { masterPath: `${destinationBucket}/${streamRoot}/master/master.m3u8`, copiedPaths, sourceBucket, sourcePaths };
  } catch (error) {
    if (copiedPaths.length) {
      const { error: cleanupError } = await supabase.storage.from(destinationBucket).remove(copiedPaths);
      if (cleanupError) console.error("Adaptive video destination cleanup failed.", cleanupError.message);
    }
    throw error;
  }
}

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
  const [processingFilter,setProcessingFilter] = useState<ProcessingFilter>("all");
  const [kind,setKind] = useState<MediaKind>("image");
  const [busy,setBusy] = useState(false);
  const [uploadProgress,setUploadProgress] = useState<number|null>(null);
  const [uploadStage,setUploadStage] = useState<"idle"|"preparing"|"uploading"|"saving">("idle");
  const [uploadController,setUploadController] = useState<AbortController|null>(null);
  const [dragActive,setDragActive] = useState(false);
  const [status,setStatus] = useState("Media uploads use the free Supabase Storage project.");
  const [ready,setReady] = useState(false);
  const [locale,setLocale]=useState<"en"|"ar">("en");
  const isArabic=locale==="ar";
  const t=isArabic?{
    eyebrow:"الوسائط / 06",title:"مكتبة ",emphasis:"ملفاتك.",intro:"ارفع الشعارات والصور والمقاطع القصيرة والصوت وصور الـ sprites. تظل الملفات خاصة حتى تنشرها.",storage:"حد التخزين الآمن المجاني في Raye2",available:"متاح",storageNote:"تتوقف عمليات الرفع قبل حد الخطة المجانية الاحترازي. يشمل الحساب ملفات المشروع على Supabase.",health:"صحة التخزين",orphanCandidates:"ملفات يتيمة محتملة",expiredCleaned:"حجوزات منتهية تم تنظيفها",healthNote:"هذه مؤشرات للمراجعة فقط؛ لا يتم حذف أي ملف وسائط تلقائيًا.",external:"أضف فيديو رسميًا مستضافًا خارجيًا",youtube:"رابط فيديو يوتيوب",addYoutube:"إضافة مصدر يوتيوب ↗",youtubeNote:"يستضيف يوتيوب الفيديو؛ بينما تدير Raye2 صفحة المشاهدة وميزات المجتمع. لا يستهلك هذا تخزين فيديوهات Raye2.",choose:"اختر ملفًا",editing:"تعديل البيانات الوصفية فقط. لن يتغير الملف المخزن أو حالة النشر.",selected:"الملف المحدد",uploading:"جارٍ الرفع",uploadPreparing:"جارٍ تجهيز مساحة التخزين…",uploadSaving:"جارٍ حفظ بيانات الملف…",stopUpload:"إيقاف مؤقت",resume:"إذا أوقفت الرفع أو انقطع الاتصال، اختر الملف نفسه مرة أخرى لاستكماله.",dropTitle:"أفلت الملف هنا أو اختره",dropNote:"يمكنك أيضًا لصق صورة من الحافظة. الحد الأقصى 50 ميجابايت.",name:"اسم الملف",alt:"نص بديل / وصف",altPlaceholder:"صف الصورة لتسهيل الوصول",limits:"الحد الأقصى 50 ميجابايت لكل ملف. لا تُقبل ملفات SVG أو الملفات التنفيذية. ملفات النماذج ثلاثية الأبعاد غير مفعلة بعد.",working:"جارٍ التنفيذ…",save:"حفظ تفاصيل الملف ↗",upload:"رفع كمسودة خاصة ↗",cancel:"إلغاء",stored:"الملفات المخزنة",refresh:"تحديث",search:"البحث في الملفات",searchPlaceholder:"الاسم أو النوع أو الوصف",visibility:"إمكانية الظهور",all:"كل الملفات",published:"منشور",drafts:"مسودات خاصة",loading:"جارٍ تحميل الوسائط…",empty:"لا توجد ملفات بعد. ارفع أول ملف للبدء.",noMatch:"لا توجد ملفات مطابقة.",tryAgain:"جرّب بحثًا آخر أو غيّر عوامل التصفية.",processingFilter:"حالة المعالجة",waiting:"في انتظار المعالجة",processing:"قيد المعالجة",readyState:"جاهز",failed:"فشل",retry:"إعادة المحاولة",retryQueued:"تمت إعادة الملف إلى قائمة المعالجة. سيظهر جاهزًا بعد نجاح العامل.",retryLimit:"تم استنفاد محاولات الإعادة اليدوية لهذا الملف.",retryUnavailable:"لا يمكن إعادة هذا الملف الآن. حدّث المكتبة وحاول مجددًا.",publishNeedsReady:"لا يمكن نشر الملف قبل اكتمال المعالجة بنجاح.",clear:"مسح عوامل التصفية",edit:"تعديل التفاصيل",private:"نقل إلى الخاص",publish:"نشر",delete:"حذف الملف",youtubeSource:"يوتيوب · مصدر خارجي",hosted:"مستضاف لدى يوتيوب",public:"عام",privateDraft:"مسودة خاصة",status:"حالة المكتبة",loaded:"تم تحميل مكتبة الوسائط. تظل الملفات غير المنشورة في التخزين الخاص.",previewError:"تم تحميل المكتبة، لكن بعض المعاينات غير متاحة. تحقق من أذونات التخزين ومسارات الملفات.",signedOut:"سجّل الدخول بحساب مبدع مصرح له لإدارة الوسائط.",capacityError:"تعذر حجز مساحة تخزين مجانية. لم يبدأ الرفع.",unsupported:"نوع ملف غير مدعوم. اختر صورة أو فيديو MP4/WebM أو ملف صوت مدعوم.",tooLarge:"يتجاوز هذا الملف حد 50 ميجابايت لكل ملف.",youtubeAdded:"تمت إضافة مصدر يوتيوب كمسودة خاصة في Raye2. أعد إعداد صفحة المشاهدة في استوديو الفيديو."
  }:{
    eyebrow:"MEDIA / 06",title:"Your asset ",emphasis:"library.",intro:"Upload logos, photos, short clips, sound and sprite images. Files stay private until you publish them.",storage:"Raye2 free storage safety limit",available:"available",storageNote:"Uploads stop before the conservative free-plan limit. This counts files across the Supabase project.",health:"Storage health",orphanCandidates:"possible orphan objects",expiredCleaned:"expired upload reservations cleaned",healthNote:"These are review candidates only. Media objects are never deleted automatically.",external:"Add an externally hosted official video",youtube:"YouTube video URL",addYoutube:"Add YouTube source ↗",youtubeNote:"YouTube hosts the video; Raye2 manages its watch page and community features. It does not use Raye2 video storage.",choose:"Choose file",editing:"Editing metadata only. The stored file and publication state will not change.",selected:"Selected file",uploading:"Uploading",uploadPreparing:"Preparing secure storage…",uploadSaving:"Saving asset details…",stopUpload:"Pause and resume later",resume:"If you pause the upload or the connection drops, select the same file again to resume it.",dropTitle:"Drop a file here or browse",dropNote:"You can also paste an image from your clipboard. 50 MB maximum.",name:"Asset name",alt:"Alternative text / description",altPlaceholder:"Describe the image for accessibility",limits:"Maximum 50 MB per file. SVG and executable files are not accepted. 3D model files are not enabled yet.",working:"Working…",save:"Save asset details ↗",upload:"Upload private draft ↗",cancel:"Cancel",stored:"Stored assets",refresh:"Refresh",search:"Search assets",searchPlaceholder:"Name, type or description",visibility:"Visibility",all:"All assets",published:"Published",drafts:"Private drafts",loading:"Loading media…",empty:"No assets yet. Upload your first file to begin.",noMatch:"No matching assets.",tryAgain:"Try another search or change the filters.",processingFilter:"Processing status",waiting:"Waiting",processing:"Processing",readyState:"Ready",failed:"Failed",retry:"Retry processing",retryQueued:"The asset was queued again. It will become ready after the worker succeeds.",retryLimit:"This asset has reached its manual retry limit.",retryUnavailable:"This asset cannot be retried now. Refresh the library and try again.",publishNeedsReady:"This asset cannot be published until processing succeeds.",clear:"Clear filters",edit:"Edit details",private:"Move to private",publish:"Publish",delete:"Delete file",youtubeSource:"YOUTUBE · EXTERNAL SOURCE",hosted:"Hosted by YouTube",public:"PUBLIC",privateDraft:"PRIVATE DRAFT",status:"Library status",loaded:"Media library loaded. Unpublished files stay in private storage.",previewError:"Media library loaded, but some previews are unavailable. Check storage permissions and file paths.",signedOut:"Sign in with an authorized creator account to manage media.",capacityError:"Free storage capacity could not be reserved. No upload was started.",unsupported:"Unsupported file type. Choose an image, MP4/WebM video, or supported audio file.",tooLarge:"This file exceeds the 50 MB per-file limit.",youtubeAdded:"YouTube source added as a private Raye2 draft. Configure its watch page in Video Studio."
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
        const previewPath=item.is_published && item.thumbnail_path?.startsWith("creator-media-private/") ? item.storage_path : item.thumbnail_path??item.storage_path;
        if (!previewPath) return {...item,preview_url:null};
        const [bucket,...parts] = previewPath.split("/");
        const path = parts.join("/");
        if (!path || !["creator-media-private","creator-media-public"].includes(bucket) || path.split("/").length<2 || !path.split("/").every(segment=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(segment))) return {...item,preview_url:null};
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

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(item => {
      const visibilityMatches = filter === "all" || (filter === "published" ? item.is_published : !item.is_published);
      const status = item.media_type === "youtube" ? "ready" : item.processing_status ?? "unknown";
      const processingMatches = processingFilter === "all"
        || (processingFilter === "waiting" && ["uploaded","unknown"].includes(status))
        || status === processingFilter;
      const queryMatches = !query || [item.title,item.media_type,item.alt_text,item.processing_error ?? ""].some(value => value.toLowerCase().includes(query));
      return visibilityMatches && processingMatches && queryMatches;
    });
  },[rows,filter,processingFilter,search]);
  const processingCounts = useMemo(() => ({
    waiting: rows.filter(item => item.media_type !== "youtube" && ["uploaded","unknown"].includes(item.processing_status ?? "unknown")).length,
    processing: rows.filter(item => item.media_type !== "youtube" && item.processing_status === "processing").length,
    ready: rows.filter(item => item.media_type === "youtube" || item.processing_status === "ready").length,
    failed: rows.filter(item => item.media_type !== "youtube" && item.processing_status === "failed").length
  }),[rows]);

  useEffect(()=>{ void load(); },[load]);
  useEffect(()=>{
    if(!ready || !rows.some(item=>item.media_type!=="youtube" && ["uploaded","processing","failed"].includes(item.processing_status??""))) return;
    const timer=window.setInterval(()=>{void load();},15000);
    return ()=>window.clearInterval(timer);
  },[load,ready,rows]);

  const acceptFile = useCallback((selected: File|null, input?: HTMLInputElement|null) => {
    if (!selected) return;
    if (!ACCEPTED[selected.type]) { setStatus("Unsupported file type. Choose an image, MP4/WebM video, or supported audio file."); if(input) input.value=""; return; }
    if (selected.size > LIMIT) { setStatus("This file exceeds the 50 MB per-file limit."); if(input) input.value=""; return; }
    setFile(selected); setKind(ACCEPTED[selected.type]); setTitle(current=>current || selected.name.replace(/\.[^.]+$/,"").slice(0,120)); setStatus("File selected and type checked.");
  }, []);

  function selectFile(e: ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0] ?? null,e.target);
  }

  function handleFileDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (busy || editingId) return;
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,textarea,[contenteditable=true]"))) return;
      if (busy || editingId) return;
      const imageItem = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === "file" && item.type.startsWith("image/"));
      const pastedImage = imageItem?.getAsFile() ?? null;
      if (!pastedImage) return;
      event.preventDefault();
      acceptFile(pastedImage);
    };
    window.addEventListener("paste",handlePaste);
    return () => window.removeEventListener("paste",handlePaste);
  },[acceptFile,busy,editingId]);

  async function upload() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !file || busy) return;
    setBusy(true);
    setUploadStage("preparing");
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
      setUploadStage("uploading");
      await uploadToSupabaseStorage({client:supabase,bucketName:"creator-media-private",objectName:path,file,onProgress:setUploadProgress,signal:controller.signal});
      uploaded=true;
      setUploadStage("saving");
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
    } catch (e) { const interrupted=e instanceof DOMException&&e.name==="AbortError"; setStatus(!uploaded ? (interrupted?"Upload paused. Your resumable session is retained; choose the same file again to continue. ":"Upload interrupted. Your resumable session is retained; choose the same file again to continue. ")+(e instanceof Error&&!interrupted?e.message:"") : e instanceof Error ? e.message : "The uploaded file could not be saved. Please refresh the media library."); }
    finally {
      if(uploaded && uploadSession) {
        uploadSession.clear();
        if(reservationId) { try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:reservationId}); } catch { /* reservation expires automatically */ } }
      }
      setUploadController(null);
      setUploadProgress(null);
      setUploadStage("idle");
      setBusy(false);
    }
  }

  async function retryProcessing(item: MediaRow) {
    const supabase=getSupabaseBrowserClient();
    if(!supabase || busy || item.processing_status!=="failed") return;
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("retry_raye2_media_processing",{p_media_id:item.media_id});
      if(error) throw error;
      const result=Array.isArray(data)?data[0]:null;
      if(!result?.retried) {
        if(result?.result_code==="retry_limit") throw new Error(t.retryLimit);
        throw new Error(t.retryUnavailable);
      }
      await load();
      setStatus(t.retryQueued);
    } catch(e) {
      setStatus(e instanceof Error?e.message:t.retryUnavailable);
    } finally {
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
    if (!item.is_published && item.media_type !== "youtube" && item.processing_status !== "ready") {
      setStatus("This asset cannot be published until the trusted media worker finishes processing it.");
      return;
    }
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
    let destinationThumbnailReservationId: string | null = null;
    let nextThumbnailPath: string | null = null;
    let nextHlsPackage: Awaited<ReturnType<typeof copyHlsPackage>> | null = null;
    const previousThumbnailPath = item.thumbnail_path ?? null;
    const processingMeta = item.metadata?.processing as Record<string, unknown> | undefined;
    const hlsMeta = processingMeta?.hls as Record<string, unknown> | undefined;
    const previousHlsMasterPath = typeof hlsMeta?.masterPath === "string" ? hlsMeta.masterPath : null;
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

      // Move the worker-generated thumbnail with its source object. Otherwise
      // the published Watch page points at a private poster (or loses it).
      if(previousThumbnailPath) {
        const [thumbnailBucket,...thumbnailParts]=previousThumbnailPath.split("/");
        const thumbnailObjectPath=thumbnailParts.join("/");
        const expectedThumbnailPrefix=userData.user.id+"/thumbnails/"+item.media_id+"-";
        if(thumbnailBucket!==bucket || !thumbnailObjectPath.startsWith(expectedThumbnailPrefix) || !thumbnailObjectPath.endsWith(".webp")) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw new Error("The generated thumbnail path does not match this media item. Refresh the library before changing publication.");
        }
        const {data:thumbnailBlob,error:thumbnailDownloadError}=await supabase.storage.from(thumbnailBucket).download(thumbnailObjectPath);
        if(thumbnailDownloadError || !thumbnailBlob) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw thumbnailDownloadError ?? new Error("Could not read the generated thumbnail; the original media remains unchanged.");
        }
        const {data:thumbnailReservation,error:thumbnailReservationError}=await supabase.rpc("reserve_nhen_media_upload",{
          p_bytes:thumbnailBlob.size,
          p_bucket:nextBucket
        });
        if(thumbnailReservationError || !thumbnailReservation?.[0]?.reservation_id) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw thumbnailReservationError ?? new Error("Thumbnail storage capacity could not be reserved; the original media remains unchanged.");
        }
        destinationThumbnailReservationId=thumbnailReservation[0].reservation_id as string;
        const thumbnailFileName=userData.user.id+"/thumbnails/"+item.media_id+"-"+crypto.randomUUID()+".webp";
        const {error:thumbnailCopyError}=await supabase.storage.from(nextBucket).upload(thumbnailFileName,thumbnailBlob,{contentType:"image/webp",upsert:false});
        if(thumbnailCopyError) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw thumbnailCopyError;
        }
        nextThumbnailPath=nextBucket+"/"+thumbnailFileName;
      }

      if (previousHlsMasterPath) {
        nextHlsPackage = await copyHlsPackage(supabase, previousHlsMasterPath, nextBucket, userData.user.id, item.media_id);
      }

      // Revoke public access before changing the database publication state.
      if (item.is_published) {
        const {error:removePublicError}=await supabase.storage.from(bucket).remove([oldPath]);
        if (removePublicError) {
          await supabase.storage.from(nextBucket).remove([nextPath]);
          throw new Error("Could not revoke the public file. The asset remains published; check Storage permissions and retry.");
        }
      }

      const {data:saved,error:saveError}=await supabase.rpc("save_creator_media_with_thumbnail",{
        p_media_id:item.media_id,p_title:item.title,p_media_type:item.media_type,p_source_url:item.source_url,
        p_storage_path:nextBucket+"/"+nextPath,p_alt_text:item.alt_text,p_metadata:nextHlsPackage ? { ...item.metadata, processing: { ...(processingMeta ?? {}), hls: { ...(hlsMeta ?? {}), masterPath: nextHlsPackage.masterPath } } } : item.metadata ?? {},
        p_is_published:!item.is_published,p_thumbnail_path:nextThumbnailPath
      });
      if(saveError || !saved?.[0]?.saved) {
        const {error:cleanupError}=await supabase.storage.from(nextBucket).remove([nextPath]);
        if(nextThumbnailPath) await supabase.storage.from(nextBucket).remove([nextThumbnailPath.slice(nextBucket.length+1)]);
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
      if (nextHlsPackage && nextHlsPackage.sourcePaths.length) {
        const { error: oldHlsCleanupError } = await supabase.storage.from(nextHlsPackage.sourceBucket).remove(nextHlsPackage.sourcePaths);
        if (oldHlsCleanupError) console.error("Previous adaptive video package needs storage cleanup.", oldHlsCleanupError.message);
      }
      let thumbnailNotice="";
      if(nextThumbnailPath && previousThumbnailPath) {
        const [previousBucket,...previousParts]=previousThumbnailPath.split("/");
        const {error:previousThumbnailCleanupError}=await supabase.storage.from(previousBucket).remove([previousParts.join("/")]);
        if(previousThumbnailCleanupError) thumbnailNotice=" The old thumbnail copy needs storage cleanup.";
      }
      if (!item.is_published) {
        const {error:cleanupError}=await supabase.storage.from(bucket).remove([oldPath]);
        setStatus((cleanupError ? "Asset published. The old private copy could not be cleaned up; it remains private and needs storage cleanup." : "Asset published. Its public URL and thumbnail are now available.")+thumbnailNotice);
      } else {
        setStatus("Asset moved back to private drafts; the public object was removed before metadata changed."+thumbnailNotice);
      }
      await load();
    } catch(e) {
      if(nextHlsPackage?.copiedPaths.length){
        const destinationBucket=nextHlsPackage.masterPath.split("/")[0];
        const {error:cleanupError}=await supabase.storage.from(destinationBucket).remove(nextHlsPackage.copiedPaths);
        if(cleanupError) console.error("Adaptive video rollback cleanup failed.",cleanupError.message);
      }
      setStatus(e instanceof Error ? e.message : "Could not change publication status.");
    }
    finally {
      if(destinationReservationId) {
        try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:destinationReservationId}); }
        catch { /* A consumed reservation is already gone; an unused one expires automatically. */ }
      }
      if(destinationThumbnailReservationId) {
        try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:destinationThumbnailReservationId}); }
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
      if(item.thumbnail_path) {
        const [thumbnailBucket,...thumbnailParts]=item.thumbnail_path.split("/");
        const thumbnailObject=thumbnailParts.join("/");
        if(thumbnailBucket==="creator-media-private" && thumbnailObject.startsWith(userData.user.id+"/thumbnails/")) {
          const {error:thumbnailCleanupError}=await supabase.storage.from(thumbnailBucket).remove([thumbnailObject]);
          if(thumbnailCleanupError) backupNotice += " The generated thumbnail could not be removed and needs storage cleanup.";
        }
      }
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
    {capacity&&<div className="media-upload-note" role="status"><strong>{t.storage}</strong><p>{(Number(capacity.used_bytes+capacity.reserved_bytes)/1048576).toFixed(1)} MiB used or reserved of {(Number(capacity.quota_bytes)/1048576).toFixed(0)} MiB · {(Number(capacity.available_bytes)/1048576).toFixed(1)} MiB {t.available}</p><progress max={100} value={Math.min(100,Number(capacity.usage_percent))} aria-label={t.storage}/><small>{t.storageNote}</small></div>}
    {health&&<div className="media-upload-note media-health-note" role="status"><strong>{t.health}</strong><p>{health.orphan_candidate_count.toLocaleString(locale)} {t.orphanCandidates} · {(Number(health.orphan_candidate_bytes)/1048576).toFixed(1)} MiB · {health.expired_reservations_cleaned.toLocaleString(locale)} {t.expiredCleaned}</p>{health.oldest_orphan_candidate_at&&Number.isFinite(Date.parse(health.oldest_orphan_candidate_at))&&<small>{new Date(health.oldest_orphan_candidate_at).toLocaleString(locale)}</small>}<small>{t.healthNote}</small></div>}
    <div className="media-upload-layout">
      <form className="poll-create-form" onSubmit={e=>{e.preventDefault();if(editingId) void saveMetadata(); else void upload();}}>
        {!editingId && <div className="media-upload-note"><strong>{t.external}</strong><label>{t.youtube}<input type="url" value={youtubeUrl} onChange={e=>setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label><button className="button button-secondary" type="button" disabled={busy||!youtubeUrl.trim()||!title.trim()} onClick={()=>void addYoutubeSource()}>{t.addYoutube}</button><p>{t.youtubeNote}</p></div>}
        {!editingId && <div className={"media-dropzone"+(dragActive?" is-active":"")} onDragEnter={e=>{e.preventDefault();if(!busy)setDragActive(true);}} onDragOver={e=>{e.preventDefault();if(!busy)setDragActive(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragActive(false);}} onDrop={handleFileDrop} aria-label={t.dropTitle}><span className="media-dropzone-icon" aria-hidden="true">↥</span><strong>{t.dropTitle}</strong><label className="media-dropzone-picker">{t.choose}<input id="creator-media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg" onChange={selectFile} required /></label><small>{t.dropNote}</small></div>}{editingId && <p className="media-upload-note">{t.editing}</p>}
        {!editingId && file && <p className="media-selected-file">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</p>}{busy&&!editingId&&<div className="media-upload-note media-upload-progress" role="status" aria-live="polite"><strong>{uploadStage==="preparing"?t.uploadPreparing:uploadStage==="saving"?t.uploadSaving:t.uploading+(uploadProgress!==null?" · "+uploadProgress+"%":"")}</strong>{uploadStage==="uploading"&&<progress max={100} value={uploadProgress??0} aria-label={t.uploading}/>}<small>{t.resume}</small>{uploadStage==="uploading"&&<button type="button" className="button button-secondary" disabled={!uploadController} onClick={()=>uploadController?.abort()}>{t.stopUpload}</button>}</div>}
        <label>{t.name}<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} required /></label>
        <label>{t.alt}<input value={alt} maxLength={500} onChange={e=>setAlt(e.target.value)} placeholder={t.altPlaceholder} /></label>
        {!editingId && <p className="media-upload-note">{t.limits}</p>}
        <div className="media-row-actions"><button className="button button-primary" type="submit" disabled={busy||!title.trim()||(!editingId&&!file)}>{busy?t.working:editingId?t.save:t.upload}</button>{editingId&&<button className="button button-secondary" type="button" disabled={busy} onClick={()=>{setEditingId("");setTitle("");setAlt("");setStatus("Metadata edit cancelled.");}}>{t.cancel}</button>}</div>
      </form>
      <div className="media-library-list"><div className="media-list-heading"><h3>{t.stored} ({rows.length})</h3><button className="button button-secondary" type="button" onClick={()=>void load()} disabled={busy}>{t.refresh}</button></div><div className="media-processing-summary" aria-label={t.processingFilter}>
           <span>{t.waiting}: <strong>{processingCounts.waiting}</strong></span>
           <span>{t.processing}: <strong>{processingCounts.processing}</strong></span>
           <span>{t.readyState}: <strong>{processingCounts.ready}</strong></span>
           <span>{t.failed}: <strong>{processingCounts.failed}</strong></span>
         </div>
         <div className="media-filters"><label>{t.search}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.searchPlaceholder} /></label><label>{t.visibility}<select value={filter} onChange={e=>setFilter(e.target.value as "all"|"published"|"drafts")}><option value="all">{t.all}</option><option value="published">{t.published}</option><option value="drafts">{t.drafts}</option></select></label><label>{t.processingFilter}<select value={processingFilter} onChange={e=>setProcessingFilter(e.target.value as ProcessingFilter)}><option value="all">{t.all}</option><option value="waiting">{t.waiting}</option><option value="processing">{t.processing}</option><option value="ready">{t.readyState}</option><option value="failed">{t.failed}</option></select></label></div>
        {!ready ? <p className="editor-status" role="status" aria-live="polite">{t.loading}</p> : rows.length===0 ? <p className="editor-status" role="status">{t.empty}</p> : visibleRows.length===0 ? <div className="moderation-empty" role="status"><h3>{t.noMatch}</h3><p>{t.tryAgain}</p><button className="button button-secondary" type="button" onClick={()=>{setSearch("");setFilter("all");setProcessingFilter("all");}}>{t.clear}</button></div> : visibleRows.map(item=><article className="media-row" key={item.media_id}>
          <div className="media-preview">{item.preview_url && (item.media_type==="image"||item.media_type==="sprite"||item.media_type==="youtube") ? <img src={item.preview_url} alt={item.alt_text||item.title} loading="lazy" /> : item.preview_url && item.media_type==="video" ? <video src={item.preview_url} controls preload="metadata" playsInline aria-label={item.title} /> : item.preview_url && item.media_type==="audio" ? <audio src={item.preview_url} controls preload="metadata" aria-label={item.title} /> : <span>{item.media_type.toUpperCase()}</span>}</div>
          <div className="media-details"><strong>{item.title}</strong><small>{item.media_type==="youtube"?t.youtubeSource:item.media_type+" · "+(item.is_published?t.public:t.privateDraft)}</small><small>{item.media_type==="youtube"?t.hosted:item.storage_path?.split("/").slice(1).join("/")}</small>{item.media_type!=="youtube"&&<small className={"media-processing-status media-processing-"+(item.processing_status??"unknown")}><strong>Processing: {(item.processing_status??"unknown").replaceAll("_"," ")}</strong>{item.size_bytes!=null?` · ${(item.size_bytes/1048576).toFixed(1)} MiB`:""}{item.mime_type?` · ${item.mime_type}`:""}{item.processing_error?` · ${item.processing_error}`:""}</small>}<div className="media-row-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>beginEdit(item)}>{t.edit}</button><button type="button" className="button button-secondary" title={!item.is_published&&item.media_type!=="youtube"&&item.processing_status!=="ready"?t.publishNeedsReady:undefined} disabled={busy||(!item.is_published&&item.media_type!=="youtube"&&item.processing_status!=="ready")} onClick={()=>void setPublished(item)}>{item.is_published?t.private:t.publish}</button>{item.processing_status==="failed"&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void retryProcessing(item)}>{t.retry}</button>}<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void removeItem(item)}>{t.delete}</button></div></div>
        </article>)}
      </div>
    </div>
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
