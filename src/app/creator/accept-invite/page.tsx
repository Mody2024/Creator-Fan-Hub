import Link from "next/link";
import AcceptInviteClient from "./accept-invite-client";
export default async function AcceptCreatorInvitePage({searchParams}:{searchParams:Promise<{token?:string}>}){
 const {token=""}=await searchParams;
 return <main className="admin-shell"><div className="admin-card nhen-invite-accept-card"><Link className="wordmark nhen-wordmark" href="/"><span className="nhen-wordmark-copy"><strong>Nhen?</strong><small lang="ar" dir="rtl">نهين؟</small></span></Link><span className="eyebrow">NHEN? / TEAM INVITATION</span><h1>Join the <em>studio.</em></h1><p>Accept your one-time invitation using the same email address that received it. Your email must be verified first.</p><AcceptInviteClient token={token}/></div></main>;
}
