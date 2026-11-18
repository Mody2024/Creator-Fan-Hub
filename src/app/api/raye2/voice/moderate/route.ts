import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Voice service is not configured." }, { status: 503 });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: { sessionId?: unknown; targetUserId?: unknown };
  try { body = await request.json() as { sessionId?: unknown; targetUserId?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(sessionId) || !uuid.test(targetUserId) || targetUserId === auth.user.id) {
    return NextResponse.json({ error: "Invalid moderation target." }, { status: 400 });
  }

  const { data, error } = await supabase.from("raye2_voice_participants")
    .select("session:raye2_voice_sessions!inner(id,session_type,status,expires_at)")
    .eq("session_id", sessionId).eq("user_id", auth.user.id).eq("status", "joined").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Joined room membership required." }, { status: 403 });
  const membership = data as unknown as { session: { id: string; session_type: string; status: string; expires_at: string } | Array<{ id: string; session_type: string; status: string; expires_at: string }> | null };
  const session = Array.isArray(membership.session) ? membership.session[0] : membership.session;
  if (!session || session.session_type !== "group_room" || session.status !== "active"
    || new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Group voice room is no longer active." }, { status: 403 });
  }

  const { data: allowed, error: permissionError } = await supabase.rpc("raye2_can_moderate_voice_session", {
    p_session_id: sessionId,
    p_target_user_id: targetUserId
  });
  if (permissionError || allowed !== true) return NextResponse.json({ error: "Voice moderator permission required." }, { status: 403 });

  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Group voice infrastructure is not configured yet." }, { status: 503 });
  }

  try {
    const apiHost = livekitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    const roomService = new RoomServiceClient(apiHost, apiKey, apiSecret);
    await roomService.removeParticipant("raye2-" + session.id, targetUserId);
    const { error: updateError } = await supabase.rpc("raye2_moderate_voice_session", {
      p_session_id: sessionId,
      p_action: "remove",
      p_target_user_id: targetUserId
    });
    if (updateError) return NextResponse.json({ error: "Participant was disconnected but room state could not be updated." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove the participant from the voice room." }, { status: 502 });
  }
}
