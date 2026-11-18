-- The block-state helper is intended for authenticated member workflows.
-- Anonymous callers have no member identity and do not need this RPC.
revoke execute on function public.is_member_blocked(uuid) from anon;
-- Video view tracking is only recorded for authenticated viewers.
revoke execute on function public.record_video_view(uuid) from anon;
