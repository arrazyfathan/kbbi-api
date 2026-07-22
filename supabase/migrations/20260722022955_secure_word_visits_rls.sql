alter table public.word_visits enable row level security;

revoke all on table public.word_visits from anon, authenticated;
revoke all on table public.top_word_visits from anon, authenticated;

grant select, insert, update, delete on table public.word_visits to service_role;
grant select on table public.top_word_visits to service_role;

alter view public.top_word_visits set (security_invoker = true);
