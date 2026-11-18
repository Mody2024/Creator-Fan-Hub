-- Accountless idea submission with server-side validation and per-browser-token rate limits.
alter table public.ideas
  add column if not exists submission_token_hash text;

create index if not exists ideas_submission_token_submitted_idx
  on public.ideas (submission_token_hash, submitted_at desc)
  where submission_token_hash is not null;

create or replace function public.submit_public_idea(
  p_display_name text,
  p_title text,
  p_body text,
  p_submission_token text
)
returns table (accepted boolean, result_code text, idea_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_hash text;
  v_id uuid;
begin
  if length(v_name) not between 1 and 32
     or length(v_title) not between 4 and 100
     or length(v_body) not between 10 and 800
     or p_submission_token is null
     or length(p_submission_token) < 32
     or length(p_submission_token) > 160
     or p_submission_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Please check your name, idea title, description, and browser token.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.published_site_config c
    where c.config_key = 'primary'
      and (
        coalesce(c.maintenance_mode, false)
        or coalesce((c.published #>> '{featureFlags,ideas}')::boolean, true) = false
      )
  ) then
    return query select false, 'ideas_unavailable'::text, null::uuid;
    return;
  end if;

  v_hash := encode(extensions.digest(convert_to(p_submission_token, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  if exists (
    select 1 from public.ideas i
    where i.submission_token_hash = v_hash
      and i.submitted_at > now() - interval '10 minutes'
  ) then
    return query select false, 'cooldown'::text, null::uuid;
    return;
  end if;

  if (
    select count(*) from public.ideas i
    where i.submission_token_hash = v_hash
      and i.submitted_at > now() - interval '24 hours'
  ) >= 3 then
    return query select false, 'daily_limit'::text, null::uuid;
    return;
  end if;

  insert into public.ideas (display_name, title, body, status, submission_token_hash)
  values (v_name, v_title, v_body, 'pending', v_hash)
  returning id into v_id;

  return query select true, 'submitted_for_review'::text, v_id;
end;
$$;
revoke all on function public.submit_public_idea(text,text,text,text) from public;
grant execute on function public.submit_public_idea(text,text,text,text) to anon, authenticated;

create or replace function public.get_public_approved_ideas()
returns table (idea_id uuid, display_name text, idea_title text, idea_body text, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.display_name, i.title, i.body, i.submitted_at
  from public.ideas i
  where i.status = 'approved'
  order by i.submitted_at desc
  limit 30;
$$;
revoke all on function public.get_public_approved_ideas() from public;
grant execute on function public.get_public_approved_ideas() to anon, authenticated;
