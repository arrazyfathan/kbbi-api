-- Campaigns are soft-archived first; permanent deletion is restricted to archived records.
alter table public.notification_campaigns drop constraint if exists notification_campaigns_status_check;
alter table public.notification_campaigns add constraint notification_campaigns_status_check
  check (status in ('draft', 'scheduled', 'paused', 'cancelled', 'sending', 'sent', 'failed', 'unknown', 'archived'));
alter table public.notification_campaigns add column if not exists archived_at timestamptz;

create or replace function public.notification_archive_campaign(p_id uuid, p_version integer, p_actor uuid)
returns public.notification_campaigns language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns;
begin
  select * into c from public.notification_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if c.version <> p_version then raise exception 'version_conflict' using errcode = 'P0001'; end if;
  if c.status in ('scheduled', 'paused', 'sending', 'archived') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.notification_campaigns
    set status = 'archived', archived_at = now(), next_occurrence_at = null,
        version = version + 1, updated_at = now()
    where id = p_id returning * into c;
  insert into public.admin_audit(actor_id, action, subject)
    values (p_actor, 'notification_campaign_archive', p_id::text);
  return c;
end; $$;

create or replace function public.notification_delete_archived_campaign(p_id uuid, p_version integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.notification_campaigns;
begin
  select * into c from public.notification_campaigns where id = p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if c.version <> p_version then raise exception 'version_conflict' using errcode = 'P0001'; end if;
  if c.status <> 'archived' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
  delete from public.notification_deliveries where campaign_id = p_id;
  delete from public.notification_campaigns where id = p_id;
  insert into public.admin_audit(actor_id, action, subject)
    values (p_actor, 'notification_campaign_delete', p_id::text);
  return jsonb_build_object('id', p_id, 'deleted', true);
end; $$;

revoke all on function public.notification_archive_campaign(uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.notification_delete_archived_campaign(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.notification_archive_campaign(uuid,integer,uuid) to service_role;
grant execute on function public.notification_delete_archived_campaign(uuid,integer,uuid) to service_role;
