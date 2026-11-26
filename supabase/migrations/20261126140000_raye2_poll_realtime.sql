-- Publish conversation poll rows so members see votes and closure state without refreshing.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raye2_message_poll_votes') then
      execute 'alter publication supabase_realtime add table public.raye2_message_poll_votes';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raye2_message_polls') then
      execute 'alter publication supabase_realtime add table public.raye2_message_polls';
    end if;
  end if;
end;
$$;
