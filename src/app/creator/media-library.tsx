"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type MediaKind = "image" | "video" | "audio" | "sprite";
type MediaRow = { media_id: string; title: string; media_type: MediaKind | "model3d"; source_url: string | null; storage_path: string | null; alt_text: string; metadata: Record<string, unknown>; is_published: boolean; created_at: string; preview_url?: string | null };
const LIMIT = 50 * 1024 * 1024;
const ACCEPTED: Record<string, MediaKind> = { "image/jpeg":"image", "image/png":"image", "image/webp":"image", "image/gif":"image", "video/mp4":"video", "video/webm":"video", "audio/mpeg":"audio", "audio/mp4":"audio", "audio/wav":"audio", "audio/ogg":"audio" };

function safeFileName(name: string) { return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-100) || "asset"; }

export default function MediaLibrary() {
  const [rows,setRows] = useState<MediaRow[]>([]);
  const [file,setFile] = useState<File|null>(null);
  const [title,setTitle] = useState("");
  const [alt,setAlt] = useState("");
  const [editingId,setEditingId] = useState("");
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState<"all"|"published"|"drafts">("all");
  const [kind,setKind] = useState<MediaKind>("image");
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState("Media uploads use the free Supabase Storage project.");
  const [ready,setReady] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("Supabase is not configured for this preview."); setReady(true); return; }
    const {data:userData} = await supabase.auth.getUser();
    if (!userData.user) { setStatus("Sign in with an authorized creator account to manage media."); setReady(true); return; }
    const {data,error} = await supabase.rpc("get_creator_media",{p_limit:100});
    if (error) { setStatus("Could not load media. Confirm the creator-media migration is applied and this account is authorized."); setReady(true); return; }
    const items = (data ?? []) as MediaRow[];
    const enriched = await Promise.all(items.map(async item => {
      if (!item.storage_path) return item;
      const [bucket,...parts] = item.storage_path.split("/");
      const path = parts.join("/");
      if (bucket === "creator-media-public") {
        const {data:publicData} = supabase.storage.from(bucket).getPublicUrl(path);
        return {...item,preview_url:publicData.publicUrl};
      }
      const {data:signed} = await supabase.storage.from(bucket).createSignedUrl(path,300);
      return {...item,preview_url:signed?.signedUrl ?? null};
    }));
    setRows(enriched);
    setStatus("Media library loaded. Unpublished files stay in private storage.");
    setReady(true);
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
    try {
      const {data:userData} = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in before uploading.");
      const {data:admin,error:adminError} = await supabase.from("creator_admins").select("user_id").eq("user_id",userData.user.id).eq("active",true).maybeSingle();
      if (adminError || !admin) throw new Error("This account does not have creator upload permission.");
      const path = `${userData.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const {error:uploadError} = await supabase.storage.from("creator-media-private").upload(path,file,{contentType:file.type,upsert:false});
      if (uploadError) throw uploadError;
      const {data:saved,error:saveError} = await supabase.rpc("save_creator_media",{
        p_media_id:null,p_title:title.trim(),p_media_type:kind,p_source_url:null,
        p_storage_path:`creator-media-private/${path}`,p_alt_text:alt.trim(),
        p_metadata:{originalName:file.name,mimeType:file.type,size:file.size},
        p_is_published:false
      });
      if (saveError || !saved?.[0]?.saved) {
        await supabase.storage.from("creator-media-private").remove([path]);
        throw saveError ?? new Error("Media metadata was not saved.");
      }
      setFile(null); setTitle(""); setAlt("");
      const input=document.getElementById("creator-media-file") as HTMLInputElement|null; if(input) input.value="";
      setStatus("Upload saved as a private draft. Publish it when ready.");
      await load();
    } catch (e) { setStatus(e instanceof Error ? e.message : "Upload failed. Please try again."); }
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
    if (!supabase || !item.storage_path || busy) return;
    setBusy(true);
    try {
      const {data:userData} = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in before changing publication.");
      const [bucket,...parts]=item.storage_path.split("/");
      const oldPath=parts.join("/");
      const nextBucket=item.is_published?"creator-media-private":"creator-media-public";
      const nextPath=`${userData.user.id}/${crypto.randomUUID()}-${safeFileName(oldPath.split("/").pop() ?? "asset")}`;
      const {data:download,error:downloadError}=await supabase.storage.from(bucket).download(oldPath);
      if(downloadError || !download) throw downloadError ?? new Error("Could not read the stored file.");
      const {error:copyError}=await supabase.storage.from(nextBucket).upload(nextPath,download,{contentType:download.type || String(item.metadata?.mimeType || "application/octet-stream"),upsert:false});
      if(copyError) throw copyError;
      const {data:saved,error:saveError}=await supabase.rpc("save_creator_media",{
        p_media_id:item.media_id,p_title:item.title,p_media_type:item.media_type,p_source_url:item.source_url,
        p_storage_path:`${nextBucket}/${nextPath}`,p_alt_text:item.alt_text,p_metadata:item.metadata ?? {},
        p_is_published:!item.is_published
      });
      if(saveError || !saved?.[0]?.saved) {
        await supabase.storage.from(nextBucket).remove([nextPath]);
        throw saveError ?? new Error("Publication status was not saved.");
      }
      await supabase.storage.from(bucket).remove([oldPath]);
      setStatus(item.is_published ? "Asset moved back to private drafts." : "Asset published. Its public URL is now available.");
      await load();
    } catch(e) { setStatus(e instanceof Error ? e.message : "Could not change publication status."); }
    finally { setBusy(false); }
  }

  async function removeItem(item: MediaRow) {
    const supabase=getSupabaseBrowserClient();
    if(!supabase || busy || !item.storage_path) return;
    if(item.is_published || !item.storage_path.startsWith("creator-media-private/")) {
      setStatus("Move this asset to private drafts before deleting it."); return;
    }
    if(!window.confirm(`Delete “${item.title}” permanently?`)) return;
    setBusy(true);
    try {
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user) throw new Error("Sign in before deleting media.");
      const {data:deleted,error:deleteError}=await supabase.rpc("delete_creator_media",{p_media_id:item.media_id});
      if(deleteError || !deleted?.[0]?.deleted) throw deleteError ?? new Error("Media record could not be deleted.");
      const path=item.storage_path.split("/").slice(1).join("/");
      const {error:storageError}=await supabase.storage.from("creator-media-private").remove([path]);
      setStatus(storageError ? "Media record deleted, but its private storage object could not be removed. Check Storage cleanup." : "Private media and metadata deleted.");
      await load();
    } catch(e) { setStatus(e instanceof Error ? e.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  return <section className="media-library" aria-labelledby="media-library-title">
    <div className="editor-section-title"><span>MEDIA / 06</span><h2 id="media-library-title">Your asset <em>library.</em></h2><p>Upload logos, photos, short clips, sound and sprite images. Files stay private until you publish them.</p></div>
    <div className="media-upload-layout">
      <form className="poll-create-form" onSubmit={e=>{e.preventDefault();if(editingId) void saveMetadata(); else void upload();}}>
        {!editingId && <label>Choose file<input id="creator-media-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg" onChange={selectFile} required /></label>}{editingId && <p className="media-upload-note">Editing metadata only. The stored file and publication state will not change.</p>}
        {!editingId && file && <p className="media-selected-file">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</p>}
        <label>Asset name<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} required /></label>
        <label>Alternative text / description<input value={alt} maxLength={500} onChange={e=>setAlt(e.target.value)} placeholder="Describe the image for accessibility" /></label>
        {!editingId && <p className="media-upload-note">Maximum 50 MB per file. SVG and executable files are not accepted. 3D model files are not enabled yet.</p>}
        <div className="media-row-actions"><button className="button button-primary" type="submit" disabled={busy||!title.trim()||(!editingId&&!file)}>{busy?"Working…":editingId?"Save asset details ↗":"Upload private draft ↗"}</button>{editingId&&<button className="button button-secondary" type="button" disabled={busy} onClick={()=>{setEditingId("");setTitle("");setAlt("");setStatus("Metadata edit cancelled.");}}>Cancel</button>}</div>
      </form>
      <div className="media-library-list"><div className="media-list-heading"><h3>Stored assets ({rows.length})</h3><button className="button button-secondary" type="button" onClick={()=>void load()} disabled={busy}>Refresh</button></div><div className="media-filters"><label>Search assets<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, type or description" /></label><label>Visibility<select value={filter} onChange={e=>setFilter(e.target.value as "all"|"published"|"drafts")}><option value="all">All assets</option><option value="published">Published</option><option value="drafts">Private drafts</option></select></label></div>
        {!ready ? <p className="editor-status">Loading media…</p> : rows.length===0 ? <p className="editor-status">No assets yet. Upload your first file to begin.</p> : rows.filter(item=>(filter==="all"||(filter==="published"?item.is_published:!item.is_published))&&[item.title,item.media_type,item.alt_text].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))).map(item=><article className="media-row" key={item.media_id}>
          <div className="media-preview">{item.preview_url && (item.media_type==="image"||item.media_type==="sprite") ? <img src={item.preview_url} alt={item.alt_text||item.title} loading="lazy" /> : item.preview_url && item.media_type==="video" ? <video src={item.preview_url} controls preload="metadata" playsInline aria-label={item.title} /> : item.preview_url && item.media_type==="audio" ? <audio src={item.preview_url} controls preload="metadata" aria-label={item.title} /> : <span>{item.media_type.toUpperCase()}</span>}</div>
          <div className="media-details"><strong>{item.title}</strong><small>{item.media_type} · {item.is_published?"PUBLIC":"PRIVATE DRAFT"}</small><small>{item.storage_path?.split("/").slice(1).join("/")}</small><div className="media-row-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>beginEdit(item)}>Edit details</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void setPublished(item)}>{item.is_published?"Move to private":"Publish"}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void removeItem(item)}>Delete file</button></div></div>
        </article>)}
      </div>
    </div>
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
