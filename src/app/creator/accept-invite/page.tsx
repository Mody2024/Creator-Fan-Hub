import AuthBrand from "@/app/raye2-shell/auth-brand";
import AcceptInviteClient from "./accept-invite-client";
export default async function AcceptCreatorInvitePage({searchParams}:{searchParams:Promise<{token?:string}>}){
 const {token=""}=await searchParams;
 return <main className="admin-shell raye2-auth-screen"><div className="admin-card raye2-invite-accept-card"><AuthBrand /><span className="eyebrow">RAYE2 / TEAM INVITATION</span><h1>Join the <em>studio.</em></h1><p>Accept your one-time invitation using the same email address that received it. Your email must be verified first.</p><AcceptInviteClient token={token}/></div></main>;
}
