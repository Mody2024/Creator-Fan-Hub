"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export type SavedItem={id:string;kind:"post"|"video";body:string;createdAt:string;type:string;author:string;handle:string;slug?:string;title?:string};
type Collection={id:string;name:string;description:string;itemCount:number};
type CollectionItem={item_kind:"post"|"video";item_id:string;title:string|null;body:string|null;author_handle:string|null;author_display_name:string|null;video_slug:string|null;added_at:string};
type OpenCollection={id:string;name:string;description:string;itemCount:number;items:CollectionItem[]};
export default function SavedPostsClient({initialItems,locale="en"}:{initialItems:SavedItem[];locale?:"en"|"ar"}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [items,setItems]=useState(initialItems);
 const [notice,setNotice]=useState("");
 const [filter,setFilter]=useState<"all"|"videos"|"posts">("all");
 const isArabic=locale==="ar";
 const [memberId,setMemberId]=useState<string|null>(null);
 const [collections,setCollections]=useState<Collection[]>([]);
 const [open,setOpen]=useState<OpenCollection|null>(null);
 const [menuFor,setMenuFor]=useState<string|null>(null);
 const [newName,setNewName]=useState("");
 const [editing,setEditing]=useState(false);
 const [renameValue,setRenameValue]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void supabase.auth.getUser().then(async({data}:{data:{user:{id:string}|null}})=>{
   if(!alive||!data.user)return;
   setMemberId(data.user.id);
   const {data:cols}=await supabase.rpc("raye2_get_my_collections");
   if(alive&&Array.isArray(cols))setCollections(cols.map((row:{id:string;name:string;description:string;item_count:number})=>({id:row.id,name:row.name,description:row.description??"",itemCount:Number(row.item_count)})));
  });
  return()=>{alive=false};
 },[supabase]);
 const visible=items.filter(item=>filter==="all"||(filter==="videos"?item.kind==="video":item.kind==="post"));
 const t=isArabic?{all:"الكل",videos:"الفيديوهات",posts:"المنشورات",video:"فيديو",post:"منشور",sign:"سجّل الدخول لإدارة المحفوظات.",error:"تعذرت إزالة العنصر المحفوظ.",removed:"تمت الإزالة من مكتبتك.",open:"افتح المجتمع ↗",watch:"شاهد الفيديو ↗",remove:"إزالة من المحفوظات",emptyTitle:"مكتبتك فارغة.",empty:"احفظ فيديو أو منشورًا لتجده هنا لاحقًا.",explore:"استكشف المجتمع ↗",noFilter:"لا توجد عناصر في هذا التصنيف.",addTo:"أضف إلى مجموعة",collections:"المجموعات",newCollection:"مجموعة جديدة",collectionName:"اسم المجموعة",collectionUpdated:"تم تحديث المجموعة.",collectionError:"تعذر تحديث المجموعة.",openCollection:"فتح",back:"رجوع",items:"عناصر",emptyCollection:"لا توجد عناصر في هذه المجموعة بعد.",collectionDeleted:"تم حذف المجموعة.",rename:"إعادة تسمية",renameSave:"حفظ",cancel:"إلغاء",deleteCollection:"حذف المجموعة",removedItem:"تمت الإزالة من المجموعة."}:{all:"All",videos:"Videos",posts:"Posts",video:"Video",post:"Post",sign:"Sign in to manage your saved library.",error:"Could not remove the saved item.",removed:"Removed from your library.",open:"Open community ↗",watch:"Watch video ↗",remove:"Remove saved",emptyTitle:"Your library is empty.",empty:"Save a video or community post to find it here later.",explore:"Explore community ↗",noFilter:"No items in this category.",addTo:"Add to collection",collections:"Collections",newCollection:"New collection",collectionName:"Collection name",collectionUpdated:"Collection updated.",collectionError:"Could not update the collection.",openCollection:"Open",back:"Back",items:"items",emptyCollection:"This collection has no items yet.",collectionDeleted:"Collection deleted.",rename:"Rename",renameSave:"Save",cancel:"Cancel",deleteCollection:"Delete collection",removedItem:"Removed from the collection."};
 async function remove(item:SavedItem){if(!supabase)return;const {data}=await supabase.auth.getUser();if(!data.user){setNotice(t.sign);return}const query=item.kind==="video"?supabase.from("video_bookmarks").delete().eq("media_id",item.id).eq("user_id",data.user.id):supabase.from("community_bookmarks").delete().eq("post_id",item.id).eq("user_id",data.user.id);const {error}=await query;if(error)setNotice(t.error);else{setItems(current=>current.filter(x=>!(x.id===item.id&&x.kind===item.kind)));setNotice(t.removed)}}
 async function createCollection(){if(!supabase||busy||!newName.trim())return;setBusy(true);try{const {data,error}=await supabase.rpc("raye2_create_collection",{p_name:newName.trim()});if(error)throw error;setCollections(current=>[{id:data as string,name:newName.trim(),description:"",itemCount:0},...current]);setNewName("");setNotice(t.collectionUpdated);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 async function addToCollection(collectionId:string,item:SavedItem){if(!supabase||busy)return;setBusy(true);try{const {error}=await supabase.rpc("raye2_add_to_collection",{p_collection_id:collectionId,p_kind:item.kind,p_item_id:item.id});if(error)throw error;setCollections(current=>current.map(col=>col.id===collectionId?{...col,itemCount:col.itemCount+1}:col));setMenuFor(null);setNotice(t.collectionUpdated);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 async function openCollection(col:Collection){if(!supabase||busy)return;setBusy(true);try{const {data,error}=await supabase.rpc("raye2_get_collection",{p_collection_id:col.id,p_limit:200});if(error)throw error;const rows=(data??[]) as Array<CollectionItem&{name:string;description:string;item_count:number}>;setOpen({id:col.id,name:rows[0]?.name??col.name,description:rows[0]?.description??col.description,itemCount:Number(rows[0]?.item_count??col.itemCount),items:rows});setRenameValue(rows[0]?.name??col.name);setEditing(false);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 async function renameCollection(){if(!supabase||!open||busy||!renameValue.trim())return;setBusy(true);try{const {error}=await supabase.rpc("raye2_update_collection",{p_collection_id:open.id,p_name:renameValue.trim(),p_description:open.description});if(error)throw error;setOpen(current=>current?{...current,name:renameValue.trim()}:current);setCollections(current=>current.map(col=>col.id===open.id?{...col,name:renameValue.trim()}:col));setEditing(false);setNotice(t.collectionUpdated);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 async function deleteCollection(){if(!supabase||!open||busy)return;setBusy(true);try{const {error}=await supabase.rpc("raye2_delete_collection",{p_collection_id:open.id});if(error)throw error;setCollections(current=>current.filter(col=>col.id!==open.id));setOpen(null);setNotice(t.collectionDeleted);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 async function removeFromOpen(item:CollectionItem){if(!supabase||!open||busy)return;setBusy(true);try{const {error}=await supabase.rpc("raye2_remove_from_collection",{p_collection_id:open.id,p_kind:item.item_kind,p_item_id:item.item_id});if(error)throw error;setOpen(current=>current?{...current,itemCount:Math.max(0,current.itemCount-1),items:current.items.filter(x=>!(x.item_id===item.item_id&&x.item_kind===item.item_kind))}:current);setCollections(current=>current.map(col=>col.id===open.id?{...col,itemCount:Math.max(0,col.itemCount-1)}:col));setNotice(t.removedItem);}catch{setNotice(t.collectionError)}finally{setBusy(false)}}
 if(open){
  return <section className="nhen-saved-list">
   {notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}
   <div className="nhen-collection-detail-head">
    <button type="button" className="nhen-action" onClick={()=>setOpen(null)}>← {t.back}</button>
    <div style={{flex:1,minWidth:0}}>
     {editing?<div style={{display:"flex",gap:8}}><input className="nhen-search" value={renameValue} onChange={e=>setRenameValue(e.target.value)} maxLength={60}/><button type="button" className="nhen-action" disabled={busy||!renameValue.trim()} onClick={()=>void renameCollection()}>{t.renameSave}</button><button type="button" className="nhen-action" onClick={()=>setEditing(false)}>{t.cancel}</button></div>:<><strong style={{fontSize:16}}>{open.name}</strong><span className="nhen-muted" style={{fontSize:11,display:"block"}}>{open.itemCount} {t.items}</span></>}
    </div>
    {!editing&&<button type="button" className="nhen-action" onClick={()=>{setRenameValue(open.name);setEditing(true)}}>{t.rename}</button>}
    <button type="button" className="nhen-action" disabled={busy} onClick={()=>void deleteCollection()}>{t.deleteCollection}</button>
   </div>
   {open.items.length?open.items.map(item=><article className="nhen-card nhen-saved-post" key={item.item_kind+":"+item.item_id}>
    <div><strong>{item.item_kind==="video"?(item.title??item.author_display_name??t.video):(item.author_display_name??item.author_handle??t.post)}</strong><span>{item.item_kind==="video"?t.video:t.post} · {new Date(item.added_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</span></div>
    {item.body?<p>{item.body}</p>:null}
    <footer><Link href={item.item_kind==="video"&&item.video_slug?"/watch/"+item.video_slug:"/community#post-"+item.item_id}>{item.item_kind==="video"?t.watch:t.open}</Link><button type="button" disabled={busy} onClick={()=>void removeFromOpen(item)}>{t.remove}</button></footer>
   </article>):<div className="nhen-card nhen-empty-state"><strong>{t.emptyCollection}</strong></div>}
  </section>;
 }
 return <section className="nhen-saved-list">{notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}<div className="nhen-feed-filter" role="group" aria-label={isArabic?"تصفية المحفوظات":"Filter saved items"}>{(["all","videos","posts"] as const).map(value=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{t[value]}</button>)}</div>{memberId&&<section className="nhen-card nhen-card-pad" aria-label={t.collections}><span className="nhen-section-label">{t.collections}</span><div style={{display:"flex",gap:8,marginTop:10}}><input className="nhen-search" value={newName} onChange={e=>setNewName(e.target.value)} placeholder={t.collectionName} maxLength={60}/><button type="button" className="nhen-action" disabled={busy||!newName.trim()} onClick={()=>void createCollection()}>{t.newCollection}</button></div>{collections.length>0&&<div style={{display:"grid",gap:8,marginTop:10}}>{collections.map(col=><div key={col.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><strong style={{fontSize:13,minWidth:0}}>{col.name}</strong><span className="nhen-muted" style={{fontSize:11}}>{col.itemCount}</span><button type="button" className="nhen-action" disabled={busy} onClick={()=>void openCollection(col)}>{t.openCollection}</button></div>)}</div>}</section>}{visible.length?visible.map(item=><article className="nhen-card nhen-saved-post" key={item.kind+":"+item.id}><div><strong>{item.kind==="video"?(item.title??item.author):item.author}</strong><span>{item.kind==="video"?t.video:t.post} · {new Date(item.createdAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</span></div>{item.kind==="post"?<p>{item.body}</p>:item.body?<p>{item.body}</p>:null}<footer><Link href={item.kind==="video"&&item.slug?"/watch/"+item.slug:"/community#post-"+item.id}>{item.kind==="video"?t.watch:t.open}</Link>{memberId&&collections.length>0&&<div className="nhen-collection-picker"><button type="button" aria-haspopup="true" aria-expanded={menuFor===item.id} onClick={()=>setMenuFor(current=>current===item.id?null:item.id)}>{t.addTo} ▾</button>{menuFor===item.id&&<div className="nhen-collection-menu" role="group" aria-label={t.collections}>{collections.map(col=><button type="button" key={col.id} onClick={()=>void addToCollection(col.id,item)}>{col.name}</button>)}</div>}</div>}<button type="button" onClick={()=>void remove(item)}>{t.remove}</button></footer></article>):items.length?<div className="nhen-card nhen-empty-state"><strong>{t.noFilter}</strong></div>:<div className="nhen-card nhen-empty-state"><div><strong>{t.emptyTitle}</strong><p>{t.empty}</p><Link href="/community">{t.explore}</Link></div></div>}</section>
}
