"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "./profile.module.css";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Profile={userId:string;handle:string;displayName:string;bio:string;avatarUrl:string|null;websiteUrl:string|null;joinedAt:string;achievements:Array<{code:string;title:string;description:string;icon:string}>};
export type ProfilePost={id:string;body:string;createdAt:string;type:string};
type ProfileVideo={id:string;title:string;slug:string;description:string;category:string;src:string};
type ProfileShort={id:string;title:string;caption:string;src:string;duration:number};

export default function MemberProfileClient({profile,posts,videos,communityShorts,locale="en",followerCount,followingCount}:{profile:Profile;posts:ProfilePost[];videos:ProfileVideo[];communityShorts:ProfileShort[];locale?:"en"|"ar";followerCount:number;followingCount:number}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const isArabic=locale==="ar";const t=isArabic?{community:"المجتمع",watch:"شاهد",cancel:"إلغاء",edit:"تعديل الملف الشخصي",follow:"متابعة",following:"تتابعه",unblock:"إلغاء الحظر",block:"حظر",signIn:"سجّل الدخول لمتابعة الأعضاء.",followError:"تعذر تحديث قائمة المتابعة.",blockError:"تعذر حظر هذا العضو.",unblockError:"تعذر إلغاء الحظر.",unblocked:"تم إلغاء الحظر.",saveError:"تعذر حفظ الملف الشخصي.",saved:"تم تحديث الملف الشخصي.",display:"الاسم المعروض",bioLabel:"نبذة",website:"الموقع الإلكتروني",save:"حفظ الملف الشخصي ↗",milestones:"الإنجازات",posts:"منشورات",followers:"متابعون",followingStat:"يتابع",joined:"انضم",videos:"الفيديوهات",published:"منشور",noVideos:"لا توجد فيديوهات منشورة بعد.",bits:"ميني",shared:"تمت المشاركة",noBits:"لا توجد لقطات مشتركة بعد.",communityPosts:"منشورات المجتمع",noPosts:"لا توجد منشورات عامة بعد.",official:"رسمي",communityType:"المجتمع"}:{community:"Community",watch:"Watch",cancel:"Cancel",edit:"Edit profile",follow:"Follow",following:"Following",unblock:"Unblock",block:"Block",signIn:"Sign in to follow members.",followError:"Could not update your following list.",blockError:"Could not block this member.",unblockError:"Could not unblock this member.",unblocked:"Member unblocked.",saveError:"Could not save profile.",saved:"Profile updated.",display:"Display name",bioLabel:"Bio",website:"Website",save:"Save profile ↗",milestones:"MILESTONES",posts:"Posts",followers:"Followers",followingStat:"Following",joined:"Joined",videos:"Videos",published:"published",noVideos:"No published videos yet.",bits:"Mini's",shared:"shared",noBits:"No Mini’s shared yet.",communityPosts:"Community posts",noPosts:"No public posts yet.",official:"OFFICIAL",communityType:"COMMUNITY"};
 const [viewer,setViewer]=useState<string|null>(null),[following,setFollowing]=useState(false),[blocked,setBlocked]=useState(false),[relationshipBusy,setRelationshipBusy]=useState(false),[followers,setFollowers]=useState(followerCount),[editing,setEditing]=useState(false),[displayName,setDisplayName]=useState(profile.displayName),[bio,setBio]=useState(profile.bio),[website,setWebsite]=useState(profile.websiteUrl??""),[notice,setNotice]=useState("");
 useEffect(()=>{if(!supabase)return;let alive=true;void(async()=>{const {data}=await supabase.auth.getUser();if(!alive||!data.user)return;setViewer(data.user.id);if(data.user.id!==profile.userId){const {data:edge}=await supabase.from("member_follows").select("follower_id").eq("follower_id",data.user.id).eq("followed_id",profile.userId).maybeSingle();if(alive)setFollowing(!!edge);const {data:block}=await supabase.from("member_blocks").select("blocked_id").eq("blocker_id",data.user.id).eq("blocked_id",profile.userId).maybeSingle();if(alive)setBlocked(!!block)}})();return()=>{alive=false}},[supabase,profile.userId]);
 async function toggleFollow(){if(!supabase||!viewer){setNotice(t.signIn);return}if(relationshipBusy||viewer===profile.userId||blocked)return;setRelationshipBusy(true);const next=!following;setFollowing(next);setFollowers(n=>Math.max(0,n+(next?1:-1)));try{const result=next?await supabase.from("member_follows").insert({follower_id:viewer,followed_id:profile.userId}):await supabase.from("member_follows").delete().eq("follower_id",viewer).eq("followed_id",profile.userId);if(result.error){setFollowing(!next);setFollowers(n=>Math.max(0,n+(next?-1:1)));setNotice(t.followError)}}catch{setFollowing(!next);setFollowers(n=>Math.max(0,n+(next?-1:1)));setNotice(t.followError)}finally{setRelationshipBusy(false)}}
 async function toggleBlock(){
  if(!supabase||!viewer||viewer===profile.userId||relationshipBusy)return;
  setRelationshipBusy(true);
  try{
  if(!blocked){
   const {error:blockError}=await supabase.from("member_blocks").insert({blocker_id:viewer,blocked_id:profile.userId});
   if(blockError){setNotice(t.blockError);return;}
   const {error:followError}=await supabase.from("member_follows").delete().eq("follower_id",viewer).eq("followed_id",profile.userId);
   if(followError){
    await supabase.from("member_blocks").delete().eq("blocker_id",viewer).eq("blocked_id",profile.userId);
    setNotice(t.blockError);return;
   }
   if(following){setFollowing(false);setFollowers(n=>Math.max(0,n-1));}
   setBlocked(true);setNotice(isArabic?"تم حظر العضو وإلغاء المتابعة.":"Member blocked and follow removed.");
  }else{
   const {error}=await supabase.from("member_blocks").delete().eq("blocker_id",viewer).eq("blocked_id",profile.userId);
   if(error){setNotice(t.unblockError);return;}
   setBlocked(false);setNotice(t.unblocked);
  }
  }catch{setNotice(blocked?t.unblockError:t.blockError)}finally{setRelationshipBusy(false)}
 }
 async function saveProfile(){if(!supabase||!viewer||viewer!==profile.userId)return;const {error}=await supabase.from("member_profiles").update({display_name:displayName.trim().slice(0,40),bio:bio.trim().slice(0,240),website_url:website.trim()||null}).eq("user_id",viewer);setNotice(error?t.saveError:t.saved);if(!error)setEditing(false)}
 return <main className={styles.page} dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className={styles.top}><Link className={styles.brand} href="/raye2/home"><span className={styles.brandGlyph}>R</span><span className={styles.brandWord}>Raye2</span></Link><form className={styles.search} action="/search"><span aria-hidden="true">⌕</span><input name="q" placeholder={isArabic?"ابحث عن صُنّاع المحتوى":"Search creators and videos"} aria-label={isArabic?"بحث":"Search creators and videos"}/></form><nav className={styles.topLinks}><Link href="/raye2/home">{isArabic?"الرئيسية":"Home"}</Link><Link href="/community">{t.community}</Link><Link href="/watch">{t.watch}</Link><Link href="/series">{isArabic?"السلاسل":"Series"}</Link><Link href="/shorts">{t.bits}</Link></nav></header>
  <div className={styles.wrap}>
   <div className={styles.cover}/>
   <section className={styles.card}>
    <div className={styles.heading}>
     <div className={styles.avatar}>{profile.avatarUrl?<Image src={profile.avatarUrl} alt="" width={108} height={108} unoptimized/>:profile.displayName.slice(0,1).toUpperCase()}</div>
     <div className={styles.identity}><span className={styles.eyebrow}>{isArabic?"هوية RAYE2":"RAYE2 IDENTITY"}</span><h1>{profile.displayName}</h1><p>@{profile.handle}</p></div>
     <div className={styles.actions}>{viewer===profile.userId?<button className={styles.secondary} type="button" onClick={()=>setEditing(x=>!x)}>{editing?t.cancel:t.edit}</button>:<><button className={styles.primary} type="button" disabled={blocked||relationshipBusy} onClick={()=>void toggleFollow()}>{following?t.following:t.follow} {following?"✓":"+"}</button><button className={styles.block} type="button" disabled={relationshipBusy} onClick={()=>void toggleBlock()}>{blocked?t.unblock:t.block}</button></>}</div>
    </div>
    {editing&&viewer===profile.userId&&<div className={styles.editor}><label>{t.display}<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={40}/></label><label>{t.bioLabel}<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={240} rows={3}/></label><label>{t.website}<input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://…"/></label><button className={styles.primary} type="button" onClick={()=>void saveProfile()}>{t.save}</button></div>}
    {profile.bio&&<p className={styles.bio}>{profile.bio}</p>}
    {profile.websiteUrl&&<a className={styles.website} href={profile.websiteUrl} target="_blank" rel="noreferrer">{profile.websiteUrl}</a>}
    {profile.achievements.length>0&&<section className={styles.achievements}><span className={styles.eyebrow}>{t.milestones}</span><div className={styles.achievementGrid}>{profile.achievements.map(a=><div className={styles.achievement} key={a.code} title={a.description}><span>{a.icon}</span><div><strong>{a.title}</strong><small>{a.description}</small></div></div>)}</div></section>}
    <div className={styles.stats}><span><strong>{posts.length+videos.length+communityShorts.length}</strong>{t.posts}</span><span><strong>{followers}</strong>{t.followers}</span><span><strong>{followingCount}</strong>{t.followingStat}</span><span>{t.joined} {new Date(profile.joinedAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</span></div>
   </section>
   {notice&&<p className={styles.notice} role="status">{notice}</p>}
   <nav className={styles.profileTabs} aria-label={isArabic?"أقسام الملف الشخصي":"Profile sections"}><a href="#profile-videos">{t.videos}</a><a href="#profile-shorts">{t.bits}</a><a href="#profile-posts">{t.communityPosts}</a></nav>
   <section className={styles.section} id="profile-videos"><div className={styles.sectionHead}><h2>{t.videos}</h2><span className={styles.muted}>{videos.length} {t.published}</span></div>{videos.length?<div className={styles.videoGrid}>{videos.map(video=><article className={styles.video} key={video.id}><video src={video.src} controls preload="metadata" aria-label={video.title}/><div className={styles.videoInfo}><span className={styles.eyebrow}>{video.category}</span><h3><Link href={"/watch/"+video.slug}>{video.title}</Link></h3><p>{video.description}</p><Link href={"/watch/"+video.slug}>{isArabic?"شاهد الفيديو ↗":"Watch video ↗"}</Link></div></article>)}</div>:<div className={styles.empty}>{t.noVideos}</div>}</section>
   <section className={styles.section} id="profile-shorts"><div className={styles.sectionHead}><h2>{t.bits}</h2><span className={styles.muted}>{communityShorts.length} {t.shared}</span></div>{communityShorts.length?<div className={styles.videoGrid}>{communityShorts.map(video=><article className={styles.video} key={video.id}><video src={video.src} controls playsInline preload="metadata" aria-label={video.title}/><div className={styles.videoInfo}><span className={styles.eyebrow}>RAYE2 MINI’S · {video.duration}s</span><h3>{video.title}</h3><p>{video.caption}</p></div></article>)}</div>:<div className={styles.empty}>{t.noBits}</div>}</section>
   <section className={styles.section} id="profile-posts"><div className={styles.sectionHead}><h2>{t.communityPosts}</h2><span className={styles.muted}>{posts.length} {t.posts}</span></div>{posts.length?posts.map(p=><article className={styles.post} key={p.id}><div className={styles.postMeta}>{p.type==="official"?"✦ "+t.official:t.communityType} · {new Date(p.createdAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</div><p>{p.body}</p></article>):<div className={styles.empty}>{t.noPosts}</div>}</section>
  </div>
 </main>
}
