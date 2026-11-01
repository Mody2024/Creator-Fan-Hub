import Link from "next/link";
import AcceptInviteClient from "./accept-invite-client";
export default async function AcceptCreatorInvitePage({searchParams}:{searchParams:Promise<{token?:string}>}){
 const {token=""}=await searchParams;
 return <main className="admin-shell"><div className="admin-card nhen-invite-accept-card"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><span className="eyebrow">NHEN STUDIO / TEAM INVITATION</span><h1>Join the <em>studio.</em></h1><p>Accept your one-time invitation using the same email address that received it. Your email must be verified first.</p><AcceptInviteClient token={token}/></div></main>;
}
