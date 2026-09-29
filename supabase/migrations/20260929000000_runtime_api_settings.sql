create table if not exists public.api_runtime_settings (
  id boolean primary key default true check (id),
  openai_timeout_ms integer not null check (openai_timeout_ms > 0),
  ai_rate_limit_window_ms integer not null check (ai_rate_limit_window_ms > 0),
  ai_rate_limit_max integer not null check (ai_rate_limit_max > 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.api_runtime_settings(id, openai_timeout_ms, ai_rate_limit_window_ms, ai_rate_limit_max)
values (true, 30000, 900000, 10)
on conflict (id) do nothing;

alter table public.api_runtime_settings enable row level security;
revoke all on public.api_runtime_settings from anon, authenticated;
grant all on public.api_runtime_settings to service_role;

create or replace function public.get_runtime_api_settings()
returns table(openai_timeout_ms integer, ai_rate_limit_window_ms integer, ai_rate_limit_max integer)
language sql security definer set search_path = '' as $$
  select s.openai_timeout_ms, s.ai_rate_limit_window_ms, s.ai_rate_limit_max
  from public.api_runtime_settings s where s.id = true;
$$;

create or replace function public.admin_save_api_runtime_settings(
  p_openai_timeout_ms integer,
  p_ai_rate_limit_window_ms integer,
  p_ai_rate_limit_max integer,
  p_actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_openai_timeout_ms is null or p_openai_timeout_ms < 1 or
     p_ai_rate_limit_window_ms is null or p_ai_rate_limit_window_ms < 1 or
     p_ai_rate_limit_max is null or p_ai_rate_limit_max < 1 or
     not exists (select 1 from public.admin_users where user_id = p_actor_id) then
    raise exception 'Invalid API runtime settings or administrator';
  end if;

  insert into public.api_runtime_settings(
    id, openai_timeout_ms, ai_rate_limit_window_ms, ai_rate_limit_max, updated_by, updated_at
  ) values (
    true, p_openai_timeout_ms, p_ai_rate_limit_window_ms, p_ai_rate_limit_max, p_actor_id, now()
  ) on conflict (id) do update set
    openai_timeout_ms = excluded.openai_timeout_ms,
    ai_rate_limit_window_ms = excluded.ai_rate_limit_window_ms,
    ai_rate_limit_max = excluded.ai_rate_limit_max,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.admin_audit(actor_id, action, subject)
  values (p_actor_id, 'save_api_runtime_settings', 'ai_runtime_settings');
end; $$;

revoke all on function public.get_runtime_api_settings() from public, anon, authenticated;
revoke all on function public.admin_save_api_runtime_settings(integer, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.get_runtime_api_settings() to service_role;
grant execute on function public.admin_save_api_runtime_settings(integer, integer, integer, uuid) to service_role;
