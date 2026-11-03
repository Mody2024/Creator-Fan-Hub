"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "../raye2.module.css";

export default function Raye2InvitePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your invitation…");
  const [ready, setReady] = useState(false);
  const [continueUrl, setContinueUrl] = useState("/community#join");

  useEffect(() => {
    let alive = true;
    const token = new URLSearchParams(window.location.search).get("token");
    const supabase = getSupabaseBrowserClient();
    if (!token || token.length < 32 || token.length > 256) {
      setMessage("This invitation link is invalid.");
      setReady(true);
      return;
    }
    const signInUrl = "/community?raye2_invite=" + encodeURIComponent(token) + "#join";
    setContinueUrl(signInUrl);
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.user) {
        setMessage("Sign in or create your free community account to accept this private group invitation. Your invite will be kept while you sign in.");
        setReady(true);
        return;
      }
      const { error: joinError } = await supabase.rpc("raye2_join_group_invite", { p_token: token });
      if (!alive) return;
      if (joinError) {
        setMessage("This invitation has expired, been revoked, or reached its usage limit.");
        setReady(true);
        return;
      }
      setMessage("Invitation accepted. Opening your Raye2 spaces…");
      router.replace("/raye2");
    });
    return () => { alive = false; };
  }, [router]);

  return <main className={styles.authGate}>
    <Link href="/" className={styles.brand}>RAYE<span>2</span></Link>
    <h1>Private group invitation</h1>
    <p role="status">{message}</p>
    {ready && <Link className={styles.primaryButton} href={continueUrl}>Sign in / create account</Link>}
    <Link className={styles.backLink} href="/raye2">Open Raye2</Link>
  </main>;
}
