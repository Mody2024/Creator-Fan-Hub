-- Internal authorization helper: exposed RPC callers use the guarded operations,
-- not this helper directly. Definer-owned functions can still call it.
revoke all on function public.is_active_creator() from public, anon, authenticated;
grant execute on function public.is_active_creator() to postgres, service_role;
