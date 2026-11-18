create or replace function public.raye2_creator_progression_summary()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid:=(select auth.uid());v_points bigint:=0;v_level integer:=1;
 v_floor bigint:=0;v_next bigint:=100;v_name text:='Starter';v_next_name text:='Active';
begin
 if v_user is null or not exists(select 1 from public.creator_admins ca where ca.user_id=v_user and ca.active=true and ca.role in ('owner','admin','creator','editor','analyst')) then
  raise exception 'creator workspace access required' using errcode='42501';
 end if;
 select coalesce(sum(case when status='awarded' then points else -points end),0)::bigint into v_points from public.raye2_creator_reward_ledger where creator_id=v_user;
 v_points:=greatest(v_points,0);
 if v_points>=6000 then v_level:=7;v_floor:=6000;v_next:=6000;v_name:='Legend';v_next_name:='Legend';
 elsif v_points>=3000 then v_level:=6;v_floor:=3000;v_next:=6000;v_name:='Icon';v_next_name:='Legend';
 elsif v_points>=1500 then v_level:=5;v_floor:=1500;v_next:=3000;v_name:='Star';v_next_name:='Icon';
 elsif v_points>=700 then v_level:=4;v_floor:=700;v_next:=1500;v_name:='Pro';v_next_name:='Star';
 elsif v_points>=300 then v_level:=3;v_floor:=300;v_next:=700;v_name:='Rising';v_next_name:='Pro';
 elsif v_points>=100 then v_level:=2;v_floor:=100;v_next:=300;v_name:='Active';v_next_name:='Rising';
 end if;
 return jsonb_build_object('points',v_points,'level',v_level,'level_name',v_name,'next_level_name',v_next_name,'level_floor',v_floor,'next_level_points',v_next,'points_to_next',greatest(v_next-v_points,0),'progress_percent',case when v_next=v_floor then 100 else least(100,greatest(0,round(((v_points-v_floor)::numeric/(v_next-v_floor)::numeric)*100))) end);
end;
$$;
revoke all on function public.raye2_creator_progression_summary() from public,anon;
grant execute on function public.raye2_creator_progression_summary() to authenticated;
