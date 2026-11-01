"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export default function AcceptInviteClient({token}:{token:string}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const router=useRouter();const [status,setStatus]=useState("Checking your invitation…"),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!supabase){setStatus("Authentication is not configured.");return}void supabase.auth.getUser().then(({data,error}: {data:{user:{email?:string|null}|null};error:{message:string}|null})=>{if(error||!data.user){setStatus("Sign in or create your account with the invited email, verify it, then reopen this invitation link.");setReady(false)}else{setReady(true);setStatus("Signed in as "+data.user.email+". Ready to accept the invitation.")}})},[supabase]);
 async function accept(){if(!supabase||!token||!ready||busy)return;setBusy(true);const {data,error}=await supabase.rpc("accept_creator_invite",{p_token:token});if(error)setStatus(error.message);else{setStatus("Invitation accepted. Your studio access is active as "+data?.[0]?.role+".");router.push("/creator");router.refresh()}setBusy(false)}
 return <div className="nhen-invite-accept-actions">{status&&<p role="status">{status}</p>}{ready?<button className="button button-primary" disabled={busy||!token} onClick={()=>void accept()}>{busy?"Accepting…":"Accept invitation ↗"}</button>:<Link className="button button-secondary" href="/community#join">Open Nhen? sign in / registration</Link>}</div>
}
