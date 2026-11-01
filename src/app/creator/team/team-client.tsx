"use client";
import {useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export type TeamMember={userId:string;email:string;role:string;active:boolean;createdAt:string};
const roles=["admin","editor","moderator","analyst"];
export default function CreatorTeamClient({initialTeam}:{initialTeam:TeamMember[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const [team,setTeam]=useState(initialTeam),[email,setEmail]=useState(""),[role,setRole]=useState("editor"),[inviteUrl,setInviteUrl]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 async function invite(){
  if(!supabase||busy||!email.trim())return;setBusy(true);setNotice("");setInviteUrl("");
  try{
   const token=Array.from(crypto.getRandomValues(new Uint8Array(48))).map(x=>x.toString(16).padStart(2,"0")).join("");
   const {error}=await supabase.rpc("create_creator_invite",{p_email:email.trim().toLowerCase(),p_role:role,p_token:token});
   if(error)throw error;
   setInviteUrl(window.location.origin+"/creator/accept-invite?token="+token);
   setEmail("");setNotice("Invitation created. Copy the one-time link and send it privately to the matching email address.");
  }catch(e){setNotice(e instanceof Error?e.message:"Could not create invitation.")}finally{setBusy(false)}
 }
 async function changeRole(member:TeamMember,next:string){
  if(!supabase||busy||member.role==="owner")return;setBusy(true);
  const {error}=await supabase.rpc("set_creator_admin_role",{p_user_id:member.userId,p_role:next});
  if(error)setNotice("Could not update this role.");else{setTeam(xs=>xs.map(x=>x.userId===member.userId?{...x,role:next}:x));setNotice("Team role updated.");}setBusy(false);
 }
 async function toggleActive(member:TeamMember){
  if(!supabase||busy||member.role==="owner")return;setBusy(true);
  const {error}=await supabase.rpc("set_creator_admin_active",{p_user_id:member.userId,p_active:!member.active});
  if(error)setNotice("Could not change account access.");else{setTeam(xs=>xs.map(x=>x.userId===member.userId?{...x,active:!x.active}:x));setNotice(member.active?"Creator access deactivated.":"Creator access restored.");}setBusy(false);
 }
 return <section className="nhen-team-workspace">
  <div className="nhen-card nhen-card-pad"><span className="nhen-section-label">INVITE A COLLABORATOR</span><h2>Grow your studio carefully.</h2><p className="nhen-muted">Invitations are one-use, expire after seven days and are tied to the invited email. Teammates must create and verify their own account before accepting.</p>
   <div className="nhen-team-invite-form"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="collaborator@example.com"/></label><label>Role<select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</select></label><button className="button button-primary" disabled={busy||!email.includes("@")} onClick={()=>void invite()}>{busy?"Working…":"Create invitation ↗"}</button></div>
   {inviteUrl&&<div className="nhen-invite-link"><strong>One-time invitation link</strong><input readOnly value={inviteUrl}/><button className="button button-secondary" onClick={()=>void navigator.clipboard.writeText(inviteUrl)}>Copy invite link</button></div>}
   {notice&&<p className="nhen-mod-notice" role="status">{notice}</p>}
  </div>
  <div className="nhen-card nhen-card-pad"><div className="nhen-card-heading"><div><span className="nhen-section-label">ACCESS ROSTER</span><h2>Studio team</h2></div><span className="nhen-pill">{team.length} accounts</span></div>
   <div className="nhen-team-list">{team.map(member=><article className="nhen-team-row" key={member.userId}><div><strong>{member.email}</strong><small>{member.role.toUpperCase()} · Added {new Date(member.createdAt).toLocaleDateString()}</small></div><select aria-label={"Role for "+member.email} value={member.role} disabled={busy||member.role==="owner"||!member.active} onChange={e=>void changeRole(member,e.target.value)}>{["owner",...roles].map(r=><option key={r} value={r}>{r}</option>)}</select><span className={"nhen-team-status "+(member.active?"active":"inactive")}>{member.active?"ACTIVE":"INACTIVE"}</span><button disabled={busy||member.role==="owner"} onClick={()=>void toggleActive(member)}>{member.active?"Deactivate":"Reactivate"}</button></article>)}</div>
  </div>
  <div className="nhen-card nhen-card-pad"><span className="nhen-section-label">ROLE GUIDE</span><div className="nhen-role-guide"><p><strong>Owner</strong> — full control, team invitations and role management.</p><p><strong>Admin</strong> — broad creator operations and moderation.</p><p><strong>Editor</strong> — content, media and publishing drafts.</p><p><strong>Moderator</strong> — community review and reports.</p><p><strong>Analyst</strong> — read-only performance and reports.</p></div></div>
 </section>
}
