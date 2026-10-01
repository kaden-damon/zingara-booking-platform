create table if not exists public.review_invitations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_envelope jsonb not null check (jsonb_typeof(token_envelope) = 'object'),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'submitted')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  submitted_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.guest_reviews (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  invitation_id uuid not null unique references public.review_invitations(id) on delete restrict,
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  venue text not null check (venue in ('cape-town', 'johannesburg')),
  public_display_name text not null check (length(trim(public_display_name)) between 1 and 80),
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (length(trim(review_text)) between 20 and 2000),
  contact_requested boolean not null default false,
  publication_consent boolean not null default false,
  publication_consented_at timestamptz,
  moderation_status text not null default 'needs_review' check (moderation_status in ('needs_review', 'published', 'not_published')),
  moderation_note text,
  moderated_by uuid references public.staff_profiles(id) on delete restrict,
  moderated_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  not_published_at timestamptz,
  featured boolean not null default false,
  verified_guest boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not publication_consent or publication_consented_at is not null),
  check (moderation_status <> 'published' or publication_consent),
  check (moderation_status <> 'published' or published_at is not null)
);

create table if not exists public.guest_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.guest_reviews(id) on delete restrict,
  event_type text not null check (event_type in ('submitted', 'published', 'not_published', 'unpublished', 'featured', 'unfeatured', 'moderation_note_changed')),
  actor_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists review_invitations_status_idx
  on public.review_invitations (status, expires_at);
create index if not exists guest_reviews_moderation_idx
  on public.guest_reviews (moderation_status, submitted_at desc);
create index if not exists guest_reviews_public_idx
  on public.guest_reviews (venue, published_at desc)
  where moderation_status = 'published' and publication_consent = true;
create index if not exists guest_reviews_public_newest_idx
  on public.guest_reviews (published_at desc, public_id desc)
  where moderation_status = 'published' and publication_consent = true;
create index if not exists guest_reviews_public_featured_idx
  on public.guest_reviews (venue, featured, published_at desc, public_id desc)
  where moderation_status = 'published' and publication_consent = true;
create index if not exists guest_review_events_review_idx
  on public.guest_review_events (review_id, occurred_at desc);

create or replace function public.protect_guest_review_wording()
returns trigger
language plpgsql
set search_path = public
as $$
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
     or new.verified_guest is distinct from old.verified_guest
     or new.submitted_at is distinct from old.submitted_at
     or new.created_at is distinct from old.created_at then
    raise exception 'REVIEW_GUEST_CONTENT_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists guest_reviews_protect_guest_wording on public.guest_reviews;
create trigger guest_reviews_protect_guest_wording
before update on public.guest_reviews
for each row execute function public.protect_guest_review_wording();

create or replace function public.submit_verified_guest_review(
  p_token_hash text,
  p_rating integer,
  p_review_text text,
  p_contact_requested boolean,
  p_publication_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.review_invitations%rowtype;
  v_booking public.bookings%rowtype;
  v_customer public.customers%rowtype;
  v_show public.shows%rowtype;
  v_existing public.guest_reviews%rowtype;
  v_review public.guest_reviews%rowtype;
  v_display_name text;
  v_now timestamptz := now();
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'REVIEW_RATING_REQUIRED';
  end if;

  if p_review_text is null
     or length(trim(p_review_text)) < 20
     or length(trim(p_review_text)) > 2000
     or p_review_text ~ '<\s*/?\s*[a-zA-Z][^>]*>'
     or p_review_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'REVIEW_TEXT_INVALID';
  end if;

  select * into v_invitation
    from public.review_invitations
   where token_hash = p_token_hash
   for update;

  if not found or v_invitation.status = 'revoked' then
    raise exception 'REVIEW_LINK_INVALID';
  end if;

  if v_invitation.expires_at <= v_now or v_invitation.status = 'expired' then
    update public.review_invitations
       set status = 'expired', updated_at = v_now
     where id = v_invitation.id and status <> 'submitted';
    raise exception 'REVIEW_LINK_EXPIRED';
  end if;

  select * into v_booking from public.bookings where id = v_invitation.booking_id;
  select * into v_show from public.shows where id = v_invitation.show_id;
  select * into v_customer from public.customers where id = v_invitation.customer_id;

  if v_booking.id is null
     or v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded', 'waitlisted', 'no_show')
     or v_booking.payment_status::text in ('cancelled', 'refunded')
     or v_show.id is null
     or ((v_show.date + v_show.time) at time zone 'Africa/Johannesburg') >= v_now
     or not exists (
       select 1 from public.tickets t
        where t.booking_id = v_booking.id and t.ticket_status::text = 'checked_in'
     ) then
    raise exception 'REVIEW_NOT_ELIGIBLE';
  end if;

  select * into v_existing
    from public.guest_reviews
   where invitation_id = v_invitation.id;

  if found then
    if v_existing.rating = p_rating
       and v_existing.review_text = trim(p_review_text)
       and v_existing.contact_requested = coalesce(p_contact_requested, false)
       and v_existing.publication_consent = coalesce(p_publication_consent, false) then
      return jsonb_build_object(
        'id', v_existing.id,
        'moderation_status', v_existing.moderation_status,
        'submitted_at', v_existing.submitted_at,
        'idempotent', true
      );
    end if;
    raise exception 'REVIEW_ALREADY_SUBMITTED';
  end if;

  v_display_name := case
    when nullif(trim(v_customer.first_name), '') is null then 'Zingara Guest'
    when nullif(trim(v_customer.surname), '') is null then left(trim(v_customer.first_name), 60)
    else left(trim(v_customer.first_name), 60) || ' ' || left(upper(trim(v_customer.surname)), 1) || '.'
  end;

  insert into public.guest_reviews (
    invitation_id, booking_id, customer_id, show_id, venue,
    public_display_name, rating, review_text, contact_requested,
    publication_consent, publication_consented_at
  ) values (
    v_invitation.id, v_booking.id, v_booking.customer_id, v_show.id, v_show.venue,
    v_display_name, p_rating, trim(p_review_text), coalesce(p_contact_requested, false),
    coalesce(p_publication_consent, false),
    case when coalesce(p_publication_consent, false) then v_now else null end
  ) returning * into v_review;

  update public.review_invitations
     set status = 'submitted', submitted_at = v_now, updated_at = v_now
   where id = v_invitation.id;

  insert into public.guest_review_events (
    review_id, event_type, from_status, to_status, metadata
  ) values (
    v_review.id, 'submitted', null, 'needs_review',
    jsonb_build_object(
      'contact_requested', v_review.contact_requested,
      'publication_consent', v_review.publication_consent,
      'rating', v_review.rating,
      'verified_guest', true
    )
  );

  return jsonb_build_object(
    'id', v_review.id,
    'moderation_status', v_review.moderation_status,
    'submitted_at', v_review.submitted_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.moderate_guest_review(
  p_review_id uuid,
  p_expected_revision integer,
  p_action text,
  p_note text,
  p_actor_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.guest_reviews%rowtype;
  v_status text;
  v_event text;
  v_from_status text;
  v_now timestamptz := now();
begin
  if p_action not in ('publish', 'do_not_publish', 'unpublish') then
    raise exception 'REVIEW_MODERATION_ACTION_INVALID';
  end if;

  select * into v_review
    from public.guest_reviews
   where id = p_review_id
   for update;

  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.revision <> p_expected_revision then raise exception 'REVIEW_STALE_REVISION'; end if;
  if length(coalesce(p_note, '')) > 1000 then raise exception 'REVIEW_MODERATION_NOTE_TOO_LONG'; end if;
  if p_action = 'publish' and not v_review.publication_consent then
    raise exception 'REVIEW_PUBLICATION_CONSENT_REQUIRED';
  end if;
  if p_action = 'unpublish' and v_review.moderation_status <> 'published' then
    raise exception 'REVIEW_MODERATION_ACTION_INVALID';
  end if;

  v_from_status := v_review.moderation_status;

  v_status := case when p_action = 'publish' then 'published' else 'not_published' end;
  v_event := case
    when p_action = 'publish' then 'published'
    when p_action = 'unpublish' then 'unpublished'
    else 'not_published'
  end;

  update public.guest_reviews
     set moderation_status = v_status,
         moderation_note = nullif(trim(coalesce(p_note, '')), ''),
         moderated_by = p_actor_staff_profile_id,
         moderated_at = v_now,
         published_at = case when p_action = 'publish' then coalesce(published_at, v_now) else published_at end,
         unpublished_at = case when p_action = 'unpublish' then v_now else unpublished_at end,
         not_published_at = case when p_action = 'do_not_publish' then v_now else not_published_at end,
         featured = case when p_action = 'publish' then featured else false end,
         revision = revision + 1,
         updated_at = v_now
   where id = p_review_id
   returning * into v_review;

  insert into public.guest_review_events (
    review_id, event_type, actor_staff_profile_id, from_status, to_status, note
  ) values (
    v_review.id, v_event, p_actor_staff_profile_id,
    v_from_status,
    v_review.moderation_status,
    nullif(trim(coalesce(p_note, '')), '')
  );

  return jsonb_build_object(
    'id', v_review.id,
    'moderation_status', v_review.moderation_status,
    'moderated_at', v_review.moderated_at,
    'revision', v_review.revision
  );
end;
$$;

create or replace function public.set_guest_review_featured(
  p_review_id uuid,
  p_expected_revision integer,
  p_featured boolean,
  p_actor_staff_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.guest_reviews%rowtype;
  v_now timestamptz := now();
begin
  select * into v_review
    from public.guest_reviews
   where id = p_review_id
   for update;

  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status <> 'published' or not v_review.publication_consent then
    raise exception 'REVIEW_FEATURE_REQUIRES_PUBLISHED_CONSENT';
  end if;
  if v_review.featured = coalesce(p_featured, false) then
    return jsonb_build_object(
      'id', v_review.id,
      'featured', v_review.featured,
      'revision', v_review.revision,
      'idempotent', true
    );
  end if;
  if v_review.revision <> p_expected_revision then raise exception 'REVIEW_STALE_REVISION'; end if;

  update public.guest_reviews
     set featured = coalesce(p_featured, false),
         moderated_by = p_actor_staff_profile_id,
         moderated_at = v_now,
         revision = revision + 1,
         updated_at = v_now
   where id = p_review_id
   returning * into v_review;

  insert into public.guest_review_events (
    review_id, event_type, actor_staff_profile_id, from_status, to_status
  ) values (
    v_review.id,
    case when v_review.featured then 'featured' else 'unfeatured' end,
    p_actor_staff_profile_id,
    v_review.moderation_status,
    v_review.moderation_status
  );

  return jsonb_build_object(
    'id', v_review.id,
    'featured', v_review.featured,
    'revision', v_review.revision,
    'idempotent', false
  );
end;
$$;

create or replace function public.get_public_review_aggregates(
  p_venue text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_venue is not null and p_venue not in ('cape-town', 'johannesburg') then
    raise exception 'PUBLIC_REVIEW_VENUE_INVALID';
  end if;

  with eligible as (
    select rating, venue
      from public.guest_reviews
     where moderation_status = 'published'
       and publication_consent = true
       and (p_venue is null or venue = p_venue)
  ),
  venue_stats as (
    select venue,
           count(*)::integer as published_count,
           coalesce(round(avg(rating)::numeric, 2), 0) as average_rating
      from eligible
     group by venue
  )
  select jsonb_build_object(
    'publishedCount', count(*)::integer,
    'averageRating', coalesce(round(avg(rating)::numeric, 2), 0),
    'ratingDistribution', jsonb_build_object(
      '1', count(*) filter (where rating = 1),
      '2', count(*) filter (where rating = 2),
      '3', count(*) filter (where rating = 3),
      '4', count(*) filter (where rating = 4),
      '5', count(*) filter (where rating = 5)
    ),
    'venues', coalesce((
      select jsonb_object_agg(
        venue,
        jsonb_build_object(
          'publishedCount', published_count,
          'averageRating', average_rating
        )
      )
      from venue_stats
    ), '{}'::jsonb)
  ) into v_result
  from eligible;

  return v_result;
end;
$$;

alter table public.review_invitations enable row level security;
alter table public.guest_reviews enable row level security;
alter table public.guest_review_events enable row level security;

revoke all on public.review_invitations from anon, authenticated;
revoke all on public.guest_reviews from anon, authenticated;
revoke all on public.guest_review_events from anon, authenticated;
revoke all on public.review_invitations from service_role;
revoke all on public.guest_reviews from service_role;
revoke all on public.guest_review_events from service_role;
grant select, insert, update on public.review_invitations to service_role;
grant select, insert, update on public.guest_reviews to service_role;
grant select, insert on public.guest_review_events to service_role;
revoke all on function public.submit_verified_guest_review(text, integer, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.moderate_guest_review(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.set_guest_review_featured(uuid, integer, boolean, uuid) from public, anon, authenticated;
revoke all on function public.get_public_review_aggregates(text) from public, anon, authenticated;
revoke all on function public.protect_guest_review_wording() from public, anon, authenticated;
grant execute on function public.submit_verified_guest_review(text, integer, text, boolean, boolean) to service_role;
grant execute on function public.moderate_guest_review(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.set_guest_review_featured(uuid, integer, boolean, uuid) to service_role;
grant execute on function public.get_public_review_aggregates(text) to service_role;

comment on table public.review_invitations is
  'One opaque verified-review identity per eligible booking contact. Only token hashes are searchable; recoverable tokens are encrypted for idempotent workflow delivery.';
comment on table public.guest_reviews is
  'Immutable guest-authored rating and wording with separate publication consent and staff moderation state.';
comment on table public.guest_review_events is
  'Immutable submission and moderation history. Ordinary moderation never deletes or edits guest wording.';
