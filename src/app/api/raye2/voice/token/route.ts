import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoiceMembership = {
  role: "host" | "cohost" | "moderator" | "speaker" | "listener";
  status: string;
  session: {
    id: string;
    session_type: string;
    status: string;
    expires_at: string;
    group_id: string | null;
  } | Array<{
    id: string;
    session_type: string;
    status: string;
    expires_at: string;
    group_id: string | null;
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
    .select("role,status,session:raye2_voice_sessions!inner(id,session_type,status,expires_at,group_id)")
    .eq("session_id", sessionId)
    .eq("user_id", auth.user.id)
    .eq("status", "joined")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Joined room membership required." }, { status: 403 });

  const membership = data as unknown as VoiceMembership;
  const session = Array.isArray(membership.session) ? membership.session[0] : membership.session;
  if (!session || session.session_type !== "group_room" || session.status !== "active"
    || !session.group_id || new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Group voice room is no longer active." }, { status: 403 });
  }

  const { data: groupMembership } = await supabase.from("raye2_group_members")
    .select("group_id").eq("group_id", session.group_id).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (!groupMembership) return NextResponse.json({ error: "Active group membership required." }, { status: 403 });

  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Group voice infrastructure is not configured yet." }, { status: 503 });
  }

  try {
    const { data: profile } = await supabase.from("member_profiles")
      .select("display_name,handle").eq("user_id", auth.user.id).maybeSingle();
    const identity = auth.user.id;
    const displayName = profile?.display_name || (profile?.handle ? "@" + profile.handle : "Raye2 member");
    const roomName = "raye2-" + session.id;
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: displayName,
      ttl: "10m"
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: membership.role !== "listener",
      canSubscribe: true,
      canPublishData: true
    });
    return NextResponse.json({ url: livekitUrl, token: await token.toJwt(), roomName, expiresIn: 600 });
  } catch {
    return NextResponse.json({ error: "Could not authorize the voice room." }, { status: 500 });
  }
}
