"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export type Notice={id:string;type:string;targetType:string;targetId:string;message:string;readAt:string|null;createdAt:string;actor:string;handle:string|null};
function href(n:Notice){if(n.targetType==="video")return "/watch/"+n.targetId;if(n.targetType==="profile")return n.handle?"/u/"+n.handle:"/community";return "/community"}
export default function NotificationsClient({initialNotices}:{initialNotices:Notice[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const [items,setItems]=useState(initialNotices);const [notice,setNotice]=useState("");
 const unread=items.filter(x=>!x.readAt).length;
 async function markRead(id:string){if(!supabase)return;const now=new Date().toISOString();setItems(xs=>xs.map(x=>x.id===id?{...x,readAt:now}:x));const {error}=await supabase.from("member_notifications").update({read_at:now}).eq("id",id);if(error)setNotice("Could not update notification status.");}
 async function markAll(){if(!supabase||!unread)return;const now=new Date().toISOString();setItems(xs=>xs.map(x=>({...x,readAt:x.readAt??now})));const {data}=await supabase.auth.getUser();if(data.user){const {error}=await supabase.from("member_notifications").update({read_at:now}).eq("recipient_id",data.user.id).is("read_at",null);if(error)setNotice("Could not mark all notifications as read.");}}
 return <section className="nhen-notification-list"><div className="nhen-notification-toolbar"><span>{unread} unread</span><button disabled={!unread} onClick={()=>void markAll()}>Mark all as read</button></div>{notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}{items.length?items.map(n=><article className={"nhen-notification-item "+(!n.readAt?"unread":"")} key={n.id}><span className="nhen-notification-icon">{n.type==="follow"?"◎":n.type.includes("video")?"▶":"✦"}</span><div><p><strong>{n.actor}</strong> {n.message}</p><small>{new Date(n.createdAt).toLocaleString()}</small><Link href={href(n)} onClick={()=>{if(!n.readAt)void markRead(n.id)}}>Open ↗</Link></div><button className="nhen-notification-read" onClick={()=>void markRead(n.id)} disabled={!!n.readAt}>{n.readAt?"Read":"Mark read"}</button></article>):<div className="nhen-card nhen-empty-state">You're all caught up. New activity will appear here.</div>}</section>
}
