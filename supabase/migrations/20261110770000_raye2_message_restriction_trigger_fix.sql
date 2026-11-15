-- Raye2 Wave 6 critical fix: the message restriction trigger referenced a column that does not exist.
--
-- raye2_enforce_restrictions is a BEFORE INSERT trigger shared by community_posts, community_comments and
-- raye2_messages. It read new.author_id for all three, but raye2_messages names its author column
-- sender_id, so every message insert failed with "record \"new\" has no field \"author_id\"" (42703). That
-- broke all direct and group messaging. Recreated with per-table actor resolution, and it now also guards
-- community Shorts comments (a comment-restricted member could previously still comment on Shorts).

create or replace function public.raye2_enforce_restrictions()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_feature text; v_actor uuid;
begin
  v_feature := case tg_table_name
    when 'community_posts' then 'post'
    when 'community_comments' then 'comment'
    when 'community_short_comments' then 'comment'
    when 'raye2_messages' then 'message'
    else null end;
  if v_feature is null then return new; end if;
  if tg_table_name = 'raye2_messages' then
    v_actor := new.sender_id;
  else
    v_actor := new.author_id;
  end if;
  if public.raye2_has_active_restriction(v_actor, v_feature) then
    raise exception 'your account is restricted from this action' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_restrictions() from public, anon, authenticated;

-- The posts/comments/messages triggers already exist and now resolve the actor correctly.
drop trigger if exists raye2_short_comments_restriction_guard on public.community_short_comments;
create trigger raye2_short_comments_restriction_guard before insert on public.community_short_comments
for each row execute function public.raye2_enforce_restrictions();

notify pgrst, 'reload schema';
