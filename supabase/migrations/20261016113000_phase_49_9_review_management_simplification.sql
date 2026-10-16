-- Phase 49.9: bounded review filters, auditable contact state, and reply-derived contact evidence.

alter table public.guest_reviews
  add column if not exists contacted_at timestamptz,
  add column if not exists contacted_by uuid references public.staff_profiles(id) on delete restrict,
  add column if not exists contact_method text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by_name text;

alter table public.guest_reviews
  drop constraint if exists guest_reviews_contact_method_check,
  add constraint guest_reviews_contact_method_check check (
    contact_method is null or contact_method in ('manual_follow_up', 'zingara_email')
  ),
  drop constraint if exists guest_reviews_contact_state_check,
  add constraint guest_reviews_contact_state_check check (
    (contacted_at is null and contacted_by is null and contact_method is null)
    or (contacted_at is not null and contacted_by is not null and contact_method is not null)
  );

alter table public.guest_review_events
  drop constraint if exists guest_review_events_event_type_check,
  add constraint guest_review_events_event_type_check check (
    event_type in (
      'submitted', 'published', 'published_anonymous', 'not_published', 'unpublished',
      'featured', 'unfeatured', 'moderation_note_changed',
      'anonymous_permission_granted', 'anonymous_permission_declined',
      'contact_marked', 'contact_undone', 'reply_sent'
    )
  );

with latest_reply as (
  select distinct on (review_id)
    review_id, actor_staff_profile_id, actor_name, sent_at
  from public.guest_review_replies
  where status = 'sent' and sent_at is not null
  order by review_id, sent_at desc, id desc
)
update public.guest_reviews review
set replied_at = latest_reply.sent_at,
    replied_by_name = latest_reply.actor_name,
    contacted_at = coalesce(review.contacted_at, latest_reply.sent_at),
    contacted_by = coalesce(review.contacted_by, latest_reply.actor_staff_profile_id),
    contact_method = coalesce(review.contact_method, 'zingara_email')
from latest_reply
where review.id = latest_reply.review_id
  and (
    review.replied_at is distinct from latest_reply.sent_at
    or review.replied_by_name is distinct from latest_reply.actor_name
    or review.contacted_at is null
  );

create or replace function public.set_guest_review_contacted(
  p_review_id uuid,
  p_expected_revision integer,
  p_actor_staff_profile_id uuid,
  p_contacted boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_review public.guest_reviews%rowtype;
  v_now timestamptz := now();
begin
  select * into v_review from public.guest_reviews where id = p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;

  if coalesce(p_contacted, false) and v_review.contacted_at is not null then
    return jsonb_build_object('id', v_review.id, 'contacted_at', v_review.contacted_at,
      'contact_method', v_review.contact_method, 'revision', v_review.revision, 'idempotent', true);
  end if;
  if not coalesce(p_contacted, false) and v_review.contacted_at is null then
    return jsonb_build_object('id', v_review.id, 'contacted_at', null,
      'contact_method', null, 'revision', v_review.revision, 'idempotent', true);
  end if;
  if v_review.revision <> p_expected_revision then raise exception 'REVIEW_STALE_REVISION'; end if;
  if not coalesce(p_contacted, false) and v_review.replied_at is not null then
    raise exception 'REVIEW_CONTACT_UNDO_HAS_REPLY';
  end if;

  update public.guest_reviews
  set contacted_at = case when p_contacted then v_now else null end,
      contacted_by = case when p_contacted then p_actor_staff_profile_id else null end,
      contact_method = case when p_contacted then 'manual_follow_up' else null end,
      revision = revision + 1,
      updated_at = v_now
  where id = p_review_id
  returning * into v_review;

  insert into public.guest_review_events (
    review_id, event_type, actor_staff_profile_id, from_status, to_status, metadata
  ) values (
    v_review.id,
    case when p_contacted then 'contact_marked' else 'contact_undone' end,
    p_actor_staff_profile_id,
    v_review.moderation_status,
    v_review.moderation_status,
    jsonb_build_object('contact_method', case when p_contacted then 'manual_follow_up' else null end)
  );

  return jsonb_build_object('id', v_review.id, 'contacted_at', v_review.contacted_at,
    'contact_method', v_review.contact_method, 'revision', v_review.revision, 'idempotent', false);
end;
$$;

create or replace function public.complete_guest_review_reply(
  p_reply_id uuid,
  p_status text,
  p_error text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_reply public.guest_review_replies%rowtype;
  v_now timestamptz := now();
begin
  if p_status not in ('sent', 'failed') then raise exception 'REVIEW_REPLY_STATUS_INVALID'; end if;

  update public.guest_review_replies
  set status = p_status,
      sent_at = case when p_status = 'sent' then v_now else null end,
      last_error = case when p_status = 'failed' then left(p_error, 1000) else null end,
      updated_at = v_now
  where id = p_reply_id and status = 'processing'
  returning * into v_reply;

  if not found or p_status <> 'sent' then return; end if;

  update public.guest_reviews
  set contacted_at = coalesce(contacted_at, v_now),
      contacted_by = coalesce(contacted_by, v_reply.actor_staff_profile_id),
      contact_method = coalesce(contact_method, 'zingara_email'),
      replied_at = v_now,
      replied_by_name = v_reply.actor_name,
      revision = revision + 1,
      updated_at = v_now
  where id = v_reply.review_id;

  insert into public.guest_review_events (
    review_id, event_type, actor_staff_profile_id, from_status, to_status, metadata
  )
  select id, 'reply_sent', v_reply.actor_staff_profile_id, moderation_status, moderation_status,
    jsonb_build_object('reply_id', v_reply.id, 'contact_method', 'zingara_email')
  from public.guest_reviews where id = v_reply.review_id;
end;
$$;

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
    p_token_hash, p_rating, p_review_text,
    coalesce(p_contact_requested, false) and p_rating between 1 and 3,
    p_publication_consent, p_publication_consent_mode,
    p_privacy_requested, p_publication_policy_version
  );
  v_id := (v_result->>'id')::uuid;
  select * into v_existing from public.guest_reviews where id = v_id;
  if coalesce((v_result->>'idempotent')::boolean, false) then
    if v_existing.food_rating is distinct from p_food_rating
       or v_existing.value_rating is distinct from p_value_rating
       or v_existing.service_rating is distinct from p_service_rating
       or v_existing.ambience_rating is distinct from p_ambience_rating then
      raise exception 'REVIEW_ALREADY_SUBMITTED';
    end if;
    return v_result;
  end if;
  perform set_config('zingara.review_category_submission', 'true', true);
  update public.guest_reviews set food_rating = p_food_rating, value_rating = p_value_rating,
    service_rating = p_service_rating, ambience_rating = p_ambience_rating where id = v_id;
  update public.guest_review_events set metadata = metadata || jsonb_build_object(
    'food_rating', p_food_rating, 'value_rating', p_value_rating,
    'service_rating', p_service_rating, 'ambience_rating', p_ambience_rating
  ) where review_id = v_id and event_type = 'submitted';
  return v_result;
end;
$$;

revoke all on function public.set_guest_review_contacted(uuid,integer,uuid,boolean) from public, anon, authenticated;
revoke all on function public.complete_guest_review_reply(uuid,text,text) from public, anon, authenticated;
revoke all on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.set_guest_review_contacted(uuid,integer,uuid,boolean) to service_role;
grant execute on function public.complete_guest_review_reply(uuid,text,text) to service_role;
grant execute on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text,integer,integer,integer,integer) to service_role;

comment on column public.guest_reviews.contacted_at is
  'First authoritative follow-up evidence: a provider-accepted Zingara reply or an audited manual contact mark.';
comment on column public.guest_reviews.replied_at is
  'Most recent provider-accepted Zingara review reply; used for bounded server-side review filtering.';
