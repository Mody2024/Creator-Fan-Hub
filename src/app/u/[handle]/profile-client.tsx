"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Profile={userId:string;handle:string;displayName:string;bio:string;avatarUrl:string|null;websiteUrl:string|null;joinedAt:string;achievements:Array<{code:string;title:string;description:string;icon:string}>};
export type ProfilePost={id:string;body:string;createdAt:string;type:string};

export default function MemberProfileClient({profile,posts,followerCount,followingCount}:{profile:Profile;posts:ProfilePost[];followerCount:number;followingCount:number}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [viewer,setViewer]=useState<string|null>(null),[following,setFollowing]=useState(false),[followers,setFollowers]=useState(followerCount),[editing,setEditing]=useState(false),[displayName,setDisplayName]=useState(profile.displayName),[bio,setBio]=useState(profile.bio),[website,setWebsite]=useState(profile.websiteUrl??""),[notice,setNotice]=useState("");
 useEffect(()=>{if(!supabase)return;let alive=true;void(async()=>{const {data}=await supabase.auth.getUser();if(!alive||!data.user)return;setViewer(data.user.id);if(data.user.id!==profile.userId){const {data:edge}=await supabase.from("member_follows").select("follower_id").eq("follower_id",data.user.id).eq("followed_id",profile.userId).maybeSingle();if(alive)setFollowing(!!edge)}})();return()=>{alive=false}},[supabase,profile.userId]);
 async function toggleFollow(){if(!supabase||!viewer){setNotice("Sign in to follow members.");return}const next=!following;setFollowing(next);setFollowers(n=>Math.max(0,n+(next?1:-1)));const result=next?await supabase.from("member_follows").insert({follower_id:viewer,followed_id:profile.userId}):await supabase.from("member_follows").delete().eq("follower_id",viewer).eq("followed_id",profile.userId);if(result.error){setFollowing(!next);setFollowers(n=>Math.max(0,n+(next?-1:1)));setNotice("Could not update your following list.")}}
 async function saveProfile(){if(!supabase||!viewer||viewer!==profile.userId)return;const {error}=await supabase.from("member_profiles").update({display_name:displayName.trim().slice(0,40),bio:bio.trim().slice(0,240),website_url:website.trim()||null}).eq("user_id",viewer);setNotice(error?"Could not save profile.":"Profile updated.");if(!error)setEditing(false)}
 return <main className="nhen-profile-page">
  <header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/community">Community</Link><Link href="/#videos">Watch</Link></nav></header>
  <div className="nhen-profile-wrap">
   <div className="nhen-profile-cover"/>
   <section className="nhen-profile-card">
    <div className="nhen-profile-heading"><div className="nhen-profile-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt=""/>:profile.displayName.slice(0,1).toUpperCase()}</div><div className="nhen-profile-identity"><span className="nhen-section-label">NHEN IDENTITY</span><h1>{profile.displayName}</h1><p>@{profile.handle}</p></div>{viewer===profile.userId?<button className="button button-secondary" onClick={()=>setEditing(x=>!x)}>{editing?"Cancel":"Edit profile"}</button>:<button className="button button-primary" onClick={()=>void toggleFollow()}>{following?"Following":"Follow"} {following?"✓":"+"}</button>}</div>
    {editing&&viewer===profile.userId&&<div className="nhen-profile-editor"><label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={40}/></label><label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={240} rows={3}/></label><label>Website<input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://…"/></label><button className="button button-primary" onClick={()=>void saveProfile()}>Save profile ↗</button></div>}
    {profile.bio&&<p className="nhen-profile-bio">{profile.bio}</p>}
    {profile.websiteUrl&&<a className="nhen-profile-website" href={profile.websiteUrl} target="_blank" rel="noreferrer">{profile.websiteUrl}</a>}
    {profile.achievements.length>0&&<section className="nhen-achievement-section"><span className="nhen-section-label">MILESTONES</span><div className="nhen-achievement-grid">{profile.achievements.map(a=><div className="nhen-achievement-chip" key={a.code} title={a.description}><span>{a.icon}</span><div><strong>{a.title}</strong><small>{a.description}</small></div></div>)}</div></section>}
    <div className="nhen-profile-stats"><span><strong>{posts.length}</strong> Posts</span><span><strong>{followers}</strong> Followers</span><span><strong>{followingCount}</strong> Following</span><span>Joined {new Date(profile.joinedAt).toLocaleDateString()}</span></div>
   </section>
   {notice&&<p className="nhen-mod-notice" role="status">{notice}</p>}
   <section className="nhen-profile-posts"><div className="nhen-card-heading"><h2>Published posts</h2><span className="nhen-muted">{posts.length} posts</span></div>{posts.length?posts.map(p=><article className="nhen-card nhen-profile-post" key={p.id}><div className="nhen-muted">{p.type==="official"?"✦ OFFICIAL":"COMMUNITY"} · {new Date(p.createdAt).toLocaleDateString()}</div><p>{p.body}</p></article>):<div className="nhen-card nhen-empty-state">No public posts yet.</div>}</section>
  </div>
 </main>
}
