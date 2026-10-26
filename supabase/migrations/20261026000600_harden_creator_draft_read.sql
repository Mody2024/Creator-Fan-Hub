-- Keep the draft read path reproducible in migrations.
create or replace function public.get_site_config_draft()
returns table (draft jsonb, draft_revision integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  return query
    select d.draft, d.draft_revision, d.updated_at
    from public.site_config_drafts d
    where d.config_key = 'primary';
end;
$$;
revoke all on function public.get_site_config_draft() from public, anon;
grant execute on function public.get_site_config_draft() to authenticated;

-- This helper is only for use by guarded SECURITY DEFINER operations.
revoke execute on function public.is_active_creator() from public, anon, authenticated;
