-- Query patterns:
-- - trackWordVisit upserts by (word, visitor_hash, visited_date).
-- - trackWordVisit then counts rows for one word.
-- - top_word_visits groups all rows by word and orders by the aggregate count.
--
-- The existing unique constraint on (word, visitor_hash, visited_date) remains
-- the conflict target for daily de-duplication. These additional indexes support
-- common word/date and visitor/date slices without changing write semantics.
create index if not exists word_visits_word_visited_date_idx
  on public.word_visits (word, visited_date);

create index if not exists word_visits_visitor_hash_visited_date_idx
  on public.word_visits (visitor_hash, visited_date);

comment on table public.word_visits is
  'Stores one anonymous visit per normalized word, hashed visitor, and visited date.';

comment on column public.word_visits.word is
  'Normalized lowercase search word used for per-word counts and top-word aggregation.';

comment on column public.word_visits.visitor_hash is
  'SHA-256 hash of the client visitor identifier and server salt; raw visitor identifiers must not be stored.';

comment on column public.word_visits.visited_date is
  'UTC date bucket used to count one visit per visitor per word per day.';

comment on view public.top_word_visits is
  'Live aggregate view for top visited words. Keep as a regular view until production volume requires cached refreshes.';

comment on index public.word_visits_word_visited_date_idx is
  'Supports per-word visit counts plus date-bounded word analytics.';

comment on index public.word_visits_visitor_hash_visited_date_idx is
  'Supports visitor/date analysis without exposing raw visitor identifiers.';

-- RLS decision:
-- The Express API is the access boundary for visit tracking. Supabase is called
-- from the backend with the service role key, so anon/authenticated roles should
-- not receive direct table or view access and no public RLS policies are added.
alter table public.word_visits enable row level security;

revoke all on table public.word_visits from anon, authenticated;
revoke all on table public.top_word_visits from anon, authenticated;

grant select, insert, update, delete on table public.word_visits to service_role;
grant select on table public.top_word_visits to service_role;

alter view public.top_word_visits set (security_invoker = true);
