"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type CreatedLogo = { media_id: string; title: string; media_type: string; is_published: boolean };
type Props = { onCreated: (item: CreatedLogo) => void };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function distance(r: number, g: number, b: number, target: [number, number, number]) {
  return Math.sqrt((r-target[0])**2 + (g-target[1])**2 + (b-target[2])**2);
}

async function prepareLogo(file: File, tolerance: number, removeBackground: boolean, trimTransparent: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close(); throw new Error("Your browser could not prepare this image."); }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (removeBackground) {
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    const sample = (x: number, y: number): [number, number, number] => {
      const i = (y * width + x) * 4;
      return [pixels[i], pixels[i+1], pixels[i+2]];
    };
    const corners = [sample(0,0), sample(width-1,0), sample(0,height-1), sample(width-1,height-1)];
    const background: [number, number, number] = [
      Math.round(corners.reduce((sum,c)=>sum+c[0],0)/4),
      Math.round(corners.reduce((sum,c)=>sum+c[1],0)/4),
      Math.round(corners.reduce((sum,c)=>sum+c[2],0)/4)
    ];
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    const add = (index: number) => {
      if (index < 0 || index >= total || visited[index]) return;
      visited[index] = 1;
      queue[tail++] = index;
    };
    for (let x=0;x<width;x++) { add(x); add((height-1)*width+x); }
    for (let y=1;y<height-1;y++) { add(y*width); add(y*width+width-1); }
    const edge = tolerance + 34;
    while (head < tail) {
      const index = queue[head++];
      const offset = index * 4;
      const delta = distance(pixels[offset],pixels[offset+1],pixels[offset+2],background);
      if (delta > edge) continue;
      if (delta <= tolerance) pixels[offset+3] = 0;
      else pixels[offset+3] = Math.round(pixels[offset+3] * ((delta-tolerance)/34));
      const x = index % width;
      if (x > 0) add(index-1);
      if (x < width-1) add(index+1);
      if (index >= width) add(index-width);
      if (index < total-width) add(index+width);
    }
    context.putImageData(image,0,0);
  }

  let outputCanvas = canvas;
  if (trimTransparent) {
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX && maxY >= minY) {
      const contentWidth = maxX - minX + 1;
      const contentHeight = maxY - minY + 1;
      const padding = Math.max(8, Math.round(Math.max(contentWidth, contentHeight) * 0.07));
      const cropWidth = Math.min(width, contentWidth + padding * 2);
      const cropHeight = Math.min(height, contentHeight + padding * 2);
      const cropX = Math.max(0, Math.min(width - cropWidth, Math.round((minX + maxX + 1 - cropWidth) / 2)));
      const cropY = Math.max(0, Math.min(height - cropHeight, Math.round((minY + maxY + 1 - cropHeight) / 2)));
      const trimmed = document.createElement("canvas");
      trimmed.width = cropWidth;
      trimmed.height = cropHeight;
      const trimmedContext = trimmed.getContext("2d");
      if (!trimmedContext) throw new Error("Your browser could not centre the prepared logo.");
      trimmedContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      outputCanvas = trimmed;
    }
  }
  const outputType = "image/png";
  return await new Promise<Blob>((resolve,reject) => {
    outputCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The prepared logo could not be exported.")), outputType, 0.94);
  });
}

function safeName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-80) || "logo";
}

export default function LogoStudio({ onCreated }: Props) {
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState("");
  const [prepared,setPrepared] = useState<Blob|null>(null);
  const [removeBackground,setRemoveBackground] = useState(true);
  const [trimTransparent,setTrimTransparent] = useState(true);
  const [tolerance,setTolerance] = useState(42);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState("Upload a logo to preview it, clean its edges and prepare it for the website.");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function selectFile(selected: File|null) {
    if (!selected) return;
    if (!ALLOWED_TYPES.includes(selected.type)) { setStatus("Choose a PNG, JPG or WebP logo."); return; }
    if (selected.size > MAX_FILE_BYTES) { setStatus("Logo files must be 20 MB or smaller."); return; }
    setFile(selected);
    setPrepared(null);
    setPreview(URL.createObjectURL(selected));
    setStatus("Logo selected. Choose whether to remove a plain background, then prepare the preview.");
  }

  async function prepare() {
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = await prepareLogo(file,tolerance,removeBackground,trimTransparent);
      setPrepared(blob);
      const nextUrl = URL.createObjectURL(blob);
      setPreview(nextUrl);
      setStatus(removeBackground
        ? "Transparent PNG prepared. Transparent margins were trimmed and the mark was centred. Review both theme previews before saving."
        : "Logo resized and centred. Original background retained.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not prepare this logo.");
    } finally { setBusy(false); }
  }

  async function save() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !file || !prepared || busy) return;
    setBusy(true);
    setStatus("Saving the prepared logo to your private media library…");
    const uploadedPaths: string[] = [];
    try {
      const {data:userData,error:userError} = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sign in with your creator account before uploading a logo.");
      const {data:admin,error:adminError} = await supabase.from("creator_admins").select("user_id").eq("user_id",userData.user.id).eq("active",true).maybeSingle();
      if (adminError || !admin) throw new Error("This account does not have creator upload permission.");
      const id = crypto.randomUUID();
      const base = userData.user.id + "/" + id;
      const originalPath = base + "-original-" + safeName(file.name);
      const outputExtension = removeBackground ? "png" : (file.type === "image/jpeg" ? "jpg" : "webp");
      const outputPath = base + "-logo." + outputExtension;
      const {error:originalError} = await supabase.storage.from("creator-media-private").upload(originalPath,file,{contentType:file.type,upsert:false});
      if (originalError) throw originalError;
      uploadedPaths.push(originalPath);
      const outputType = removeBackground ? "image/png" : file.type;
      const {error:outputError} = await supabase.storage.from("creator-media-private").upload(outputPath,prepared,{contentType:outputType,upsert:false});
      if (outputError) throw outputError;
      uploadedPaths.push(outputPath);
      const title = (file.name.replace(/\.[^.]+$/,"").slice(0,105) || "Raye2 logo") + (removeBackground ? " — transparent" : "");
      const {data:saved,error:saveError} = await supabase.rpc("save_creator_media",{
        p_media_id:null,p_title:title,p_media_type:"image",p_source_url:null,
        p_storage_path:"creator-media-private/" + outputPath,p_alt_text:"Raye2 / رايق brand logo",
        p_metadata:{mimeType:outputType,size:prepared.size,originalName:file.name,originalStoragePath:"creator-media-private/" + originalPath,backgroundRemoved:removeBackground,backgroundRemovalMethod:removeBackground?"edge-colour-key-v1":"none",backgroundTolerance:tolerance,transparentMarginsTrimmed:trimTransparent},
        p_is_published:false
      });
      if (saveError || !saved?.[0]?.saved || !saved[0].media_id) throw saveError ?? new Error("The logo file uploaded, but its media record could not be saved.");
      onCreated({media_id:saved[0].media_id,title,media_type:"image",is_published:false});
      setStatus("Logo saved privately. Publish this asset in Media Library, then publish the site draft to show it publicly. Your original upload is retained as a private backup.");
      setFile(null);
      setPrepared(null);
    } catch (error) {
      if (uploadedPaths.length) {
        const {error:cleanupError} = await supabase.storage.from("creator-media-private").remove(uploadedPaths);
        if (cleanupError) setStatus("Upload did not finish, and temporary files need cleanup in the private media bucket.");
        else setStatus(error instanceof Error ? error.message : "Logo upload failed; temporary files were removed.");
      } else setStatus(error instanceof Error ? error.message : "Logo upload failed.");
    } finally { setBusy(false); }
  }

  return <section className="nhen-logo-studio" aria-label="Raye2 logo studio">
    <div className="nhen-logo-studio-heading"><div><span className="eyebrow">BRAND ASSET WORKSHOP</span><h3>Prepare your <em>logo.</em></h3><p>Keep the original safe. Clean a plain background, trim empty space and preview the logo against both site themes before publishing.</p></div><span className="nhen-logo-studio-tag">PRIVATE BY DEFAULT</span></div>
    <label className="nhen-logo-file"><span>Choose logo image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void selectFile(e.target.files?.[0]??null)}/><small>PNG, JPG or WebP · up to 20 MB</small></label>
    {file && <div className="nhen-logo-controls">
      <label className="nhen-logo-toggle"><input type="checkbox" checked={removeBackground} onChange={e=>{setRemoveBackground(e.target.checked);setPrepared(null);}}/><span><strong>Remove a plain background</strong><small>Removes a similar colour connected to the image edges. Best for solid or evenly coloured backgrounds; detailed or gradient backgrounds may need a dedicated editor.</small></span></label>
      <label className="nhen-logo-toggle"><input type="checkbox" checked={trimTransparent} onChange={e=>{setTrimTransparent(e.target.checked);setPrepared(null);}}/><span><strong>Auto-trim and centre the logo</strong><small>Removes empty transparent margins and adds balanced breathing room for the website header.</small></span></label>
      {removeBackground && <label className="nhen-logo-tolerance">Background sensitivity <strong>{tolerance}</strong><input type="range" min="12" max="100" step="2" value={tolerance} onChange={e=>{setTolerance(Number(e.target.value));setPrepared(null);}}/><small>Increase if a halo remains. Lower it if parts of the logo disappear.</small></label>}
      <div className="nhen-logo-preview-wrap"><span>PREVIEW / {prepared?"CLEANED & CENTRED":"ORIGINAL"}</span><div className="nhen-logo-theme-previews"><div className="nhen-logo-theme-preview nhen-logo-theme-dark"><span>DARK THEME</span><img src={preview} alt="Logo preview on dark theme"/></div><div className="nhen-logo-theme-preview nhen-logo-theme-light"><span>LIGHT THEME</span><img src={preview} alt="Logo preview on light theme"/></div></div></div>
      <div className="nhen-logo-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void prepare()}>{busy?"Preparing…":"Prepare preview"}</button><button type="button" className="button button-primary" disabled={busy||!prepared} onClick={()=>void save()}>{busy?"Saving…":"Save to media library ↗"}</button></div>
    </div>}
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
