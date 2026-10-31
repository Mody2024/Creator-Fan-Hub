-- Fail closed for public idea submissions while preserving optional display names.
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
  if length(v_name) > 32
     or length(v_title) not between 4 and 100
     or length(v_body) not between 10 and 800
     or p_submission_token is null
     or length(p_submission_token) < 32
     or length(p_submission_token) > 160
     or p_submission_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Please check your idea title, description, and browser token.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.published_site_config c
    where c.config_key = 'primary'
      and not coalesce(c.maintenance_mode, false)
      and coalesce((c.published #>> '{featureFlags,ideas}')::boolean, true)
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
