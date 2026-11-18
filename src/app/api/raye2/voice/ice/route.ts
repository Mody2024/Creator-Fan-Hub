import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PrivateCallMembership = {
  session: {
    id: string;
    session_type: string;
    status: string;
    expires_at: string;
  } | Array<{
    id: string;
    session_type: string;
    status: string;
    expires_at: string;
  }> | null;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Voice service is not configured." }, { status: 503 });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let sessionId = "";
  try {
    const body = await request.json() as { sessionId?: unknown };
    sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.json({ error: "Invalid voice session." }, { status: 400 });
  }

  const { data, error } = await supabase.from("raye2_voice_participants")
    .select("session:raye2_voice_sessions!inner(id,session_type,status,expires_at)")
    .eq("session_id", sessionId)
    .eq("user_id", auth.user.id)
    .eq("status", "joined")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Joined call membership required." }, { status: 403 });

  const membership = data as unknown as PrivateCallMembership;
  const session = Array.isArray(membership.session) ? membership.session[0] : membership.session;
  if (!session || session.session_type !== "private_call" || session.status !== "active"
    || new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Private call is no longer active." }, { status: 403 });
  }

  const urls = (process.env.RAYE2_TURN_URLS ?? "").split(",")
    .map(value => value.trim())
    .filter(value => /^turns?:/i.test(value));
  const sharedSecret = process.env.RAYE2_TURN_SHARED_SECRET;
  if (urls.length > 0 && !sharedSecret) {
    return NextResponse.json({ error: "TURN relay credentials are not configured." }, { status: 503 });
  }

  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (urls.length > 0 && sharedSecret) {
    const expiry = Math.floor(Date.now() / 1000) + 600;
    const username = expiry + ":" + auth.user.id;
    const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  }
  return NextResponse.json({ iceServers, turnConfigured: urls.length > 0, expiresIn: 600 });
}
