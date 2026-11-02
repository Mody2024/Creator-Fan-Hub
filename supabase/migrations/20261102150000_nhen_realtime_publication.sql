-- Enable the two NHEN tables needed by live member notifications and feed refreshes.
-- Row visibility remains governed by each table's existing RLS policies.
alter publication supabase_realtime add table public.member_notifications, public.community_posts;
