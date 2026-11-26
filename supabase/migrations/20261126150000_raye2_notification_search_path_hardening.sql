-- Remove mutable role search_path resolution from the two notification helpers
-- identified by the live Supabase Security Advisor. Both are invoker functions.
alter function public.raye2_in_quiet_hours(
  time without time zone,
  time without time zone,
  timestamp with time zone,
  text
) set search_path = '';

alter function public.raye2_notification_category(text)
  set search_path = '';
