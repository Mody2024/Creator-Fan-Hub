import {redirect} from "next/navigation";
import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import CreatorTeamClient,{type TeamMember} from "./team-client";
import WorkspaceShell from "@/app/raye2-shell/workspace-shell";
export const dynamic="force-dynamic";
export default async function CreatorTeamPage(){
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/creator/login?setup=required");
 const {data:claims,error}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(error||typeof userId!=="string")redirect("/creator/login");
 const {data:admin}=await supabase.from("creator_admins").select("role").eq("user_id",userId).eq("active",true).maybeSingle();if(admin?.role!=="owner")redirect("/creator?access=owner-only");
 const {data,error:teamError}=await supabase.rpc("get_creator_team");if(teamError)redirect("/creator?access=team-unavailable");
 const teamRows=(data??[]) as Array<{user_id:string;email:string|null;role:string;active:boolean;created_at:string;expires_at:string|null}>;const team:TeamMember[]=teamRows.map(x=>({userId:x.user_id,email:x.email??"",role:x.role,active:x.active,createdAt:x.created_at,expiresAt:x.expires_at??null}));
 return <main className="dashboard-shell raye2-creator-shell" data-raye2-ws="on"><WorkspaceShell role={"owner"} /><nav className="raye2-ws-crumbs" aria-label="Raye2 Studio"><Link className="raye2-ws-pill" href="/raye2/studio">← Raye2 Studio</Link></nav><div className="dashboard-content"><div className="dashboard-welcome"><div><span className="eyebrow">RAYE2 / ACCESS MANAGEMENT</span><h1>Your team. <em>Your rules.</em></h1><p>Invite trusted collaborators and give each person only the access their work requires.</p></div><span className="draft-badge">● OWNER ONLY</span></div><CreatorTeamClient initialTeam={team}/></div></main>;
}
