-- Enforce the creator sponsor campaign lifecycle at the database boundary.
-- The UI is not an authorization boundary: authenticated clients must never
-- activate campaigns or erase campaign records after they leave draft state.
create or replace function public.raye2_guard_creator_sponsor_campaign_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Trusted server/service-role operations may perform future system-managed
  -- completion work. Authenticated creator actions are deliberately narrower.
  if auth.uid() is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_op='INSERT' then
    if new.creator_id is distinct from (select auth.uid())
       or new.status is distinct from 'draft' then
      raise exception 'creator campaigns must be created by their owner as drafts'
        using errcode='42501';
    end if;
    return new;
  end if;

  if tg_op='DELETE' then
    if old.creator_id is distinct from (select auth.uid())
       or old.status is distinct from 'draft' then
      raise exception 'only your unused draft campaigns can be deleted'
        using errcode='42501';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' then
    if old.creator_id is distinct from (select auth.uid())
       or new.creator_id is distinct from old.creator_id
       or new.media_id is distinct from old.media_id
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'campaign ownership and video binding are immutable'
        using errcode='42501';
    end if;

    -- Drafts can be edited, but cannot be activated, paused or completed by
    -- creator clients. Activation requires a separately verified delivery gate.
    if old.status='draft' and new.status='draft' then
      return new;
    end if;

    -- The sole creator transition after draft is active -> paused. No campaign
    -- fields may change in the same request, and paused campaigns cannot resume.
    if old.status='active' and new.status='paused'
       and (to_jsonb(new)-'status'-'updated_at')
           is not distinct from (to_jsonb(old)-'status'-'updated_at') then
      return new;
    end if;

    raise exception 'invalid creator campaign lifecycle transition'
      using errcode='42501';
  end if;

  raise exception 'unsupported creator campaign operation';
end;
$$;

revoke all on function public.raye2_guard_creator_sponsor_campaign_lifecycle() from public,anon,authenticated;
drop trigger if exists raye2_guard_creator_sponsor_campaign_lifecycle on public.raye2_creator_sponsor_campaigns;
create trigger raye2_guard_creator_sponsor_campaign_lifecycle
  before insert or update or delete on public.raye2_creator_sponsor_campaigns
  for each row execute function public.raye2_guard_creator_sponsor_campaign_lifecycle();

comment on function public.raye2_guard_creator_sponsor_campaign_lifecycle() is
  'Enforces draft-only creator configuration, active-to-paused safety, immutable ownership/video binding, and preservation of non-draft campaign history.';
