-- Align media RPC access with NHEN Studio role capabilities.
do $$
declare r record; v_def text;
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_creator_media' loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'not exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)','not public.can_view_creator_workspace()');
  execute v_def;
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_creator_media' loop
  v_def:=pg_get_functiondef(r.oid);
  v_def:=replace(v_def,'not exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)','not public.can_edit_creator_content()');
  execute v_def;
 end loop;
end $$;
