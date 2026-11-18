-- Secure, bounded publishing history and safe restore-to-draft workflow.
-- Historical snapshots are never exposed directly through table grants.
create or replace function public.get_creator_publish_history(p_limit integer default 20)
returns table (
  version integer,
  published_at timestamptz,
  published_by uuid,
  maintenance_mode boolean,
  site_name text,
  hero_title text
)
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
    select v.version, v.published_at, v.published_by, v.maintenance_mode,
      left(coalesce(v.published#>>'{identity,siteName}', 'Untitled site'), 100),
      left(coalesce(v.published#>>'{hero,title}', 'Untitled hero'), 180)
    from public.published_site_config_versions v
    where v.config_key = 'primary'
    order by v.version desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.get_creator_publish_history(integer) from public, anon;
grant execute on function public.get_creator_publish_history(integer) to authenticated;

create or replace function public.restore_site_config_version(p_version integer)
returns table (new_revision integer, restored_version integer, saved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_revision integer;
  v_saved_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'invalid version' using errcode = '22023';
  end if;

  select v.published into v_snapshot
    from public.published_site_config_versions v
    where v.config_key = 'primary' and v.version = p_version;

  if v_snapshot is null then
    raise exception 'published version not found' using errcode = 'P0002';
  end if;

  update public.site_config_drafts d
    set draft = v_snapshot,
        draft_revision = d.draft_revision + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where d.config_key = 'primary'
    returning d.draft_revision, d.updated_at into v_revision, v_saved_at;

  if v_revision is null then
    raise exception 'site draft not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values (auth.uid(), 'restore_to_draft', 'site_config', 'primary',
          jsonb_build_object('sourceVersion', p_version, 'newDraftRevision', v_revision));

  return query select v_revision, p_version, v_saved_at;
end;
$$;
revoke all on function public.restore_site_config_version(integer) from public, anon;
grant execute on function public.restore_site_config_version(integer) to authenticated;
