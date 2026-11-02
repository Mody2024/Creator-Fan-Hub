-- Explicitly expose only aggregate public reaction counters; never grant access to reaction rows.
revoke all on function public.get_community_reaction_counts(uuid[]) from public;
grant execute on function public.get_community_reaction_counts(uuid[]) to anon,authenticated;
revoke all on function public.get_community_short_reaction_counts(uuid[]) from public;
grant execute on function public.get_community_short_reaction_counts(uuid[]) to anon,authenticated;
revoke all on function public.get_video_reaction_counts(uuid[]) from public;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon,authenticated;
