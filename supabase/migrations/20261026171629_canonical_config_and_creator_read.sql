-- Canonical v1 configuration shape used by the validator and creator editor.
-- Replace only the untouched version-1 starter seed; preserve any later creator edits.
do $$
declare
  v_config jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'identity', jsonb_build_object(
      'siteName', 'THE INNER CIRCLE',
      'tagline', 'A community built around what comes next.',
      'logoMediaId', null,
      'mascotMediaId', null
    ),
    'appearance', jsonb_build_object(
      'theme', 'obsidian', 'accent', '#B8FF6C', 'colorMode', 'dark', 'motion', 'full'
    ),
    'layout', jsonb_build_object(
      'sectionOrder', jsonb_build_array('hero','ideas','poll','community'),
      'visibleSections', jsonb_build_array('hero','ideas','poll','community')
    ),
    'hero', jsonb_build_object(
      'title', 'Your next favorite video starts here.',
      'body', 'Vote on ideas, share what you want to see, and help shape the next upload.',
      'mediaId', null, 'overlay', 0.45, 'muted', true, 'loop', true
    ),
    'socialLinkIds', jsonb_build_array(),
    'featureFlags', jsonb_build_object(
      'polls', true, 'ideas', true, 'events', true, 'guidedTour', false,
      'mascot', false, 'voice', false, 'miniGames', false, 'store', false
    ),
    'maintenance', jsonb_build_object('enabled', false, 'message', 'We will be back soon.')
  );
begin
  update public.site_config_drafts
    set draft = v_config, draft_revision = 2, updated_at = now()
    where config_key = 'primary' and draft_revision = 1
      and draft->>'schemaVersion' = '1'
      and not (draft ? 'layout');

  update public.published_site_config
    set published = v_config, published_version = 2,
        maintenance_mode = false, published_at = now()
    where config_key = 'primary' and published_version = 1
      and published->>'schemaVersion' = '1'
      and not (published ? 'layout');

  insert into public.published_site_config_versions
    (config_key, version, published, maintenance_mode)
  select 'primary', 2, v_config, false
  where exists (select 1 from public.published_site_config where config_key='primary' and published_version=2)
    and not exists (select 1 from public.published_site_config_versions where config_key='primary' and version=2);
end $$;

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
