-- Phase 49.5: category ratings, audited guest replies, and configurable review alerts.

alter table public.guest_reviews
  add column if not exists food_rating smallint check (food_rating between 1 and 5),
  add column if not exists value_rating smallint check (value_rating between 1 and 5),
  add column if not exists service_rating smallint check (service_rating between 1 and 5),
  add column if not exists ambience_rating smallint check (ambience_rating between 1 and 5);

create or replace function public.protect_guest_review_wording()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.public_id is distinct from old.public_id
     or new.invitation_id is distinct from old.invitation_id
     or new.booking_id is distinct from old.booking_id
     or new.customer_id is distinct from old.customer_id
     or new.show_id is distinct from old.show_id
     or new.venue is distinct from old.venue
     or new.public_display_name is distinct from old.public_display_name
     or new.rating is distinct from old.rating
     or new.review_text is distinct from old.review_text
     or new.contact_requested is distinct from old.contact_requested
     or new.publication_consent is distinct from old.publication_consent
     or new.publication_consented_at is distinct from old.publication_consented_at
     or (new.publication_consent_mode is distinct from old.publication_consent_mode
       and coalesce(current_setting('zingara.review_permission_response',true),'')<>'true')
     or ((new.review_privacy_requested is distinct from old.review_privacy_requested
       or new.review_publication_policy_version is distinct from old.review_publication_policy_version)
       and coalesce(current_setting('zingara.review_policy_submission',true),'')<>'true')
     or ((new.food_rating is distinct from old.food_rating
       or new.value_rating is distinct from old.value_rating
       or new.service_rating is distinct from old.service_rating
       or new.ambience_rating is distinct from old.ambience_rating)
       and coalesce(current_setting('zingara.review_category_submission',true),'')<>'true')
     or new.verified_guest is distinct from old.verified_guest
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at then
    raise exception 'REVIEW_GUEST_CONTENT_IMMUTABLE';
  end if;
  return new;
end $$;

create table if not exists public.guest_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.guest_reviews(id) on delete restrict,
  idempotency_key uuid not null,
  actor_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  actor_name text not null,
  actor_email text not null,
  recipient_email text not null,
  message text not null check (length(trim(message)) between 1 and 4000),
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (review_id, idempotency_key)
);

create index if not exists guest_review_replies_review_idx
  on public.guest_review_replies (review_id, sent_at desc)
  where status = 'sent';

alter table public.guest_review_replies enable row level security;
revoke all on public.guest_review_replies from public, anon, authenticated;
grant all on public.guest_review_replies to service_role;

create or replace function public.claim_guest_review_reply(
  p_review_id uuid,
  p_idempotency_key uuid,
  p_actor_staff_profile_id uuid,
  p_actor_name text,
  p_actor_email text,
  p_recipient_email text,
  p_message text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.guest_review_replies (
    review_id,idempotency_key,actor_staff_profile_id,actor_name,actor_email,
    recipient_email,message,status
  ) values (
    p_review_id,p_idempotency_key,p_actor_staff_profile_id,trim(p_actor_name),
    lower(trim(p_actor_email)),lower(trim(p_recipient_email)),trim(p_message),'processing'
  )
  on conflict (review_id,idempotency_key) do update
  set status='processing',attempt_count=guest_review_replies.attempt_count+1,
      last_error=null,updated_at=now()
  where guest_review_replies.status='failed'
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.complete_guest_review_reply(
  p_reply_id uuid,
  p_status text,
  p_error text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent','failed') then raise exception 'REVIEW_REPLY_STATUS_INVALID'; end if;
  update public.guest_review_replies
  set status=p_status,sent_at=case when p_status='sent' then now() else null end,
      last_error=case when p_status='failed' then left(p_error,1000) else null end,
      updated_at=now()
  where id=p_reply_id and status='processing';
end $$;

revoke all on function public.claim_guest_review_reply(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_guest_review_reply(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_guest_review_reply(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.complete_guest_review_reply(uuid,text,text) to service_role;

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_rating integer,
  p_review_text text,
  p_contact_requested boolean,
  p_publication_consent boolean,
  p_publication_consent_mode text,
  p_privacy_requested boolean,
  p_publication_policy_version text,
  p_food_rating integer,
  p_value_rating integer,
  p_service_rating integer,
  p_ambience_rating integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_id uuid; v_existing public.guest_reviews%rowtype;
begin
  if p_food_rating not between 1 and 5 or p_value_rating not between 1 and 5
     or p_service_rating not between 1 and 5 or p_ambience_rating not between 1 and 5 then
    raise exception 'REVIEW_CATEGORY_RATINGS_REQUIRED';
  end if;
  v_result := public.submit_verified_guest_review(
    p_token_hash,p_rating,p_review_text,p_contact_requested,p_publication_consent,
    p_publication_consent_mode,p_privacy_requested,p_publication_policy_version
  );
  v_id := (v_result->>'id')::uuid;
  select * into v_existing from public.guest_reviews where id=v_id;
  if coalesce((v_result->>'idempotent')::boolean,false) then
    if v_existing.food_rating is distinct from p_food_rating
       or v_existing.value_rating is distinct from p_value_rating
       or v_existing.service_rating is distinct from p_service_rating
       or v_existing.ambience_rating is distinct from p_ambience_rating then
      raise exception 'REVIEW_ALREADY_SUBMITTED';
    end if;
    return v_result;
  end if;
  perform set_config('zingara.review_category_submission','true',true);
  update public.guest_reviews set food_rating=p_food_rating,value_rating=p_value_rating,
    service_rating=p_service_rating,ambience_rating=p_ambience_rating where id=v_id;
  update public.guest_review_events set metadata=metadata||jsonb_build_object(
    'food_rating',p_food_rating,'value_rating',p_value_rating,
    'service_rating',p_service_rating,'ambience_rating',p_ambience_rating
  ) where review_id=v_id and event_type='submitted';
  return v_result;
end $$;

revoke all on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text,integer,integer,integer,integer) to service_role;

alter table public.management_email_notification_routes
  drop constraint if exists management_email_notification_routes_key_check,
  add constraint management_email_notification_routes_key_check check (
    notification_key in ('corporate-enquiry','new-review-alert')
  );

do $$
declare v_nicky uuid; v_kaden uuid; v_fatima uuid;
begin
  select id into v_nicky from public.staff_profiles where active=true and lower(email)='nicky-annedebeer@zingara.co.za' limit 1;
  select id into v_kaden from public.staff_profiles where active=true and lower(email)='kaden@kaden.co.za' limit 1;
  select id into v_fatima from public.staff_profiles where active=true and lower(email)='fatima@zingara.co.za' limit 1;
  if v_nicky is null or v_kaden is null or v_fatima is null then
    raise exception 'Authoritative Nicky-Anne, Kaden and Fatima staff profiles are required for review alert routing';
  end if;
  insert into public.management_email_notification_routes (
    notification_key,enabled,to_staff_profile_ids,cc_staff_profile_ids
  ) values ('new-review-alert',true,array[v_nicky],array[v_kaden,v_fatima])
  on conflict (notification_key) do nothing;
end $$;

comment on table public.guest_review_replies is
  'Audited, retry-safe staff replies to verified guest reviews. Provider acceptance is required before sent status.';
