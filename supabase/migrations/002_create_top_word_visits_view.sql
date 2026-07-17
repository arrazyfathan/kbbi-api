create or replace view public.top_word_visits as
select
  word,
  count(*)::integer as visitor_count
from public.word_visits
group by word;
