"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export type SavedPost={id:string;body:string;createdAt:string;type:string;author:string;handle:string};
export default function SavedPostsClient({initialPosts}:{initialPosts:SavedPost[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const [posts,setPosts]=useState(initialPosts);const [notice,setNotice]=useState("");
 async function remove(id:string){if(!supabase)return;const {data}=await supabase.auth.getUser();if(!data.user){setNotice("Sign in to manage saved posts.");return}const {error}=await supabase.from("community_bookmarks").delete().eq("post_id",id).eq("user_id",data.user.id);if(error)setNotice("Could not remove saved post.");else{setPosts(items=>items.filter(x=>x.id!==id));setNotice("Post removed from your saved library.")}}
 return <section className="nhen-saved-list">{notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}{posts.length?posts.map(p=><article className="nhen-card nhen-saved-post" key={p.id}><div><strong>{p.author}</strong><span>@{p.handle} · {new Date(p.createdAt).toLocaleDateString()}</span></div><p>{p.body}</p><footer><Link href="/community">Open community ↗</Link><button onClick={()=>void remove(p.id)}>Remove saved</button></footer></article>):<div className="nhen-card nhen-empty-state"><div><strong>Your saved space is empty.</strong><p>Save a community post to find it here later.</p><Link href="/community">Explore community ↗</Link></div></div>}</section>
}
