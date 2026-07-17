create table if not exists public.word_visits (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  visitor_hash text not null,
  visited_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (word, visitor_hash, visited_date)
);

create index if not exists word_visits_word_idx on public.word_visits (word);
