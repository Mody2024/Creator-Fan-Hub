-- Raye2 Wave 3/8: a single maintenance entry point for time-based expiry.
--
-- Mini's and Moments expire by timestamp, but nothing ran raye2_expire_minis / raye2_expire_moments, so
-- expired clips would linger as "published". raye2_run_maintenance consolidates the expiry jobs behind one
-- call so a page visit or a scheduled job can drive them. Every job is best-effort: one failure does not
-- stop the others, and the function never raises, so it is safe to call from a read path.

create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := 0; v_moments integer := 0;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';
