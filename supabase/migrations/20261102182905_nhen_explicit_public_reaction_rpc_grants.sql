-- Public reaction totals are intentionally aggregate-only endpoints.
-- Grant only the bounded aggregate RPCs; individual reaction rows remain private.
grant execute on function public.get_community_reaction_counts(uuid[]) to anon,authenticated;
grant execute on function public.get_community_short_reaction_counts(uuid[]) to anon,authenticated;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon,authenticated;
