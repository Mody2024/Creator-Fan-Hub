alter table public.video_reactions drop constraint if exists video_reactions_reaction_check;
update public.video_reactions set reaction=case reaction when 'like' then 'spark' when 'love' then 'support' when 'insightful' then 'mindblown' else reaction end;
alter table public.video_reactions add constraint video_reactions_reaction_check check(reaction in ('spark','orbit','legend','laugh','mindblown','support'));
