-- Enforce platform sponsor campaign ownership and lifecycle transitions at the database boundary.
create or replace function public.raye2_guard_platform_sponsor_campaign_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'Raye2 platform admin access required' using errcode='42501';
  end if;

  if tg_op='INSERT' then
    if new.created_by is distinct from (select auth.uid()) or new.status is distinct from 'draft' then
      raise exception 'platform sponsor campaigns must begin as owner-bound drafts' using errcode='42501';
    end if;
    return new;
  end if;

  if tg_op='DELETE' then
    if old.created_by is distinct from (select auth.uid()) or old.status is distinct from 'draft' then
      raise exception 'only your unused platform sponsor drafts can be deleted' using errcode='42501';
    end if;
    return old;
  end if;

  if old.created_by is distinct from (select auth.uid())
     or new.created_by is distinct from old.created_by then
    raise exception 'platform campaign ownership is immutable' using errcode='42501';
  end if;

  if old.status='draft' and new.status='draft' then
    -- Draft configuration may be edited by its creating admin.
    null;
  elsif old.status='draft' and new.status='active' then
    -- Admin activation changes configuration state only; delivery is separately gated.
    null;
  elsif old.status='active' and new.status in ('paused','completed') then
    if (to_jsonb(new)-'status'-'updated_at') is distinct from
       (to_jsonb(old)-'status'-'updated_at') then
      raise exception 'active platform campaign configuration is immutable' using errcode='42501';
    end if;
  elsif old.status='paused' and new.status in ('active','completed') then
    if (to_jsonb(new)-'status'-'updated_at') is distinct from
       (to_jsonb(old)-'status'-'updated_at') then
      raise exception 'paused platform campaign configuration is immutable' using errcode='42501';
    end if;
  else
    raise exception 'invalid platform sponsor campaign lifecycle transition' using errcode='23514';
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function public.raye2_guard_platform_sponsor_campaign_lifecycle() from public,anon,authenticated;
drop trigger if exists raye2_guard_platform_sponsor_campaign_lifecycle on public.raye2_platform_sponsor_campaigns;
create trigger raye2_guard_platform_sponsor_campaign_lifecycle
before insert or update or delete on public.raye2_platform_sponsor_campaigns
for each row execute function public.raye2_guard_platform_sponsor_campaign_lifecycle();
