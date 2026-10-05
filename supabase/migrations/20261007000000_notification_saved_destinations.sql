create table if not exists public.notification_saved_destinations (
  value text primary key check (
    char_length(value) between 1 and 300 and value ~ '^(word/[^/]+|proverb/[^/]+)$'
  ),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_saved_destinations enable row level security;
revoke all on public.notification_saved_destinations from anon, authenticated;
grant all on public.notification_saved_destinations to service_role;
