-- Creator-role helper RPCs are only meaningful for authenticated sessions.
-- Keep authenticated access for existing RLS checks and creator workspace flows.
revoke execute on function public.can_edit_creator_content() from anon;
revoke execute on function public.can_view_creator_analytics() from anon;
revoke execute on function public.can_view_creator_workspace() from anon;
revoke execute on function public.has_creator_role(text[]) from anon;
revoke execute on function public.is_active_creator() from anon;
