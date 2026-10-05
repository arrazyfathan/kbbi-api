-- Campaign changes and claims are kept in PostgreSQL transactions so overlapping
-- HTTP requests and cron ticks cannot send the same occurrence twice.
alter table public.notification_campaigns drop constraint if exists notification_campaigns_status_check;
alter table public.notification_campaigns add constraint notification_campaigns_status_check
  check (status in ('draft', 'scheduled', 'paused', 'cancelled', 'sending', 'sent', 'failed', 'unknown'));
alter table public.notification_campaigns
  add column schedule_mode text not null default 'immediate' check (schedule_mode in ('immediate', 'once', 'daily', 'weekly')),
  add column start_date date,
  add column local_time time without time zone,
  add column weekday integer check (weekday between 0 and 6),
  add column end_date date,
  add column next_occurrence_at timestamptz,
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now();
alter table public.notification_campaigns add constraint notification_campaigns_schedule_check check (
  (schedule_mode = 'immediate' and start_date is null and local_time is null and weekday is null and end_date is null) or
  (schedule_mode = 'once' and start_date is not null and local_time is not null and weekday is null and end_date is null) or
  (schedule_mode = 'daily' and start_date is not null and local_time is not null and weekday is null and (end_date is null or end_date >= start_date)) or
  (schedule_mode = 'weekly' and start_date is not null and local_time is not null and weekday is not null and (end_date is null or end_date >= start_date))
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.notification_campaigns(id),
  occurrence_key text not null,
  occurrence_at timestamptz not null,
  topic text not null,
  title text not null,
  body text not null,
  destination text not null,
  claimed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('sending', 'sent', 'failed', 'unknown', 'skipped')),
  fcm_message_id text,
  error_code text,
  completed_at timestamptz,
  unique (campaign_id, occurrence_key),
  unique (campaign_id, occurrence_at)
);
create index notification_campaigns_due_idx on public.notification_campaigns(next_occurrence_at) where status = 'scheduled';
create index notification_deliveries_campaign_idx on public.notification_deliveries(campaign_id, occurrence_at desc);
create index notification_deliveries_claim_idx on public.notification_deliveries(claimed_at) where outcome = 'sending';
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant all on public.notification_deliveries to service_role;

insert into public.notification_deliveries(campaign_id, occurrence_key, occurrence_at, topic, title, body, destination,
  claimed_at, outcome, fcm_message_id, error_code, completed_at)
select id, 'manual', coalesce(sent_at, created_at), topic, title, body, destination,
  coalesce(sent_at, created_at), case when status = 'sending' then 'unknown' else status end,
  fcm_message_id, error_code, coalesce(sent_at, now())
from public.notification_campaigns where status in ('sending', 'sent', 'failed', 'unknown');
update public.notification_campaigns set status = 'unknown', error_code = 'interrupted_claim' where status = 'sending';

create table public.notification_dispatcher_state (
  singleton boolean primary key default true check (singleton),
  last_heartbeat_at timestamptz,
  last_error_code text
);
insert into public.notification_dispatcher_state(singleton) values (true);
alter table public.notification_dispatcher_state enable row level security;
revoke all on public.notification_dispatcher_state from public, anon, authenticated;
grant all on public.notification_dispatcher_state to service_role;

-- Finds the first Jakarta wall-clock occurrence strictly after p_after.
create function public.notification_next_occurrence(p_mode text, p_start date, p_time time,
  p_weekday integer, p_end date, p_after timestamptz)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare v_date date; v_candidate timestamptz;
begin
  if p_mode = 'immediate' then return null; end if;
  v_date := case when p_mode = 'once' then p_start
    else greatest(p_start, (p_after at time zone 'Asia/Jakarta')::date) end;
  for i in 0..8 loop
    if p_end is not null and v_date > p_end then return null; end if;
    if p_mode <> 'weekly' or extract(dow from v_date)::integer = p_weekday then
      v_candidate := (v_date + p_time) at time zone 'Asia/Jakarta';
      if v_candidate > p_after then return v_candidate; end if;
    end if;
    if p_mode = 'once' then return null; end if;
    v_date := v_date + 1;
  end loop;
  return null;
end; $$;

create function public.notification_change_campaign(p_action text, p_id uuid, p_version integer,
  p_actor uuid, p_values jsonb default '{}'::jsonb)
returns public.notification_campaigns language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns; v_next timestamptz;
begin
  select * into c from public.notification_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if c.version <> p_version then raise exception 'version_conflict' using errcode = 'P0001'; end if;
  if p_action = 'edit' then
    if c.status not in ('draft', 'paused') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    if c.status = 'paused' and p_values->>'schedule_mode' not in ('daily','weekly') then
      raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.notification_campaigns set
      topic = p_values->>'topic', title = p_values->>'title', body = p_values->>'body',
      destination = p_values->>'destination', schedule_mode = p_values->>'schedule_mode',
      start_date = (p_values->>'start_date')::date, local_time = (p_values->>'local_time')::time,
      weekday = (p_values->>'weekday')::integer, end_date = (p_values->>'end_date')::date,
      next_occurrence_at = null, version = version + 1, updated_at = now()
      where id = p_id returning * into c;
  elsif p_action = 'schedule' then
    if c.status <> 'draft' or c.schedule_mode = 'immediate' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now());
    if v_next is null then raise exception 'schedule_expired' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'scheduled', next_occurrence_at = v_next,
      version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'pause' then
    if c.status <> 'scheduled' or c.schedule_mode not in ('daily','weekly') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'paused', next_occurrence_at = null,
      version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'resume' then
    if c.status <> 'paused' or c.schedule_mode not in ('daily','weekly') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now());
    if v_next is null then raise exception 'schedule_expired' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'scheduled', next_occurrence_at = v_next,
      version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'cancel' then
    if c.status not in ('draft','scheduled','paused') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'cancelled', next_occurrence_at = null,
      version = version + 1, updated_at = now() where id = p_id returning * into c;
  else raise exception 'invalid_action' using errcode = 'P0001'; end if;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_' || p_action,p_id::text);
  return c;
end; $$;

create function public.notification_create_campaign(p_actor uuid, p_values jsonb)
returns public.notification_campaigns language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns;
begin
  insert into public.notification_campaigns(topic,title,body,destination,created_by,
    schedule_mode,start_date,local_time,weekday,end_date)
  values (p_values->>'topic',p_values->>'title',p_values->>'body',p_values->>'destination',p_actor,
    p_values->>'schedule_mode',(p_values->>'start_date')::date,(p_values->>'local_time')::time,
    (p_values->>'weekday')::integer,(p_values->>'end_date')::date) returning * into c;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_create',c.id::text);
  return c;
end; $$;

-- The manual claim uses a fixed key. A claim is committed before FCM is called.
create function public.notification_claim_manual(p_id uuid, p_version integer, p_actor uuid)
returns public.notification_deliveries language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns; d public.notification_deliveries;
begin
  select * into c from public.notification_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if c.version <> p_version or c.status <> 'draft' or c.schedule_mode <> 'immediate' then
    raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,title,body,destination,outcome)
    values (c.id,'manual',now(),c.topic,c.title,c.body,c.destination,'sending') returning * into d;
  update public.notification_campaigns set status = 'sending', version = version + 1,
    updated_at = now() where id = p_id;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_send',p_id::text);
  return d;
end; $$;

create function public.notification_claim_due()
returns public.notification_deliveries language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns; d public.notification_deliveries; v_next timestamptz; v_due timestamptz;
begin
  select * into c from public.notification_campaigns where status = 'scheduled' and next_occurrence_at <= now()
    order by next_occurrence_at, id for update skip locked limit 1;
  if not found then return null; end if;
  v_due := c.next_occurrence_at;
  if c.schedule_mode in ('daily','weekly') then
    -- Collapse an outage to the latest eligible occurrence, skipping older ones.
    loop
      v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,v_due);
      exit when v_next is null or v_next > now();
      insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,title,body,destination,outcome,completed_at,error_code)
        values (c.id,v_due::text,v_due,c.topic,c.title,c.body,c.destination,'skipped',now(),'superseded');
      v_due := v_next;
    end loop;
  else v_next := null; end if;
  insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,title,body,destination,outcome,completed_at,error_code)
    values (c.id,v_due::text,v_due,c.topic,c.title,c.body,c.destination,
      case when v_due <= now() - interval '24 hours' then 'skipped' else 'sending' end,
      case when v_due <= now() - interval '24 hours' then now() else null end,
      case when v_due <= now() - interval '24 hours' then 'overdue' else null end) returning * into d;
  if c.schedule_mode in ('daily','weekly') then
    v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now());
  end if;
  update public.notification_campaigns set
    status = case when c.schedule_mode = 'once' then case when d.outcome = 'skipped' then 'failed' else 'sending' end
      else 'scheduled' end,
    next_occurrence_at = v_next, version = version + 1, updated_at = now(),
    error_code = case when d.outcome = 'skipped' then 'overdue' else null end
    where id = c.id;
  if d.outcome = 'sending' then
    insert into public.admin_audit(actor_id,action,subject) values (null,'notification_send',c.id::text);
  end if;
  return d;
end; $$;

create function public.notification_complete_delivery(p_id uuid, p_outcome text, p_message_id text, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.notification_deliveries; c public.notification_campaigns;
begin
  if p_outcome not in ('sent','failed','unknown') then raise exception 'invalid_outcome'; end if;
  update public.notification_deliveries set outcome = p_outcome, fcm_message_id = p_message_id,
    error_code = p_error_code, completed_at = now() where id = p_id and outcome = 'sending' returning * into d;
  if not found then return; end if;
  select * into c from public.notification_campaigns where id = d.campaign_id for update;
  if c.schedule_mode in ('immediate','once') then
    update public.notification_campaigns set status = p_outcome, fcm_message_id = p_message_id,
      error_code = p_error_code, sent_at = case when p_outcome = 'sent' then now() else null end,
      version = version + 1, updated_at = now() where id = c.id;
  end if;
end; $$;

create function public.notification_recover_stale()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with stale as (
    update public.notification_deliveries set outcome = 'unknown', error_code = 'interrupted_claim', completed_at = now()
    where outcome = 'sending' and claimed_at < now() - interval '5 minutes' returning campaign_id
  ) select count(*) into v_count from stale;
  update public.notification_campaigns c set status = 'unknown', error_code = 'interrupted_claim',
    version = version + 1, updated_at = now() where c.status = 'sending' and exists
    (select 1 from public.notification_deliveries d where d.campaign_id = c.id and d.outcome = 'unknown' and d.error_code = 'interrupted_claim');
  return v_count;
end; $$;

-- Keep the legacy claim function during the staged Studio rollout. Remove it
-- only after Studio no longer sends directly.
create function public.notification_dispatcher_health(p_now timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'last_heartbeat_at', s.last_heartbeat_at,
    'last_error_code', s.last_error_code,
    'overdue_count', (select count(*) from public.notification_campaigns
      where status = 'scheduled' and next_occurrence_at < p_now - interval '5 minutes'),
    'outcomes', coalesce((select jsonb_agg(x) from (
      select outcome, error_code, count(*) as count from public.notification_deliveries
      where claimed_at >= p_now - interval '24 hours' group by outcome, error_code
    ) x), '[]'::jsonb)
  ) from public.notification_dispatcher_state s where singleton;
$$;
revoke all on function public.notification_dispatcher_health(timestamptz) from public, anon, authenticated;
grant execute on function public.notification_dispatcher_health(timestamptz) to service_role;
revoke all on function public.notification_next_occurrence(text,date,time,integer,date,timestamptz) from public, anon, authenticated;
revoke all on function public.notification_change_campaign(text,uuid,integer,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.notification_create_campaign(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.notification_claim_manual(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.notification_claim_due() from public, anon, authenticated;
revoke all on function public.notification_complete_delivery(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.notification_recover_stale() from public, anon, authenticated;
grant execute on function public.notification_change_campaign(text,uuid,integer,uuid,jsonb) to service_role;
grant execute on function public.notification_create_campaign(uuid,jsonb) to service_role;
grant execute on function public.notification_claim_manual(uuid,integer,uuid) to service_role;
grant execute on function public.notification_claim_due() to service_role;
grant execute on function public.notification_complete_delivery(uuid,text,text,text) to service_role;
grant execute on function public.notification_recover_stale() to service_role;
