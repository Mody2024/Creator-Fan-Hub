import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function returnToLogin(requestUrl: URL, reason: string) {
  const target = new URL("/creator/login", requestUrl.origin);
  target.searchParams.set("auth", reason);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const nextPath =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/creator";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/creator/login?setup=required", requestUrl.origin));
  }
  if (!code) return returnToLogin(requestUrl, "google_failed");

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return returnToLogin(requestUrl, "google_failed");

  const { data, error: userError } = await supabase.auth.getUser();
  const user = data.user;
  if (userError || !user) {
    await supabase.auth.signOut();
    return returnToLogin(requestUrl, "google_failed");
  }

  const isGoogleIdentity =
    user.app_metadata?.provider === "google" ||
    (user.identities ?? []).some((identity) => identity.provider === "google");
  if (!isGoogleIdentity) {
    await supabase.auth.signOut();
    return returnToLogin(requestUrl, "google_failed");
  }

  // Supabase only marks email_confirmed_at after a trusted provider/email verification.
  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    return returnToLogin(requestUrl, "google_not_verified");
  }

  // The destination still performs its own server-side creator/admin allowlist check.
  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
