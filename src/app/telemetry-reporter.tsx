"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function report(eventType: string, surface: string, severity: string, message: string, durationMs?: number) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  void supabase.rpc("raye2_record_telemetry", {
    p_event_type: eventType,
    p_surface: surface,
    p_severity: severity,
    p_message: message.slice(0, 500),
    p_duration_ms: durationMs ?? null,
    p_context: { href: typeof window !== "undefined" ? window.location.pathname : "" }
  });
}

export default function TelemetryReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) =>
      report("client_error", "window", "error", event.message || "uncaught error");
    const onRejection = (event: PromiseRejectionEvent) =>
      report("client_error", "promise", "error", String(event.reason?.message ?? event.reason ?? "unhandled rejection"));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
