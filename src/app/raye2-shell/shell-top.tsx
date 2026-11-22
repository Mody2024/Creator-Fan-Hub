"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import ShellIcon from "./shell-icons";
import ShellMenu from "./shell-menu";
import ShellBrand from "./shell-brand";
import { SHELL_T, createItemsFor, type ShellLocale } from "./shell-data";

type Props = {
  locale: ShellLocale;
  /** Optional logo override; otherwise the site-wide uploaded logo or the Raye2 smiley is used. */
  mark?: ReactNode;
  /** Signed-in member: shows their handle instead of Join. Omit to let the bar detect it in the browser. */
  member?: { handle: string } | null;
  /** Unread notifications badge on the bell. */
  unread?: number;
  /** When given, a sign-out button is shown for signed-in members. */
  onSignOut?: () => void;
};

/** Sticky glass top bar: brand, search pill, Create menu, notifications, and Join / member. */
export default function ShellTopBar({ locale, mark, member: memberProp, unread = 0, onSignOut }: Props) {
  const t = SHELL_T[locale];
  const [detected, setDetected] = useState<{ handle: string } | null>(null);
  // Layouts for routes outside the session-refresh matcher cannot read the member on the server, so the
  // bar asks the browser client (which refreshes its own session) and only uses the result as a display hint.
  useEffect(() => {
    if (memberProp !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) return;
        const { data: profile } = await supabase.from("member_profiles").select("handle").eq("user_id", userId).maybeSingle();
        if (!cancelled && profile?.handle) setDetected({ handle: profile.handle as string });
      } catch { /* the bar simply keeps showing Join */ }
    })();
    return () => { cancelled = true; };
  }, [memberProp]);
  const member = memberProp !== undefined ? memberProp : detected;
  const bellLabel = unread > 0 ? `${t.notifications}, ${unread} ${t.unread}` : t.notifications;
  return (
    <header className="raye2-shell-top">
      <ShellBrand locale={locale} mark={mark} />
      <form className="raye2-shell-search" action="/search" role="search">
        <ShellIcon name="search" size={20} />
        <input type="search" name="q" placeholder={t.search} aria-label={t.search} maxLength={80} />
      </form>
      <div className="raye2-shell-actions">
        <Link className="raye2-shell-iconbtn raye2-shell-search-link" href="/search" aria-label={t.search}><ShellIcon name="search" size={22} /></Link>
        <ShellMenu label={t.create} icon="plus" items={createItemsFor(locale)} />
        <Link className="raye2-shell-iconbtn raye2-shell-bell" href="/notifications" aria-label={bellLabel} title={t.notifications}>
          <ShellIcon name="bell" size={22} />
          {unread > 0 ? <span className="raye2-shell-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
        </Link>
        {member ? (
          <>
            <Link className="raye2-shell-member" href={"/u/" + member.handle}>@{member.handle}</Link>
            {onSignOut ? <button type="button" className="raye2-shell-iconbtn raye2-shell-signout" onClick={onSignOut} aria-label={t.signOut} title={t.signOut}><ShellIcon name="logout" size={21} /></button> : null}
          </>
        ) : (
          <Link className="raye2-shell-join" href="/community#join">{t.join}</Link>
        )}
      </div>
    </header>
  );
}
