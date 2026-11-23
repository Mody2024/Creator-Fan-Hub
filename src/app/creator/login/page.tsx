"use client";

import AuthBrand from "@/app/raye2-shell/auth-brand";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function CreatorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("access") === "restricted") {
      setMessage("This account is signed in but is not authorized for the Creator Panel. Ask the owner to enable your account.");
    } else if (params.get("setup") === "required") {
      setMessage("Creator sign-in is not configured. The site owner must finish the Supabase connection first.");
    } else if (params.get("auth") === "google_not_verified") {
      setMessage("Google did not return a verified email for this account. Verify the Google account and try again.");
    } else if (params.get("auth") === "google_failed") {
      setMessage("Google sign-in could not be completed. Check the provider setup and try again.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Creator sign-in is not configured yet. A dedicated Supabase project and environment settings are required.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage("Sign-in failed. Check your details or ask the site owner to configure access.");
        return;
      }
      router.replace("/creator");
      router.refresh();
    } catch {
      setMessage("The sign-in service could not be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Creator sign-in is not configured yet. A dedicated Supabase project and environment settings are required.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = new URL("/auth/callback?next=%2Fcreator", window.location.origin).toString();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" }
        }
      });
      if (error) {
        setMessage("Google sign-in is not ready. The owner must enable Google in Supabase Auth and configure its OAuth credentials.");
        setBusy(false);
      }
    } catch {
      setMessage("Google sign-in could not be started. Check your connection and try again.");
      setBusy(false);
    }
  }

  return <main className="admin-shell raye2-creator-login raye2-auth-screen">
    <Link className="admin-back" href="/raye2/home">← Back to Raye2</Link>
    <section className="admin-card"><AuthBrand href="/raye2/home" />
      <span className="eyebrow">PRIVATE WORKSPACE / 01</span>
      <h1>Creator <em>access.</em></h1>
      <p>Sign in to manage the community experience. Access is restricted to the configured creator account.</p>
      <button className="button" type="button" onClick={signInWithGoogle} disabled={busy} style={{width:"100%",justifyContent:"center",marginBottom:18,border:"1px solid var(--line)",background:"transparent",color:"var(--ink)"}}>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      <div aria-hidden="true" style={{display:"flex",alignItems:"center",gap:12,color:"var(--muted)",fontSize:11,margin:"0 0 16px"}}>
        <span style={{height:1,background:"var(--line)",flex:1}} /> OR USE EMAIL <span style={{height:1,background:"var(--line)",flex:1}} />
      </div>
      <form onSubmit={submit} className="admin-form">
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"} <span>↗</span></button>
        <p className="form-status" role="status" aria-live="polite">{message}</p>
      </form>
      <span className="admin-note">No public registration. Creator access must be provisioned by the owner.</span>
    </section>
  </main>;
}
