import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CreatorSettings from "./creator-settings";
import IdeaModerationQueue from "./idea-moderation-queue";
import PollManagement from "./poll-management";
import EventSocialManagement from "./event-social-management";
import MediaLibrary from "./media-library";
import { getPublicSiteConfig } from "@/lib/public-site-config";

export const dynamic = "force-dynamic";

const modules = [
  { number: "01", title: "Site identity", detail: "Name, logo, copy, colors and themes", state: "Editor started" },
  { number: "02", title: "Ideas & polls", detail: "Submissions, moderation, votes and deadlines", state: "Connected" },
  { number: "03", title: "Media library", detail: "Hero videos, uploads, mascot and audio", state: "In progress" },
  { number: "04", title: "Events & socials", detail: "Events, countdowns, social links and presets", state: "Connected" },
  { number: "05", title: "Publishing history", detail: "Draft preview, published versions and rollback", state: "Database ready" }
];

export default async function CreatorDashboardPage() {
  const [supabase, publicConfig] = await Promise.all([createSupabaseServerClient(), getPublicSiteConfig()]);
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/creator/login");
  const { data: admin, error: adminError } = await supabase
    .from("creator_admins").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle();
  if (adminError || !admin) redirect("/creator/login?access=restricted");

  return <main className="dashboard-shell">
    <header className="dashboard-topbar"><Link className="wordmark" href="/">{publicConfig.siteName}<span>®</span></Link><span className="admin-session"><i /> AUTHENTICATED WORKSPACE</span><form action="/creator/logout" method="post"><button className="logout-button" type="submit">Sign out ↗</button></form></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">CREATOR CONTROL ROOM / OVERVIEW</span><h1>Make it <em>yours.</em></h1><p>Manage the public experience from one workspace. Save drafts privately, then publish approved changes.</p></div><span className="draft-badge">● DEVELOPMENT / DRAFT</span></div>
      <section className="dashboard-stats"><article><span>PUBLIC CONFIG</span><strong>Supabase connected</strong><small>Published snapshot is the public source of truth</small></article><article><span>CREATOR ACCESS</span><strong>Verified server-side</strong><small>Only allowlisted creator accounts can edit</small></article><article><span>PUBLISHING</span><strong>Versioned snapshots</strong><small>Concurrent draft changes are checked</small></article></section>
      <CreatorSettings />
      <PollManagement />
      <IdeaModerationQueue />
      <EventSocialManagement />
      <MediaLibrary />
      <div className="module-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>More control, coming next.</h2></div><span className="module-count">05 MODULE AREAS</span></div>
      <section className="module-grid">{modules.map(item=><article className="module-card" key={item.number}><div className="module-card-top"><span>{item.number} / MODULE</span><span className="module-state">{item.state}</span></div><h3>{item.title}</h3><p>{item.detail}</p><span className="module-arrow">↗</span></article>)}</section>
      <p className="dashboard-disclaimer">Poll authoring, voting, idea submissions and moderation are connected to Supabase. Media uploads now support private drafts and publication; hero/logo binding, 3D model formats and final production checks remain in progress.</p>
    </div>
  </main>;
}
