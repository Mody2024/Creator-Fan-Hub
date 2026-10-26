import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const modules = [
  { number: "01", title: "Site identity", detail: "Name, logo, copy, colors and themes", state: "Foundation" },
  { number: "02", title: "Ideas & polls", detail: "Submissions, moderation, votes and deadlines", state: "Planned" },
  { number: "03", title: "Media library", detail: "Hero videos, uploads, mascot and audio", state: "Planned" },
  { number: "04", title: "Events & socials", detail: "Events, countdowns, social links and presets", state: "Planned" },
  { number: "05", title: "Publishing history", detail: "Draft preview, published versions and rollback", state: "Foundation" }
];

export default async function CreatorDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const adminId = process.env.ADMIN_USER_ID;
  if (!supabase || !adminId) redirect("/creator/login?setup=required");

  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string" || subject !== adminId) redirect("/creator/login");

  return <main className="dashboard-shell">
    <header className="dashboard-topbar"><a className="wordmark" href="/">THE INNER CIRCLE<span>®</span></a><span className="admin-session"><i /> AUTHENTICATED WORKSPACE</span><form action="/creator/logout" method="post"><button className="logout-button" type="submit">Sign out ↗</button></form></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">CREATOR CONTROL ROOM / OVERVIEW</span><h1>Make it <em>yours.</em></h1><p>One workspace for the public experience, community tools, and every future update.</p></div><span className="draft-badge">● DEVELOPMENT / DRAFT</span></div>
      <section className="dashboard-stats"><article><span>PUBLIC CONFIG</span><strong>Connected when ready</strong><small>Published snapshot reader prepared</small></article><article><span>CREATOR ACCESS</span><strong>Verified server-side</strong><small>Account allowlist required</small></article><article><span>PUBLISHING</span><strong>Not live yet</strong><small>Database adapter still required</small></article></section>
      <div className="module-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Control every detail.</h2></div><span className="module-count">05 MODULE AREAS</span></div>
      <section className="module-grid">{modules.map(item=><article className="module-card" key={item.number}><div className="module-card-top"><span>{item.number} / MODULE</span><span className="module-state">{item.state}</span></div><h3>{item.title}</h3><p>{item.detail}</p><span className="module-arrow">↗</span></article>)}</section>
      <p className="dashboard-disclaimer">This is the authenticated dashboard shell. Editing controls remain disabled until the dedicated Supabase project, database migrations, and transactional publishing adapter are configured.</p>
    </div>
  </main>;
}
