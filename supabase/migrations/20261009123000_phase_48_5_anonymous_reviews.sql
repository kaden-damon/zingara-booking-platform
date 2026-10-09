alter type public.communication_type
  add value if not exists 'review_anonymous_permission';

alter table public.guest_reviews
  add column if not exists publication_consent_mode text,
  add column if not exists publication_mode text;

update public.guest_reviews
   set publication_consent_mode = case
     when publication_consent then 'public'
     else 'private'
   end
 where publication_consent_mode is null;

alter table public.guest_reviews
  alter column publication_consent_mode set default 'private',
  alter column publication_consent_mode set not null;

alter table public.guest_reviews
  drop constraint if exists guest_reviews_publication_consent_mode_check,
  add constraint guest_reviews_publication_consent_mode_check
    check (publication_consent_mode in ('public', 'anonymous', 'private')),
  drop constraint if exists guest_reviews_publication_mode_check,
  add constraint guest_reviews_publication_mode_check
    check (publication_mode is null or publication_mode in ('named', 'anonymous'));

update public.guest_reviews
   set publication_mode = 'named'
 where moderation_status = 'published'
   and publication_consent = true
   and publication_mode is null;

create table if not exists public.review_anonymous_permission_requests (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.guest_reviews(id) on delete restrict,
  token_hash text not null unique,
  token_envelope jsonb not null,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'granted', 'declined', 'expired', 'failed')),
  requested_by_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists review_anonymous_permission_requests_status_idx
  on public.review_anonymous_permission_requests (status, expires_at);

create table if not exists public.historical_review_invitation_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end timestamptz not null,
  status text not null check (status in ('planned', 'blocked', 'running', 'paused', 'completed', 'failed')),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  suppressed_count integer not null default 0 check (suppressed_count >= 0),
  deduplicated_count integer not null default 0 check (deduplicated_count >= 0),
  breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array'),
  reason_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(reason_counts) = 'object'),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_anonymous_permission_requests enable row level security;
alter table public.historical_review_invitation_runs enable row level security;
revoke all on public.review_anonymous_permission_requests, public.historical_review_invitation_runs
  from public, anon, authenticated;
grant select, insert, update on public.review_anonymous_permission_requests,
  public.historical_review_invitation_runs to service_role;

drop index if exists public.guest_reviews_public_venue_idx;
drop index if exists public.guest_reviews_public_newest_idx;
drop index if exists public.guest_reviews_public_featured_idx;

create index guest_reviews_public_venue_idx
  on public.guest_reviews (venue, published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode = 'public' and publication_mode = 'named')
      or (publication_consent_mode = 'anonymous' and publication_mode = 'anonymous'));
create index guest_reviews_public_newest_idx
  on public.guest_reviews (published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode = 'public' and publication_mode = 'named')
      or (publication_consent_mode = 'anonymous' and publication_mode = 'anonymous'));
create index guest_reviews_public_featured_idx
  on public.guest_reviews (venue, featured, published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode = 'public' and publication_mode = 'named')
      or (publication_consent_mode = 'anonymous' and publication_mode = 'anonymous'));

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
     or (
       new.publication_consent_mode is distinct from old.publication_consent_mode
       and current_setting('zingara.review_permission_response', true) <> 'true'
     )
     or new.verified_guest is distinct from old.verified_guest
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at then
    raise exception 'REVIEW_GUEST_CONTENT_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_rating integer,
  p_review_text text,
  p_contact_requested boolean,
  p_publication_consent boolean,
  p_publication_consent_mode text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invitation public.review_invitations%rowtype;
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_show public.shows%rowtype;
  v_existing public.guest_reviews%rowtype;
  v_review public.guest_reviews%rowtype;
  v_display_name text;
  v_verified boolean;
  v_name_parts text[];
  v_mode text;
  v_now timestamptz := now();
begin
  v_mode := case
    when p_publication_consent_mode in ('public', 'anonymous', 'private') then p_publication_consent_mode
    when coalesce(p_publication_consent, false) then 'public'
    else 'private'
  end;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'REVIEW_RATING_REQUIRED'; end if;
  if p_review_text is null or length(trim(p_review_text)) < 20 or length(trim(p_review_text)) > 2000
     or p_review_text ~ '<\s*/?\s*[a-zA-Z][^>]*>'
     or p_review_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'REVIEW_TEXT_INVALID';
  end if;

  select * into v_invitation from public.review_invitations where token_hash = p_token_hash for update;
  if not found or v_invitation.status = 'revoked' then raise exception 'REVIEW_LINK_INVALID'; end if;
  if v_invitation.expires_at <= v_now or v_invitation.status = 'expired' then
    update public.review_invitations set status = 'expired', updated_at = v_now
     where id = v_invitation.id and status <> 'submitted';
    raise exception 'REVIEW_LINK_EXPIRED';
  end if;

  select * into v_booking from public.bookings where id = v_invitation.booking_id;
  select * into v_show from public.shows where id = v_invitation.show_id;
  select * into v_customer from public.customers where id = v_invitation.customer_id;
  v_verified := v_invitation.invitation_type = 'automated_verified' and exists (
    select 1 from public.tickets ticket where ticket.booking_id = v_booking.id
      and ticket.ticket_status::text = 'checked_in'
  );
  if v_booking.id is null or v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded', 'waitlisted', 'no_show')
     or v_booking.payment_status::text in ('cancelled', 'refunded')
     or v_booking.booking_reference ~* '^(qa|test|demo)[-_]'
     or v_show.id is null
     or ((v_show.date + v_show.time) at time zone 'Africa/Johannesburg') >= v_now then
    raise exception 'REVIEW_NOT_ELIGIBLE';
  end if;

  select * into v_existing from public.guest_reviews where invitation_id = v_invitation.id;
  if found then
    if v_existing.rating = p_rating and v_existing.review_text = trim(p_review_text)
       and v_existing.contact_requested = coalesce(p_contact_requested, false)
       and v_existing.publication_consent_mode = v_mode then
      return jsonb_build_object('id', v_existing.id, 'moderation_status', v_existing.moderation_status,
        'submitted_at', v_existing.submitted_at, 'idempotent', true);
    end if;
    raise exception 'REVIEW_ALREADY_SUBMITTED';
  end if;

  if v_invitation.invitation_type = 'automated_verified' then
    v_display_name := case when nullif(trim(v_customer.first_name), '') is null then 'Zingara Guest'
      when nullif(trim(v_customer.surname), '') is null then left(trim(v_customer.first_name), 60)
      else left(trim(v_customer.first_name), 60) || ' ' || left(upper(trim(v_customer.surname)), 1) || '.' end;
  else
    v_name_parts := regexp_split_to_array(trim(v_invitation.recipient_name), '\s+');
    v_display_name := case when coalesce(array_length(v_name_parts, 1), 0) = 0 then 'Zingara Guest'
      when array_length(v_name_parts, 1) = 1 then left(v_name_parts[1], 60)
      else left(v_name_parts[1], 60) || ' ' || upper(left(v_name_parts[array_length(v_name_parts, 1)], 1)) || '.' end;
  end if;

  insert into public.guest_reviews (
    invitation_id,booking_id,customer_id,show_id,venue,public_display_name,rating,review_text,
    contact_requested,publication_consent,publication_consented_at,publication_consent_mode,verified_guest
  ) values (
    v_invitation.id,v_booking.id,v_booking.customer_id,v_show.id,v_show.venue,v_display_name,p_rating,
    trim(p_review_text),coalesce(p_contact_requested,false),v_mode = 'public',
    case when v_mode in ('public','anonymous') then v_now else null end,v_mode,v_verified
  ) returning * into v_review;
  update public.review_invitations set status='submitted',submitted_at=v_now,updated_at=v_now where id=v_invitation.id;
  insert into public.guest_review_events (review_id,event_type,from_status,to_status,metadata)
  values (v_review.id,'submitted',null,'needs_review',jsonb_build_object(
    'contact_requested',v_review.contact_requested,'publication_consent_mode',v_mode,
    'rating',v_review.rating,'verified_guest',v_review.verified_guest,'invitation_type',v_invitation.invitation_type));
  return jsonb_build_object('id',v_review.id,'moderation_status',v_review.moderation_status,
    'submitted_at',v_review.submitted_at,'idempotent',false);
end;
$$;

create or replace function public.submit_verified_guest_review(
  p_token_hash text,p_rating integer,p_review_text text,p_contact_requested boolean,p_publication_consent boolean
)
returns jsonb language sql security definer set search_path = public as $$
  select public.submit_verified_guest_review(
    p_token_hash,p_rating,p_review_text,p_contact_requested,p_publication_consent,
    case when coalesce(p_publication_consent,false) then 'public' else 'private' end
  );
$$;

create or replace function public.moderate_guest_review(
  p_review_id uuid,p_expected_revision integer,p_action text,p_note text,p_actor_staff_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_review public.guest_reviews%rowtype;
  v_status text;
  v_event text;
  v_from_status text;
  v_now timestamptz := now();
begin
  if p_action not in ('publish','publish_anonymous','do_not_publish','unpublish') then raise exception 'REVIEW_MODERATION_ACTION_INVALID'; end if;
  select * into v_review from public.guest_reviews where id=p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.revision <> p_expected_revision then raise exception 'REVIEW_STALE_REVISION'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'REVIEW_MODERATION_NOTE_TOO_LONG'; end if;
  if p_action='publish' and v_review.publication_consent_mode <> 'public' then raise exception 'REVIEW_PUBLICATION_CONSENT_REQUIRED'; end if;
  if p_action='publish_anonymous' and v_review.publication_consent_mode <> 'anonymous' then raise exception 'REVIEW_ANONYMOUS_CONSENT_REQUIRED'; end if;
  if p_action='unpublish' and v_review.moderation_status <> 'published' then raise exception 'REVIEW_MODERATION_ACTION_INVALID'; end if;
  v_from_status := v_review.moderation_status;
  v_status := case when p_action in ('publish','publish_anonymous') then 'published' else 'not_published' end;
  v_event := case when p_action='publish' then 'published' when p_action='publish_anonymous' then 'published_anonymous'
    when p_action='unpublish' then 'unpublished' else 'not_published' end;
  update public.guest_reviews set moderation_status=v_status,moderation_note=nullif(trim(coalesce(p_note,'')),''),
    moderated_by=p_actor_staff_profile_id,moderated_at=v_now,
    publication_mode=case when p_action='publish' then 'named' when p_action='publish_anonymous' then 'anonymous'
      when p_action in ('unpublish','do_not_publish') then null else publication_mode end,
    published_at=case when p_action in ('publish','publish_anonymous') then coalesce(published_at,v_now) else published_at end,
    unpublished_at=case when p_action='unpublish' then v_now else unpublished_at end,
    not_published_at=case when p_action='do_not_publish' then v_now else not_published_at end,
    featured=case when p_action in ('publish','publish_anonymous') then featured else false end,
    revision=revision+1,updated_at=v_now where id=p_review_id returning * into v_review;
  insert into public.guest_review_events (review_id,event_type,actor_staff_profile_id,from_status,to_status,note,metadata)
  values (v_review.id,v_event,p_actor_staff_profile_id,v_from_status,v_review.moderation_status,
    nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('publication_mode',v_review.publication_mode));
  return jsonb_build_object('id',v_review.id,'moderation_status',v_review.moderation_status,
    'publication_mode',v_review.publication_mode,'moderated_at',v_review.moderated_at,'revision',v_review.revision);
end;
$$;

create or replace function public.respond_to_review_anonymous_permission(p_token_hash text,p_granted boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.review_anonymous_permission_requests%rowtype;
  v_review public.guest_reviews%rowtype;
  v_now timestamptz := now();
begin
  select * into v_request from public.review_anonymous_permission_requests where token_hash=p_token_hash for update;
  if not found then raise exception 'REVIEW_PERMISSION_LINK_INVALID'; end if;
  if v_request.status in ('granted','declined') then
    return jsonb_build_object('status',v_request.status,'idempotent',true);
  end if;
  if v_request.status <> 'pending' or v_request.expires_at <= v_now then
    update public.review_anonymous_permission_requests set status='expired',updated_at=v_now where id=v_request.id;
    raise exception 'REVIEW_PERMISSION_LINK_EXPIRED';
  end if;
  select * into v_review from public.guest_reviews where id=v_request.review_id for update;
  if not found or v_review.publication_consent_mode <> 'private' then raise exception 'REVIEW_PERMISSION_NOT_AVAILABLE'; end if;
  perform set_config('zingara.review_permission_response','true',true);
  if coalesce(p_granted,false) then
    update public.guest_reviews set publication_consent_mode='anonymous',publication_consented_at=v_now,
      revision=revision+1,updated_at=v_now where id=v_review.id;
  end if;
  update public.review_anonymous_permission_requests set status=case when p_granted then 'granted' else 'declined' end,
    responded_at=v_now,updated_at=v_now where id=v_request.id;
  insert into public.guest_review_events (review_id,event_type,from_status,to_status,metadata)
  values (v_review.id,case when p_granted then 'anonymous_permission_granted' else 'anonymous_permission_declined' end,
    v_review.moderation_status,v_review.moderation_status,jsonb_build_object('permission_request_id',v_request.id));
  return jsonb_build_object('status',case when p_granted then 'granted' else 'declined' end,'idempotent',false);
end;
$$;

create or replace function public.set_guest_review_featured(
  p_review_id uuid,p_expected_revision integer,p_featured boolean,p_actor_staff_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_review public.guest_reviews%rowtype; v_now timestamptz := now();
begin
  select * into v_review from public.guest_reviews where id=p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status <> 'published' or not (
    (v_review.publication_consent_mode='public' and v_review.publication_mode='named') or
    (v_review.publication_consent_mode='anonymous' and v_review.publication_mode='anonymous')
  ) then raise exception 'REVIEW_FEATURE_REQUIRES_PUBLISHED_CONSENT'; end if;
  if v_review.featured=coalesce(p_featured,false) then return jsonb_build_object('id',v_review.id,'featured',v_review.featured,'revision',v_review.revision,'idempotent',true); end if;
  if v_review.revision<>p_expected_revision then raise exception 'REVIEW_STALE_REVISION'; end if;
  update public.guest_reviews set featured=coalesce(p_featured,false),moderated_by=p_actor_staff_profile_id,
    moderated_at=v_now,revision=revision+1,updated_at=v_now where id=p_review_id returning * into v_review;
  insert into public.guest_review_events (review_id,event_type,actor_staff_profile_id,from_status,to_status)
  values (v_review.id,case when v_review.featured then 'featured' else 'unfeatured' end,p_actor_staff_profile_id,v_review.moderation_status,v_review.moderation_status);
  return jsonb_build_object('id',v_review.id,'featured',v_review.featured,'revision',v_review.revision,'idempotent',false);
end;
$$;

create or replace function public.get_public_review_aggregates(p_venue text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if p_venue is not null and p_venue not in ('cape-town','johannesburg') then raise exception 'PUBLIC_REVIEW_VENUE_INVALID'; end if;
  with eligible as (
    select rating,venue from public.guest_reviews where moderation_status='published'
      and ((publication_consent_mode='public' and publication_mode='named')
        or (publication_consent_mode='anonymous' and publication_mode='anonymous'))
      and (p_venue is null or venue=p_venue)
  ), venue_stats as (
    select venue,count(*)::integer published_count,coalesce(round(avg(rating)::numeric,2),0) average_rating
    from eligible group by venue
  )
  select jsonb_build_object('publishedCount',count(*)::integer,'averageRating',coalesce(round(avg(rating)::numeric,2),0),
    'ratingDistribution',jsonb_build_object('1',count(*) filter(where rating=1),'2',count(*) filter(where rating=2),
      '3',count(*) filter(where rating=3),'4',count(*) filter(where rating=4),'5',count(*) filter(where rating=5)),
    'venues',coalesce((select jsonb_object_agg(venue,jsonb_build_object('publishedCount',published_count,'averageRating',average_rating)) from venue_stats),'{}'::jsonb))
  into v_result from eligible;
  return v_result;
end;
$$;

revoke all on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function public.respond_to_review_anonymous_permission(text,boolean) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text) to service_role;
grant execute on function public.respond_to_review_anonymous_permission(text,boolean) to service_role;

comment on column public.guest_reviews.publication_consent_mode is
  'Explicit guest publication choice. Historical false consent remains private and is never interpreted as anonymous consent.';
comment on column public.guest_reviews.publication_mode is
  'Staff moderation publication presentation: named or anonymous. Null means the review is not public.';
comment on table public.review_anonymous_permission_requests is
  'One auditable, guest-specific anonymous-publication permission request per review; plaintext tokens are never stored.';
comment on table public.historical_review_invitation_runs is
  'Durable planning and bounded execution evidence for explicitly authorised historical review invitation operations.';
