-- Member-block checks are only meaningful for authenticated viewers.
-- Do not expose this helper to anonymous requests.
revoke all on function public.is_member_blocked(uuid) from public, anon;
grant execute on function public.is_member_blocked(uuid) to authenticated;
notify pgrst, 'reload schema';
