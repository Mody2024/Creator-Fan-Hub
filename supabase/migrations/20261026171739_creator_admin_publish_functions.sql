-- Secure Creator Fan Hub admin allowlist and transactional draft/publish operations.
-- Public clients cannot self-enroll as admins; the first creator row must be inserted
-- by the project owner after creating the chosen Supabase Auth user.

create table if not exists public.creator_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.creator_admins enable row level security;
revoke all on public.creator_admins from anon, authenticated;
drop policy if exists "Creator can read own active access" on public.creator_admins;
create policy "Creator can read own active access"
  on public.creator_admins for select to authenticated
  using (user_id = (select auth.uid()) and active = true);
grant select on public.creator_admins to authenticated;

create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_id);
create index if not exists events_media_idx on public.events(media_id);
create index if not exists ideas_reviewed_by_idx on public.ideas(reviewed_by);
create index if not exists poll_votes_poll_option_idx on public.poll_votes(poll_id, option_id);
create index if not exists polls_created_by_idx on public.polls(created_by);
create index if not exists published_versions_published_by_idx on public.published_site_config_versions(published_by);
create index if not exists site_config_drafts_updated_by_idx on public.site_config_drafts(updated_by);

create or replace function public.is_active_creator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.creator_admins a
    where a.user_id = (select auth.uid()) and a.active = true
  );
$$;
revoke all on function public.is_active_creator() from public, anon;
grant execute on function public.is_active_creator() to authenticated;

create or replace function public.save_site_config_draft(
  p_config jsonb,
  p_expected_revision integer
)
returns table (new_revision integer, saved_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision integer;
  v_saved_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_config) <> 'object'
     or p_config->>'schemaVersion' <> '1'
     or jsonb_typeof(p_config->'identity') <> 'object'
     or jsonb_typeof(p_config->'appearance') <> 'object'
     or jsonb_typeof(p_config->'hero') <> 'object'
     or jsonb_typeof(p_config->'maintenance') <> 'object' then
    raise exception 'invalid site configuration' using errcode = '22023';
  end if;
  if length(coalesce(p_config#>>'{identity,siteName}','')) not between 1 and 100
     or length(coalesce(p_config#>>'{hero,title}','')) not between 1 and 180
     or length(coalesce(p_config#>>'{hero,body}','')) > 1000
     or length(coalesce(p_config#>>'{maintenance,message}','')) > 240 then
    raise exception 'site configuration text length invalid' using errcode = '22023';
  end if;
  if p_config#>>'{appearance,theme}' not in ('obsidian','paper','violet','custom')
     or p_config#>>'{maintenance,enabled}' not in ('true','false') then
    raise exception 'unsupported theme or maintenance value' using errcode = '22023';
  end if;

  update public.site_config_drafts d
    set draft = p_config,
        draft_revision = d.draft_revision + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where d.config_key = 'primary'
      and d.draft_revision = p_expected_revision
    returning d.draft_revision, d.updated_at into v_revision, v_saved_at;

  if v_revision is null then
    raise exception 'draft revision conflict; reload before saving' using errcode = '40001';
  end if;
  return query select v_revision, v_saved_at;
end;
$$;
revoke all on function public.save_site_config_draft(jsonb, integer) from public, anon;
grant execute on function public.save_site_config_draft(jsonb, integer) to authenticated;

create or replace function public.publish_site_config(p_expected_revision integer)
returns table (published_version integer, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.site_config_drafts%rowtype;
  v_version integer;
  v_published_at timestamptz;
  v_maintenance boolean;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;

  select * into v_draft
    from public.site_config_drafts
    where config_key = 'primary'
    for update;

  if not found or v_draft.draft_revision <> p_expected_revision then
    raise exception 'draft revision conflict; reload before publishing' using errcode = '40001';
  end if;

  v_maintenance := coalesce((v_draft.draft#>>'{maintenance,enabled}')::boolean, false);
  insert into public.published_site_config_versions
    (config_key, version, published, maintenance_mode, published_by)
  select 'primary', coalesce((select p.published_version + 1
      from public.published_site_config p where p.config_key = 'primary'), 1),
      v_draft.draft, v_maintenance, auth.uid()
  returning version, published_at into v_version, v_published_at;

  insert into public.published_site_config
    (config_key, published, published_version, maintenance_mode, published_at)
  values ('primary', v_draft.draft, v_version, v_maintenance, v_published_at)
  on conflict (config_key) do update set
    published = excluded.published,
    published_version = excluded.published_version,
    maintenance_mode = excluded.maintenance_mode,
    published_at = excluded.published_at;

  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values (auth.uid(), 'publish', 'site_config', 'primary',
          jsonb_build_object('version', v_version, 'draftRevision', v_draft.draft_revision));

  return query select v_version, v_published_at;
end;
$$;
revoke all on function public.publish_site_config(integer) from public, anon;
grant execute on function public.publish_site_config(integer) to authenticated;
