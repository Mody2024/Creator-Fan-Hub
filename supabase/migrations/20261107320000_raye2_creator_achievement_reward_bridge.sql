-- Automatically convert configured achievement milestones into creator recognition points.
insert into public.raye2_creator_reward_rules(code,title,description,points,enabled)
values
 ('first_post','First published post','Publish your first approved community post.',50,true),
 ('five_posts','Conversation starter','Reach five published community posts.',150,true),
 ('first_follow','First connection','Make your first community connection.',10,true),
 ('five_follows','Community explorer','Follow five community members.',25,true),
 ('first_video_comment','Watch contributor','Publish your first approved video comment.',30,true)
on conflict(code) do nothing;

create or replace function public.raye2_award_creator_points_for_achievement()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_points integer;
begin
 if not exists(select 1 from public.creator_admins ca
   where ca.user_id=new.user_id and ca.active=true and ca.role in ('creator','editor')) then
  return new;
 end if;
 select points into v_points from public.raye2_creator_reward_rules
  where code=new.achievement_code and enabled=true;
 if v_points is null then return new; end if;
 insert into public.raye2_creator_reward_ledger(
  creator_id,reward_code,points,status,source_ref,note
 ) values(
  new.user_id,new.achievement_code,v_points,'awarded',
  'achievement:'||new.achievement_code,
  'Automatically awarded for verified achievement: '||new.achievement_code
 ) on conflict(creator_id,reward_code,source_ref) do nothing;
 return new;
end;
$$;
revoke all on function public.raye2_award_creator_points_for_achievement() from public,anon,authenticated;
drop trigger if exists raye2_creator_achievement_reward_bridge on public.member_achievements;
create trigger raye2_creator_achievement_reward_bridge
 after insert on public.member_achievements
 for each row execute function public.raye2_award_creator_points_for_achievement();
