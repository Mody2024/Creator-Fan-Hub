-- Strengthen server-side config validation to match the application schema.
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
  v_key text;
  v_item jsonb;
  v_allowed_sections text[] := array['hero','ideas','poll','latest','events','community','videos','socials'];
  v_allowed_features text[] := array['polls','ideas','events','guidedTour','mascot','voice','miniGames','store'];
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_config) <> 'object'
     or p_config->>'schemaVersion' is distinct from '1'
     or jsonb_typeof(p_config->'identity') <> 'object'
     or jsonb_typeof(p_config->'appearance') <> 'object'
     or jsonb_typeof(p_config->'layout') <> 'object'
     or jsonb_typeof(p_config->'hero') <> 'object'
     or jsonb_typeof(p_config->'socialLinkIds') <> 'array'
     or jsonb_typeof(p_config->'featureFlags') <> 'object'
     or jsonb_typeof(p_config->'maintenance') <> 'object' then
    raise exception 'invalid site configuration shape' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_config#>>'{identity,siteName}',''))) not between 1 and 100
     or length(coalesce(p_config#>>'{identity,tagline}','')) > 240
     or length(btrim(coalesce(p_config#>>'{hero,title}',''))) not between 1 and 180
     or length(coalesce(p_config#>>'{hero,body}','')) > 1000
     or length(coalesce(p_config#>>'{maintenance,message}','')) > 240 then
    raise exception 'site configuration text length invalid' using errcode = '22023';
  end if;

  if coalesce(p_config#>>'{appearance,theme}','') not in ('obsidian','paper','violet','custom')
     or coalesce(p_config#>>'{appearance,colorMode}','') not in ('dark','light','system')
     or coalesce(p_config#>>'{appearance,motion}','') not in ('full','reduced','off')
     or coalesce(p_config#>>'{appearance,accent}','') !~ '^#[0-9a-fA-F]{6}$'
     or coalesce(p_config#>>'{maintenance,enabled}','') not in ('true','false')
     or coalesce(p_config#>>'{hero,overlay}','') !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
     or coalesce(p_config#>>'{hero,muted}','') not in ('true','false')
     or coalesce(p_config#>>'{hero,loop}','') not in ('true','false') then
    raise exception 'unsupported theme, color, motion, or media settings' using errcode = '22023';
  end if;

  if jsonb_typeof(p_config#>'{layout,sectionOrder}') <> 'array'
     or jsonb_typeof(p_config#>'{layout,visibleSections}') <> 'array' then
    raise exception 'invalid layout arrays' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_config#>'{layout,sectionOrder}') loop
    if jsonb_typeof(v_item) <> 'string' or not ((v_item #>> '{}') = any(v_allowed_sections)) then
      raise exception 'unsupported section order item' using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_config#>'{layout,visibleSections}') loop
    if jsonb_typeof(v_item) <> 'string'
       or not ((v_item #>> '{}') = any(v_allowed_sections))
       or not ((p_config#>'{layout,sectionOrder}') @> jsonb_build_array(v_item #>> '{}')) then
      raise exception 'unsupported or unordered visible section' using errcode = '22023';
    end if;
  end loop;

  for v_key, v_item in select key, value from jsonb_each(p_config->'featureFlags') loop
    if not (v_key = any(v_allowed_features)) or jsonb_typeof(v_item) <> 'boolean' then
      raise exception 'unsupported feature flag' using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array v_allowed_features loop
    if jsonb_typeof(p_config->'featureFlags'->v_key) <> 'boolean' then
      raise exception 'missing feature flag: %', v_key using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_config->'socialLinkIds') a
    where jsonb_typeof(a) <> 'string' or length(btrim(a #>> '{}')) not between 1 and 100
  ) or (
    select count(*) from jsonb_array_elements_text(p_config->'socialLinkIds')
  ) <> (
    select count(distinct value) from jsonb_array_elements_text(p_config->'socialLinkIds') as s(value)
  ) then
    raise exception 'invalid or duplicate social link IDs' using errcode = '22023';
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

-- Upgrade the seed to the same canonical schema used by the editor and validator.
update public.site_config_drafts
set draft = jsonb_build_object(
  'schemaVersion', 1,
  'identity', jsonb_build_object(
    'siteName', coalesce(draft#>>'{identity,siteName}', 'THE INNER CIRCLE'),
    'tagline', coalesce(draft#>>'{identity,tagline}', 'A community built around what comes next.'),
    'logoMediaId', null,
    'mascotMediaId', null
  ),
  'appearance', jsonb_build_object(
    'theme', coalesce(draft#>>'{appearance,theme}', 'obsidian'),
    'accent', '#d8ff75',
    'colorMode', 'dark',
    'motion', 'full'
  ),
  'layout', jsonb_build_object(
    'sectionOrder', jsonb_build_array('hero','ideas','poll','latest','events','community','videos','socials'),
    'visibleSections', jsonb_build_array('hero','ideas','poll','community')
  ),
  'hero', jsonb_build_object(
    'title', coalesce(draft#>>'{hero,title}', 'Your next favorite video starts here.'),
    'body', coalesce(draft#>>'{hero,body}', 'Vote on ideas, share what you want to see, and help shape the next upload.'),
    'mediaId', null, 'overlay', 0.35, 'muted', true, 'loop', true
  ),
  'socialLinkIds', '[]'::jsonb,
  'featureFlags', jsonb_build_object('polls',true,'ideas',true,'events',true,'guidedTour',true,'mascot',true,'voice',false,'miniGames',false,'store',false),
  'maintenance', jsonb_build_object(
    'enabled', coalesce((draft#>>'{maintenance,enabled}')::boolean, false),
    'message', coalesce(draft#>>'{maintenance,message}', 'We will be back soon.')
  )
),
draft_revision = draft_revision + 1,
updated_at = now()
where config_key = 'primary';

update public.published_site_config p
set published = d.draft,
    published_version = p.published_version + 1,
    maintenance_mode = coalesce((d.draft#>>'{maintenance,enabled}')::boolean, false),
    published_at = now()
from public.site_config_drafts d
where p.config_key = 'primary' and d.config_key = 'primary';
