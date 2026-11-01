"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";

type Props={startAt?:number;mediaId:string;title:string;description:string;src:string;youtubeEmbedUrl?:string|null;publishedAt:string;allowComments:boolean;category:string;tags:string[]};
type Comment={id:string;body:string;created_at:string;author_id:string};

export default function WatchDetailClient(props:Props){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [member,setMember]=useState<string|null>(null);
 const [liked,setLiked]=useState(false);\n const [myReaction,setMyReaction]=useState<string|null>(null);\n const [reactionPicker,setReactionPicker]=useState(false);
 const [saved,setSaved]=useState(false);
 const [likes,setLikes]=useState(0);
 const [comments,setComments]=useState<Comment[]>([]);
 const [comment,setComment]=useState("");
 const [notice,setNotice]=useState("");
 const [actionBusy,setActionBusy]=useState(false);

 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void (async()=>{
   try{
    const [counts,user]=await Promise.all([
     supabase.rpc("get_video_reaction_counts",{p_media_ids:[props.mediaId]}),
     supabase.auth.getUser()
    ]);
    if(!alive)return;
    if(counts.error)throw counts.error;
    setLikes(Number(counts.data?.[0]?.reaction_count??0));
    if(user.error)throw user.error;
    const userId=user.data.user?.id??null;
    setMember(userId);
    const [reaction,bookmark,commentRows]=await Promise.all([
     userId?supabase.from("video_reactions").select("media_id,reaction").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     userId?supabase.from("video_bookmarks").select("media_id").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     props.allowComments?supabase.from("video_comments").select("id,body,created_at,author_id").eq("media_id",props.mediaId).eq("status","published").order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[],error:null})
    ]);
    if(!alive)return;
    if(reaction.error||bookmark.error||commentRows.error)throw reaction.error??bookmark.error??commentRows.error;
    setLiked(!!reaction.data);setMyReaction(reaction.data?.reaction??null);setSaved(!!bookmark.data);setComments((commentRows.data??[]) as Comment[]);
    const view=await supabase.rpc("record_video_view",{p_media_id:props.mediaId});
    if(view.error&&alive)setNotice("Your video is playing, but its view could not be recorded right now.");
   }catch{
    if(alive)setNotice("Some video details could not be loaded. Check your connection and refresh to try again.");
   }
  })();
  return()=>{alive=false};
 },[supabase,props.mediaId,props.allowComments]);

 async function chooseReaction(reaction:string){
  if(!supabase||!member){setNotice("Sign in to react to videos.");return}
  if(actionBusy)return;
  const previous=myReaction,previousLikes=likes;
  const next=previous===reaction?null:reaction;
  setActionBusy(true);setReactionPicker(false);setMyReaction(next);setLiked(!!next);
  setLikes(Math.max(0,previousLikes+(next&&!previous?1:!next&&previous?-1:0)));
  try{
   const result=next
    ?await supabase.from("video_reactions").upsert({media_id:props.mediaId,user_id:member,reaction:next},{onConflict:"media_id,user_id"})
    :await supabase.from("video_reactions").delete().eq("media_id",props.mediaId).eq("user_id",member);
   if(result.error)throw result.error;
   setNotice(next?"Your NHEN reaction is live.":"Your reaction was removed.");
  }catch{
   setMyReaction(previous);setLiked(!!previous);setLikes(previousLikes);setNotice("Could not save your reaction. Your previous reaction has been restored.");
  }finally{setActionBusy(false)}
 }

