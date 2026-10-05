-- Select the Firebase topic environment per campaign and preserve it in every delivery snapshot.
alter table public.notification_campaigns
  add column environment text not null default 'production' check (environment in ('development','production'));
alter table public.notification_deliveries
  add column environment text not null default 'production' check (environment in ('development','production'));

create or replace function public.notification_change_campaign(p_action text, p_id uuid, p_version integer,
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
      topic = p_values->>'topic', environment = p_values->>'environment', title = p_values->>'title', body = p_values->>'body',
      destination = p_values->>'destination', schedule_mode = p_values->>'schedule_mode',
      start_date = (p_values->>'start_date')::date, local_time = (p_values->>'local_time')::time,
      weekday = (p_values->>'weekday')::integer, end_date = (p_values->>'end_date')::date,
      next_occurrence_at = null, version = version + 1, updated_at = now()
      where id = p_id returning * into c;
  elsif p_action = 'schedule' then
    if c.status <> 'draft' or c.schedule_mode = 'immediate' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now());
    if v_next is null then raise exception 'schedule_expired' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'scheduled', next_occurrence_at = v_next, version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'pause' then
    if c.status <> 'scheduled' or c.schedule_mode not in ('daily','weekly') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'paused', next_occurrence_at = null, version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'resume' then
    if c.status <> 'paused' or c.schedule_mode not in ('daily','weekly') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now());
    if v_next is null then raise exception 'schedule_expired' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'scheduled', next_occurrence_at = v_next, version = version + 1, updated_at = now() where id = p_id returning * into c;
  elsif p_action = 'cancel' then
    if c.status not in ('draft','scheduled','paused') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    update public.notification_campaigns set status = 'cancelled', next_occurrence_at = null, version = version + 1, updated_at = now() where id = p_id returning * into c;
  else raise exception 'invalid_action' using errcode = 'P0001'; end if;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_' || p_action,p_id::text);
  return c;
end; $$;

create or replace function public.notification_create_campaign(p_actor uuid, p_values jsonb)
returns public.notification_campaigns language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns;
begin
  insert into public.notification_campaigns(topic,environment,title,body,destination,created_by,schedule_mode,start_date,local_time,weekday,end_date)
  values (p_values->>'topic',coalesce(p_values->>'environment','production'),p_values->>'title',p_values->>'body',p_values->>'destination',p_actor,
    p_values->>'schedule_mode',(p_values->>'start_date')::date,(p_values->>'local_time')::time,(p_values->>'weekday')::integer,(p_values->>'end_date')::date) returning * into c;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_create',c.id::text);
  return c;
end; $$;

create or replace function public.notification_claim_manual(p_id uuid, p_version integer, p_actor uuid)
returns public.notification_deliveries language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns; d public.notification_deliveries;
begin
  select * into c from public.notification_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if c.version <> p_version or c.status <> 'draft' or c.schedule_mode <> 'immediate' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,environment,title,body,destination,outcome)
    values (c.id,'manual',now(),c.topic,c.environment,c.title,c.body,c.destination,'sending') returning * into d;
  update public.notification_campaigns set status = 'sending', version = version + 1, updated_at = now() where id = p_id;
  insert into public.admin_audit(actor_id,action,subject) values (p_actor,'notification_send',p_id::text);
  return d;
end; $$;

create or replace function public.notification_claim_due()
returns public.notification_deliveries language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns; d public.notification_deliveries; v_next timestamptz; v_due timestamptz;
begin
  select * into c from public.notification_campaigns where status = 'scheduled' and next_occurrence_at <= now() order by next_occurrence_at, id for update skip locked limit 1;
  if not found then return null; end if;
  v_due := c.next_occurrence_at;
  if c.schedule_mode in ('daily','weekly') then
    loop
      v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,v_due);
      exit when v_next is null or v_next > now();
      insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,environment,title,body,destination,outcome,completed_at,error_code)
        values (c.id,v_due::text,v_due,c.topic,c.environment,c.title,c.body,c.destination,'skipped',now(),'superseded');
      v_due := v_next;
    end loop;
  else v_next := null; end if;
  insert into public.notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,environment,title,body,destination,outcome,completed_at,error_code)
    values (c.id,v_due::text,v_due,c.topic,c.environment,c.title,c.body,c.destination,case when v_due <= now() - interval '24 hours' then 'skipped' else 'sending' end,
      case when v_due <= now() - interval '24 hours' then now() else null end,case when v_due <= now() - interval '24 hours' then 'overdue' else null end) returning * into d;
  if c.schedule_mode in ('daily','weekly') then v_next := public.notification_next_occurrence(c.schedule_mode,c.start_date,c.local_time,c.weekday,c.end_date,now()); end if;
  update public.notification_campaigns set status = case when c.schedule_mode = 'once' then case when d.outcome = 'skipped' then 'failed' else 'sending' end else 'scheduled' end,
    next_occurrence_at = v_next, version = version + 1, updated_at = now(), error_code = case when d.outcome = 'skipped' then 'overdue' else null end where id = c.id;
  if d.outcome = 'sending' then insert into public.admin_audit(actor_id,action,subject) values (null,'notification_send',c.id::text); end if;
  return d;
end; $$;
