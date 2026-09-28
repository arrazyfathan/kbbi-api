-- Per-model pricing.
-- Replaces the provider-level input_price_per_million / output_price_per_million
-- with a jsonb map keyed by model id:
--   { "<model>": { "input": number|null, "output": number|null, "currency": "USD"|"IDR" } }

alter table public.ai_providers
  add column if not exists model_prices jsonb not null default '{}'::jsonb;

-- Backfill every model of every provider with the provider-level price (USD by convention).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_providers' and column_name = 'input_price_per_million'
  ) then
    update public.ai_providers p
    set model_prices = (
      select coalesce(jsonb_object_agg(model, jsonb_build_object(
        'input', p.input_price_per_million,
        'output', p.output_price_per_million,
        'currency', 'USD'
      )), '{}'::jsonb)
      from unnest(p.models) as model
    );
  end if;
end $$;

alter table public.ai_providers
  drop column if exists input_price_per_million,
  drop column if exists output_price_per_million;

-- Signature changes (numeric params -> jsonb), so the old overload must be removed.
drop function if exists public.admin_save_ai_provider(text, text, text[], text, text, boolean, boolean, integer, numeric, numeric, uuid);

create or replace function public.admin_save_ai_provider(
  p_id text, p_base_url text, p_models text[], p_default_model text, p_api_key text,
  p_enabled boolean, p_is_default boolean, p_daily_request_limit integer,
  p_model_prices jsonb, p_actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_secret_id uuid;
begin
  if p_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$' or p_base_url !~ '^https://' or
     coalesce(array_length(p_models, 1), 0) < 1 or not (p_default_model = any(p_models)) or
     (p_is_default and not p_enabled) or
     (p_daily_request_limit is not null and p_daily_request_limit < 1) then
    raise exception 'Invalid provider settings';
  end if;
  if p_model_prices is null or jsonb_typeof(p_model_prices) <> 'object' then
    raise exception 'Invalid model prices';
  end if;
  if exists (
    select 1 from jsonb_each(p_model_prices) as e(key, value)
    where not (e.key = any(p_models))
       or jsonb_typeof(e.value) <> 'object'
       or coalesce(e.value->>'currency', '') not in ('USD', 'IDR')
       or (e.value ? 'input' and jsonb_typeof(e.value->'input') not in ('number', 'null'))
       or (e.value ? 'input' and jsonb_typeof(e.value->'input') = 'number' and (e.value->'input')::numeric < 0)
       or (e.value ? 'output' and jsonb_typeof(e.value->'output') not in ('number', 'null'))
       or (e.value ? 'output' and jsonb_typeof(e.value->'output') = 'number' and (e.value->'output')::numeric < 0)
  ) then
    raise exception 'Invalid model prices';
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
    daily_request_limit, model_prices)
  values (p_id, p_base_url, p_models, p_default_model, v_secret_id, p_enabled, p_is_default,
    p_daily_request_limit, p_model_prices)
  on conflict (id) do update set base_url = excluded.base_url, models = excluded.models,
    default_model = excluded.default_model, enabled = excluded.enabled, is_default = excluded.is_default,
    daily_request_limit = excluded.daily_request_limit,
    model_prices = excluded.model_prices, updated_at = now();
  if not exists (select 1 from public.ai_providers where enabled and is_default) then
    update public.ai_providers set is_default = true
      where id = (select id from public.ai_providers where enabled order by id limit 1);
  end if;
  insert into public.admin_audit(actor_id, action, subject) values (p_actor_id, 'save_provider', p_id);
end; $$;

revoke all on function public.admin_save_ai_provider(text,text,text[],text,text,boolean,boolean,integer,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.admin_save_ai_provider(text,text,text[],text,text,boolean,boolean,integer,jsonb,uuid) to service_role;

-- The summary now breaks usage down by model so the dashboard can price each model.
drop function if exists public.admin_ai_summary();

create or replace function public.admin_ai_summary()
returns table(provider_id text, feature text, outcome text, model text, request_count bigint,
  average_duration_ms numeric, input_tokens bigint, output_tokens bigint)
language sql security definer set search_path = '' as $$
  select e.provider_id, e.feature, e.outcome, e.model, count(*), round(avg(e.duration_ms), 0),
    coalesce(sum(e.input_tokens), 0), coalesce(sum(e.output_tokens), 0)
  from public.ai_usage_events e where e.created_at >= now() - interval '7 days'
  group by e.provider_id, e.feature, e.outcome, e.model order by count(*) desc;
$$;
revoke all on function public.admin_ai_summary() from public, anon, authenticated;
grant execute on function public.admin_ai_summary() to service_role;
