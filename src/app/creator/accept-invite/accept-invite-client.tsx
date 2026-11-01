"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export default function AcceptInviteClient({token}:{token:string}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const router=useRouter();const [status,setStatus]=useState("Checking your invitation…"),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let active=true;
  if(!supabase){setStatus("Authentication is not configured.");return;}
  setReady(false);setStatus("Checking your invitation…");
  void (async()=>{
   try {
    const {data,error}=await supabase.auth.getUser();
    if(!active)return;
    if(error||!data.user){setStatus("Sign in or create your account with the invited email, verify it, then reopen this invitation link.");setReady(false);}
    else {setReady(true);setStatus("Signed in as "+data.user.email+". Ready to accept the invitation.");}
   } catch {
    if(active){setReady(false);setStatus("We could not verify your sign-in because the connection failed. Check your connection and reload this page.");}
   }
  })();
  return ()=>{active=false;};
 },[supabase]);
 async function accept(){
  if(!supabase||!token||!ready||busy)return;
  setBusy(true);setStatus("Verifying and accepting your invitation…");
  try {
   const {data,error}=await supabase.rpc("accept_creator_invite",{p_token:token});
   if(error)throw error;
   setStatus("Invitation accepted. Your studio access is active as "+data?.[0]?.role+".");
   router.push("/creator");router.refresh();
  } catch {
   setStatus("We could not accept this invitation. Check that you are signed in with the invited email, then retry or ask the owner for a fresh invitation.");
  } finally {setBusy(false);}
 }
 return <div className="nhen-invite-accept-actions">{status&&<p role="status">{status}</p>}{ready?<button className="button button-primary" disabled={busy||!token} onClick={()=>void accept()}>{busy?"Accepting…":"Accept invitation ↗"}</button>:<Link className="button button-secondary" href="/community#join">Open Nhen? sign in / registration</Link>}</div>
}
