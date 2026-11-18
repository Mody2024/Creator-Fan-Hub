-- Seed a safe default public experience and editable initial draft.
-- This does not create an administrator or enable any public write permissions.
insert into public.site_config_drafts (config_key, draft, draft_revision)
values (
  'primary',
  jsonb_build_object(
    'schemaVersion', 1,
    'identity', jsonb_build_object(
      'siteName', 'THE INNER CIRCLE',
      'tagline', 'A community built around what comes next.'
    ),
    'hero', jsonb_build_object(
      'title', 'Your next favorite video starts here.',
      'body', 'Vote on ideas, share what you want to see, and help shape the next upload.'
    ),
    'appearance', jsonb_build_object('theme', 'obsidian'),
    'maintenance', jsonb_build_object('enabled', false, 'message', 'We will be back soon.'),
    'sections', jsonb_build_array('ideas', 'vote', 'community'),
    'features', jsonb_build_object('ideas', true, 'polls', true, 'events', true, 'store', false)
  ),
  1
)
on conflict (config_key) do nothing;

insert into public.published_site_config (config_key, published, published_version, maintenance_mode)
values (
  'primary',
  jsonb_build_object(
    'schemaVersion', 1,
    'identity', jsonb_build_object(
      'siteName', 'THE INNER CIRCLE',
      'tagline', 'A community built around what comes next.'
    ),
    'hero', jsonb_build_object(
      'title', 'Your next favorite video starts here.',
      'body', 'Vote on ideas, share what you want to see, and help shape the next upload.'
    ),
    'appearance', jsonb_build_object('theme', 'obsidian'),
    'maintenance', jsonb_build_object('enabled', false, 'message', 'We will be back soon.'),
    'sections', jsonb_build_array('ideas', 'vote', 'community'),
    'features', jsonb_build_object('ideas', true, 'polls', true, 'events', true, 'store', false)
  ),
  1,
  false
)
on conflict (config_key) do nothing;
