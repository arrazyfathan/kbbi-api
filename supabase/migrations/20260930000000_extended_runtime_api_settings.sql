alter table public.api_runtime_settings
  add column if not exists global_rate_limit_window_ms integer not null default 900000 check (global_rate_limit_window_ms > 0),
  add column if not exists global_rate_limit_max integer not null default 300 check (global_rate_limit_max > 0),
  add column if not exists scraper_rate_limit_window_ms integer not null default 900000 check (scraper_rate_limit_window_ms > 0),
  add column if not exists scraper_rate_limit_max integer not null default 30 check (scraper_rate_limit_max > 0),
  add column if not exists wikiquote_cache_ttl_ms integer not null default 3600000 check (wikiquote_cache_ttl_ms > 0),
  add column if not exists kbbi_fetch_timeout_ms integer not null default 45000 check (kbbi_fetch_timeout_ms > 0),
  add column if not exists google_translate_timeout_ms integer not null default 10000 check (google_translate_timeout_ms > 0),
  add column if not exists translate_cache_ttl_ms integer not null default 3600000 check (translate_cache_ttl_ms > 0),
  add column if not exists lara_translate_timeout_ms integer not null default 10000 check (lara_translate_timeout_ms > 0),
  add column if not exists lara_credential_mode text not null default 'environment' check (lara_credential_mode in ('environment','managed','disabled')),
  add column if not exists lara_credentials_secret_id uuid references vault.secrets(id);

drop function if exists public.get_runtime_api_settings();
create function public.get_runtime_api_settings()
returns table(
  openai_timeout_ms integer, ai_rate_limit_window_ms integer, ai_rate_limit_max integer,
  global_rate_limit_window_ms integer, global_rate_limit_max integer,
  scraper_rate_limit_window_ms integer, scraper_rate_limit_max integer,
  wikiquote_cache_ttl_ms integer, kbbi_fetch_timeout_ms integer,
  google_translate_timeout_ms integer, translate_cache_ttl_ms integer,
  lara_translate_timeout_ms integer, lara_credential_mode text
)
language sql security definer set search_path = '' as $$
  select s.openai_timeout_ms, s.ai_rate_limit_window_ms, s.ai_rate_limit_max,
    s.global_rate_limit_window_ms, s.global_rate_limit_max,
    s.scraper_rate_limit_window_ms, s.scraper_rate_limit_max,
    s.wikiquote_cache_ttl_ms, s.kbbi_fetch_timeout_ms,
    s.google_translate_timeout_ms, s.translate_cache_ttl_ms,
    s.lara_translate_timeout_ms, s.lara_credential_mode
  from public.api_runtime_settings s where s.id = true;
$$;

drop function if exists public.admin_save_api_runtime_settings(integer, integer, integer, uuid);
create function public.admin_save_api_runtime_settings(
  p_openai_timeout_ms integer, p_ai_rate_limit_window_ms integer, p_ai_rate_limit_max integer,
  p_global_rate_limit_window_ms integer, p_global_rate_limit_max integer,
  p_scraper_rate_limit_window_ms integer, p_scraper_rate_limit_max integer,
  p_wikiquote_cache_ttl_ms integer, p_kbbi_fetch_timeout_ms integer,
  p_google_translate_timeout_ms integer, p_translate_cache_ttl_ms integer,
  p_lara_translate_timeout_ms integer, p_lara_credential_mode text, p_actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare values_to_check integer[] := array[
  p_openai_timeout_ms, p_ai_rate_limit_window_ms, p_ai_rate_limit_max,
  p_global_rate_limit_window_ms, p_global_rate_limit_max,
  p_scraper_rate_limit_window_ms, p_scraper_rate_limit_max,
  p_wikiquote_cache_ttl_ms, p_kbbi_fetch_timeout_ms,
  p_google_translate_timeout_ms, p_translate_cache_ttl_ms, p_lara_translate_timeout_ms
];
begin
  if array_position(values_to_check, null) is not null or exists(select 1 from unnest(values_to_check) as item(value) where item.value < 1)
    or p_lara_credential_mode not in ('environment','managed','disabled')
    or not exists(select 1 from public.admin_users where user_id = p_actor_id) then
    raise exception 'Invalid API runtime settings or administrator';
  end if;
  update public.api_runtime_settings set
    openai_timeout_ms = p_openai_timeout_ms, ai_rate_limit_window_ms = p_ai_rate_limit_window_ms,
    ai_rate_limit_max = p_ai_rate_limit_max, global_rate_limit_window_ms = p_global_rate_limit_window_ms,
    global_rate_limit_max = p_global_rate_limit_max, scraper_rate_limit_window_ms = p_scraper_rate_limit_window_ms,
    scraper_rate_limit_max = p_scraper_rate_limit_max, wikiquote_cache_ttl_ms = p_wikiquote_cache_ttl_ms,
    kbbi_fetch_timeout_ms = p_kbbi_fetch_timeout_ms, google_translate_timeout_ms = p_google_translate_timeout_ms,
    translate_cache_ttl_ms = p_translate_cache_ttl_ms, lara_translate_timeout_ms = p_lara_translate_timeout_ms,
    lara_credential_mode = p_lara_credential_mode, updated_by = p_actor_id, updated_at = now()
  where id = true;
  insert into public.admin_audit(actor_id, action, subject) values (p_actor_id, 'save_api_runtime_settings', 'api_runtime_settings');
end; $$;

create or replace function public.admin_save_lara_credentials(p_access_key_id text, p_access_key_secret text, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret_id uuid;
begin
  if nullif(trim(p_access_key_id), '') is null or nullif(trim(p_access_key_secret), '') is null
    or not exists(select 1 from public.admin_users where user_id = p_actor_id) then
    raise exception 'Both Lara credentials and an administrator are required';
  end if;
  select lara_credentials_secret_id into v_secret_id from public.api_runtime_settings where id = true for update;
  if v_secret_id is null then
    v_secret_id := vault.create_secret(jsonb_build_object('access_key_id', p_access_key_id, 'access_key_secret', p_access_key_secret)::text, 'lara_translate_runtime_credentials');
    update public.api_runtime_settings set lara_credentials_secret_id = v_secret_id where id = true;
  else
    perform vault.update_secret(v_secret_id, jsonb_build_object('access_key_id', p_access_key_id, 'access_key_secret', p_access_key_secret)::text);
  end if;
  update public.api_runtime_settings set updated_by = p_actor_id, updated_at = now() where id = true;
  insert into public.admin_audit(actor_id, action, subject) values (p_actor_id, 'save_lara_credentials', 'lara_translate');
end; $$;

create or replace function public.get_runtime_lara_credentials()
returns table(access_key_id text, access_key_secret text)
language sql security definer set search_path = '' as $$
  select (s.decrypted_secret::jsonb ->> 'access_key_id'), (s.decrypted_secret::jsonb ->> 'access_key_secret')
  from public.api_runtime_settings r join vault.decrypted_secrets s on s.id = r.lara_credentials_secret_id
  where r.id = true and r.lara_credential_mode = 'managed';
$$;

revoke all on function public.get_runtime_api_settings() from public, anon, authenticated;
revoke all on function public.admin_save_api_runtime_settings(integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.admin_save_lara_credentials(text,text,uuid) from public, anon, authenticated;
revoke all on function public.get_runtime_lara_credentials() from public, anon, authenticated;
grant execute on function public.get_runtime_api_settings() to service_role;
grant execute on function public.admin_save_api_runtime_settings(integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,uuid) to service_role;
grant execute on function public.admin_save_lara_credentials(text,text,uuid) to service_role;
grant execute on function public.get_runtime_lara_credentials() to service_role;
