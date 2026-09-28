create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_providers (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$'),
  base_url text not null,
  models text[] not null check (array_length(models, 1) between 1 and 50),
  default_model text not null,
  secret_id uuid not null references vault.secrets(id),
  enabled boolean not null default true,
  is_default boolean not null default false,
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit > 0),
  input_price_per_million numeric(12, 6),
  output_price_per_million numeric(12, 6),
  updated_at timestamptz not null default now(),
  check (default_model = any(models))
);
create unique index if not exists ai_providers_one_default on public.ai_providers (is_default) where is_default;

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  subject text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_daily_budget (
  provider_id text not null references public.ai_providers(id),
  day date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0,
  primary key (provider_id, day)
);

create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null check (feature in ('word_study', 'definition', 'translation')),
  provider_id text not null,
  model text not null,
  outcome text not null,
  duration_ms integer not null,
  input_tokens integer,
  output_tokens integer
);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events (created_at desc);

create table if not exists public.word_search_daily (
  word text not null,
  day date not null default (now() at time zone 'utc')::date,
  search_count integer not null default 0,
  source_miss_count integer not null default 0,
  ai_generated_count integer not null default 0,
  not_found_count integer not null default 0,
  error_count integer not null default 0,
  primary key (word, day)
);
create index if not exists word_search_daily_day_idx on public.word_search_daily (day desc);

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('word_of_day', 'trending_words', 'proverbs')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 500),
  destination text not null check (char_length(destination) between 1 and 300),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed', 'unknown')),
  fcm_message_id text,
  error_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.admin_users enable row level security;
alter table public.ai_providers enable row level security;
alter table public.admin_audit enable row level security;
alter table public.ai_daily_budget enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.word_search_daily enable row level security;
alter table public.notification_campaigns enable row level security;
revoke all on public.admin_users, public.ai_providers, public.admin_audit, public.ai_daily_budget,
  public.ai_usage_events, public.word_search_daily, public.notification_campaigns from anon, authenticated;
grant all on public.admin_users, public.ai_providers, public.admin_audit, public.ai_daily_budget,
  public.ai_usage_events, public.word_search_daily, public.notification_campaigns to service_role;

create or replace function public.admin_save_ai_provider(
  p_id text, p_base_url text, p_models text[], p_default_model text, p_api_key text,
  p_enabled boolean, p_is_default boolean, p_daily_request_limit integer,
  p_input_price_per_million numeric, p_output_price_per_million numeric, p_actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_secret_id uuid;
begin
  if p_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$' or p_base_url !~ '^https://' or
     coalesce(array_length(p_models, 1), 0) < 1 or not (p_default_model = any(p_models)) or
     (p_is_default and not p_enabled) or
     (p_daily_request_limit is not null and p_daily_request_limit < 1) or
     coalesce(p_input_price_per_million, 0) < 0 or coalesce(p_output_price_per_million, 0) < 0 then
    raise exception 'Invalid provider settings';
  end if;
  select secret_id into v_secret_id from public.ai_providers where id = p_id for update;
  if v_secret_id is null and nullif(trim(p_api_key), '') is null then
    raise exception 'An API key is required for a new provider';
  end if;
  if nullif(trim(p_api_key), '') is not null then
    if v_secret_id is null then
      v_secret_id := vault.create_secret(p_api_key, 'ai_provider_' || p_id);
    else
      perform vault.update_secret(v_secret_id, p_api_key);
    end if;
  end if;
  if p_is_default then update public.ai_providers set is_default = false where is_default; end if;
  insert into public.ai_providers(id, base_url, models, default_model, secret_id, enabled, is_default,
    daily_request_limit, input_price_per_million, output_price_per_million)
  values (p_id, p_base_url, p_models, p_default_model, v_secret_id, p_enabled, p_is_default,
    p_daily_request_limit, p_input_price_per_million, p_output_price_per_million)
  on conflict (id) do update set base_url = excluded.base_url, models = excluded.models,
    default_model = excluded.default_model, enabled = excluded.enabled, is_default = excluded.is_default,
    daily_request_limit = excluded.daily_request_limit,
    input_price_per_million = excluded.input_price_per_million,
    output_price_per_million = excluded.output_price_per_million, updated_at = now();
  if not exists (select 1 from public.ai_providers where enabled and is_default) then
    update public.ai_providers set is_default = true
      where id = (select id from public.ai_providers where enabled order by id limit 1);
  end if;
  insert into public.admin_audit(actor_id, action, subject) values (p_actor_id, 'save_provider', p_id);
end; $$;

create or replace function public.get_runtime_ai_providers()
returns table(id text, api_key text, base_url text, models text[], default_model text,
  is_default boolean, daily_request_limit integer)
language sql security definer set search_path = '' as $$
  select p.id, s.decrypted_secret, p.base_url, p.models, p.default_model,
    p.is_default, p.daily_request_limit
  from public.ai_providers p join vault.decrypted_secrets s on s.id = p.secret_id
  where p.enabled order by p.is_default desc, p.id;
$$;

create or replace function public.consume_ai_budget(p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_count integer;
begin
  select daily_request_limit into v_limit from public.ai_providers where id = p_provider_id and enabled;
  if not found then return false; end if;
  insert into public.ai_daily_budget(provider_id, day, request_count)
    values (p_provider_id, (now() at time zone 'utc')::date, 0) on conflict do nothing;
  update public.ai_daily_budget set request_count = request_count + 1
    where provider_id = p_provider_id and day = (now() at time zone 'utc')::date
      and (v_limit is null or request_count < v_limit)
    returning request_count into v_count;
  return v_count is not null;
end; $$;

create or replace function public.record_word_search(p_word text, p_source_miss boolean,
  p_ai_generated boolean, p_not_found boolean, p_error boolean)
returns void language sql security definer set search_path = '' as $$
  insert into public.word_search_daily(word, day, search_count, source_miss_count,
    ai_generated_count, not_found_count, error_count)
  values (p_word, (now() at time zone 'utc')::date, 1, p_source_miss::int,
    p_ai_generated::int, p_not_found::int, p_error::int)
  on conflict (word, day) do update set
    search_count = word_search_daily.search_count + 1,
    source_miss_count = word_search_daily.source_miss_count + excluded.source_miss_count,
    ai_generated_count = word_search_daily.ai_generated_count + excluded.ai_generated_count,
    not_found_count = word_search_daily.not_found_count + excluded.not_found_count,
    error_count = word_search_daily.error_count + excluded.error_count;
$$;

revoke all on function public.admin_save_ai_provider(text,text,text[],text,text,boolean,boolean,integer,numeric,numeric,uuid) from public, anon, authenticated;
revoke all on function public.get_runtime_ai_providers() from public, anon, authenticated;
revoke all on function public.consume_ai_budget(text) from public, anon, authenticated;
revoke all on function public.record_word_search(text,boolean,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.admin_save_ai_provider(text,text,text[],text,text,boolean,boolean,integer,numeric,numeric,uuid) to service_role;
grant execute on function public.get_runtime_ai_providers() to service_role;
grant execute on function public.consume_ai_budget(text) to service_role;
grant execute on function public.record_word_search(text,boolean,boolean,boolean,boolean) to service_role;

create or replace function public.claim_notification_campaign(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.notification_campaigns set status = 'sending', error_code = null
    where id = p_id and status = 'draft' returning id into v_id;
  return v_id is not null;
end; $$;
revoke all on function public.claim_notification_campaign(uuid) from public, anon, authenticated;
grant execute on function public.claim_notification_campaign(uuid) to service_role;

create or replace function public.admin_word_trends()
returns table(word text, recent_count bigint, previous_count bigint, source_misses bigint,
  ai_generated bigint, not_found bigint)
language sql security definer set search_path = '' as $$
  select d.word,
    coalesce(sum(d.search_count) filter (where d.day >= (now() at time zone 'utc')::date - 6), 0)::bigint,
    coalesce(sum(d.search_count) filter (where d.day between (now() at time zone 'utc')::date - 13 and (now() at time zone 'utc')::date - 7), 0)::bigint,
    coalesce(sum(d.source_miss_count) filter (where d.day >= (now() at time zone 'utc')::date - 6), 0)::bigint,
    coalesce(sum(d.ai_generated_count) filter (where d.day >= (now() at time zone 'utc')::date - 6), 0)::bigint,
    coalesce(sum(d.not_found_count) filter (where d.day >= (now() at time zone 'utc')::date - 6), 0)::bigint
  from public.word_search_daily d where d.day >= (now() at time zone 'utc')::date - 13
  group by d.word order by 2 desc, d.word limit 100;
$$;

create or replace function public.admin_ai_summary()
returns table(provider_id text, feature text, outcome text, request_count bigint,
  average_duration_ms numeric, input_tokens bigint, output_tokens bigint)
language sql security definer set search_path = '' as $$
  select e.provider_id, e.feature, e.outcome, count(*), round(avg(e.duration_ms), 0),
    coalesce(sum(e.input_tokens), 0), coalesce(sum(e.output_tokens), 0)
  from public.ai_usage_events e where e.created_at >= now() - interval '7 days'
  group by e.provider_id, e.feature, e.outcome order by count(*) desc;
$$;
revoke all on function public.admin_word_trends() from public, anon, authenticated;
revoke all on function public.admin_ai_summary() from public, anon, authenticated;
grant execute on function public.admin_word_trends() to service_role;
grant execute on function public.admin_ai_summary() to service_role;
