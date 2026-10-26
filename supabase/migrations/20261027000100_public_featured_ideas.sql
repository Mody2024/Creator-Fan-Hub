-- Public idea feed includes creator-featured ideas and honors the same public visibility gates as submissions.
create or replace function public.get_public_approved_ideas()
returns table (idea_id uuid, display_name text, idea_title text, idea_body text, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.display_name, i.title, i.body, i.submitted_at
  from public.ideas i
  where i.status in ('approved', 'featured')
    and not exists (
      select 1
      from public.published_site_config c
      where c.config_key = 'primary'
        and (
          coalesce(c.maintenance_mode, false)
          or coalesce((c.published #>> '{featureFlags,ideas}')::boolean, true) = false
        )
    )
  order by case when i.status = 'featured' then 0 else 1 end, i.submitted_at desc
  limit 30;
$$;
revoke all on function public.get_public_approved_ideas() from public;
grant execute on function public.get_public_approved_ideas() to anon, authenticated;
