-- Allow creators to mark their own notification inbox as read in one scoped operation.
create or replace function public.raye2_mark_all_creator_notifications_read()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_updated integer;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'assigned creator access required' using errcode='42501';
 end if;
 update public.raye2_creator_notifications
 set read_at=now()
 where creator_id=(select auth.uid()) and read_at is null;
 get diagnostics v_updated=row_count;
 return v_updated;
end;
$$;
revoke all on function public.raye2_mark_all_creator_notifications_read() from public,anon;
grant execute on function public.raye2_mark_all_creator_notifications_read() to authenticated;
