-- Extend the existing staff-email outbox; never backfill historical completions.
alter table public.staff_email_subscriptions
  drop constraint staff_email_subscriptions_key_check,
  add constraint staff_email_subscriptions_key_check check (notification_key in (
    'daily-booking-review','secret-guest-list','new-waitlist-enquiry',
    'daily-waitlist-reminder','staff-issue-resolution'
  ));
alter table public.staff_email_notification_deliveries
  drop constraint staff_email_notification_deliveries_status_check,
  add constraint staff_email_notification_deliveries_status_check
    check (status in ('pending','processing','sent','failed','suppressed'));
create index if not exists staff_issue_resolution_pending_idx
  on public.staff_email_notification_deliveries(created_at)
  where notification_key = 'staff-issue-resolution' and status = 'pending';

create or replace function public.queue_staff_issue_resolution()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Completed history is immutable notification evidence, even after note edits.
  if old.metadata ? 'verifiedResolution' then
    new.metadata := jsonb_set(coalesce(new.metadata,'{}'), '{verifiedResolution}', old.metadata->'verifiedResolution');
    new.completed_at := old.completed_at;
  elsif new.status = 'completed' and old.status <> 'completed' and old.completed_at is null then
    if coalesce(new.metadata->'resolutionVerification'->>'verified','false') <> 'true'
      or not exists (select 1 from public.staff_profiles s join public.roles r on r.id=s.role_id
        where s.id::text = new.metadata->'resolutionVerification'->>'staffProfileId'
          and s.active and r.name in ('Super Admin','Venue Manager','super-admin','venue-manager')) then
      raise exception 'Verify the fix before completing this issue.';
    end if;
    if length(btrim(coalesce(new.resolution_notes,''))) not between 1 and 300
      or cardinality(regexp_split_to_array(btrim(new.resolution_notes), '[.!?]+[[:space:]]+')) > 2
      or new.resolution_notes ~* '(https?:|\m(HTTP|SQL|API|RPC|commit|deployment)\M|stack trace|root cause)' then
      raise exception 'Use no more than two short, simple sentences for the reporter.';
    end if;
    new.completed_at := clock_timestamp();
    if new.created_at > new.completed_at then raise exception 'The report date is later than the resolution.'; end if;
    new.metadata := jsonb_set(coalesce(new.metadata,'{}'), '{verifiedResolution}', jsonb_build_object(
      'createdAt',new.created_at,'completedAt',new.completed_at,'title',new.title,
      'notes',new.resolution_notes,'reporterStaffId',new.reporter_staff_id,
      'verifiedBy',new.metadata->'resolutionVerification'->>'staffProfileId',
      'technicalContext',new.metadata->'technicalContext'
    ));
    insert into public.staff_email_notification_deliveries(notification_key,event_key,status,to_staff_profile_ids)
    values ('staff-issue-resolution',new.id::text,'pending',
      case when new.reporter_staff_id is null then '{}'::uuid[] else array[new.reporter_staff_id] end)
    on conflict (notification_key,event_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.queue_staff_issue_resolution() from public,anon,authenticated;
create trigger staff_issue_verified_resolution before update on public.staff_issue_reports
  for each row execute function public.queue_staff_issue_resolution();

-- Resolution sends must originate in the completion outbox, not a retry or note edit.
-- Ambiguous SMTP failures are NOT automatically retried: avoid duplicate emails.
create or replace function public.claim_staff_email_notification_delivery(
  p_notification_key text,p_event_key text,p_to_staff_profile_ids uuid[],p_cc_staff_profile_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_notification_key = 'staff-issue-resolution' then
    update public.staff_email_notification_deliveries set status='processing',
      to_staff_profile_ids=coalesce(p_to_staff_profile_ids,'{}'),
      cc_staff_profile_ids='{}',updated_at=clock_timestamp()
    where notification_key=p_notification_key and event_key=p_event_key and status='pending'
    returning id into v_id;
    return v_id;
  end if;
  insert into public.staff_email_notification_deliveries(notification_key,event_key,status,to_staff_profile_ids,cc_staff_profile_ids)
  values(p_notification_key,p_event_key,'processing',coalesce(p_to_staff_profile_ids,'{}'),coalesce(p_cc_staff_profile_ids,'{}'))
  on conflict(notification_key,event_key) do update set status='processing',
    to_staff_profile_ids=excluded.to_staff_profile_ids,cc_staff_profile_ids=excluded.cc_staff_profile_ids,
    attempt_count=staff_email_notification_deliveries.attempt_count+1,last_error=null,updated_at=clock_timestamp()
  where staff_email_notification_deliveries.status='failed' returning id into v_id;
  return v_id;
end $$;
revoke all on function public.claim_staff_email_notification_delivery(text,text,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.claim_staff_email_notification_delivery(text,text,uuid[],uuid[]) to service_role;

insert into public.communication_templates(type,channel,name,subject,body,active)
select 'custom_message','email','Staff Issue Resolution','{{bug_reference}} resolved | Zingara',
  E'Hello {{reporter_name}},\n\n{{resolution_notes}}',true
where not exists(select 1 from public.communication_templates where name='Staff Issue Resolution' and channel='email');
