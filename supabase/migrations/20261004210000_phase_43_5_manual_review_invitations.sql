alter table public.review_invitations
  add column if not exists invitation_type text not null default 'automated_verified',
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists normalized_email text,
  add column if not exists created_by_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  add column if not exists sent_at timestamptz,
  add column if not exists last_link_copied_at timestamptz;

update public.review_invitations invitation
set recipient_name = coalesce(
      nullif(trim(concat_ws(' ', customer.first_name, customer.surname)), ''),
      'Zingara Guest'
    ),
    recipient_email = nullif(lower(trim(customer.email)), ''),
    normalized_email = nullif(lower(trim(customer.email)), '')
from public.customers customer
where invitation.customer_id = customer.id
  and invitation.recipient_name is null;

update public.review_invitations
set recipient_name = 'Zingara Guest'
where recipient_name is null;

alter table public.review_invitations
  alter column recipient_name set not null;

alter table public.review_invitations
  drop constraint if exists review_invitations_booking_id_key,
  drop constraint if exists review_invitations_invitation_type_check,
  add constraint review_invitations_invitation_type_check
    check (invitation_type in ('automated_verified', 'manual_email', 'manual_link')),
  add constraint review_invitations_manual_email_check
    check (
      invitation_type <> 'manual_email'
      or (recipient_email is not null and normalized_email is not null)
    );

drop index if exists review_invitations_one_automated_per_booking_idx;
create unique index review_invitations_one_automated_per_booking_idx
  on public.review_invitations (booking_id)
  where invitation_type = 'automated_verified';

drop index if exists review_invitations_manual_email_identity_idx;
create unique index review_invitations_manual_email_identity_idx
  on public.review_invitations (booking_id, normalized_email)
  where invitation_type = 'manual_email' and normalized_email is not null;

create index if not exists review_invitations_booking_created_idx
  on public.review_invitations (booking_id, created_at desc);

alter table public.guest_reviews
  drop constraint if exists guest_reviews_booking_id_key;

create table if not exists public.review_invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.review_invitations(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'email_sent', 'email_failed', 'link_copied')),
  actor_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists review_invitation_events_invitation_idx
  on public.review_invitation_events (invitation_id, occurred_at desc);

alter table public.review_invitation_events enable row level security;
revoke all on public.review_invitation_events from public, anon, authenticated, service_role;
grant select, insert on public.review_invitation_events to service_role;

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
  v_verified boolean;
  v_name_parts text[];
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
  v_verified := v_invitation.invitation_type = 'automated_verified';

  if v_booking.id is null
     or v_booking.archived_at is not null
     or v_booking.booking_status::text in ('cancelled', 'refunded', 'waitlisted', 'no_show')
     or v_booking.payment_status::text in ('cancelled', 'refunded')
     or v_booking.booking_reference ~* '^(qa|test|demo)[-_]'
     or v_show.id is null
     or ((v_show.date + v_show.time) at time zone 'Africa/Johannesburg') >= v_now
     or (
       v_verified and not exists (
         select 1 from public.tickets ticket
          where ticket.booking_id = v_booking.id
            and ticket.ticket_status::text = 'checked_in'
       )
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

  if v_verified then
    v_display_name := case
      when nullif(trim(v_customer.first_name), '') is null then 'Zingara Guest'
      when nullif(trim(v_customer.surname), '') is null then left(trim(v_customer.first_name), 60)
      else left(trim(v_customer.first_name), 60) || ' ' || left(upper(trim(v_customer.surname)), 1) || '.'
    end;
  else
    v_name_parts := regexp_split_to_array(trim(v_invitation.recipient_name), '\s+');
    v_display_name := case
      when coalesce(array_length(v_name_parts, 1), 0) = 0 then 'Zingara Guest'
      when array_length(v_name_parts, 1) = 1 then left(v_name_parts[1], 60)
      else left(v_name_parts[1], 60) || ' ' || upper(left(v_name_parts[array_length(v_name_parts, 1)], 1)) || '.'
    end;
  end if;

  insert into public.guest_reviews (
    invitation_id, booking_id, customer_id, show_id, venue,
    public_display_name, rating, review_text, contact_requested,
    publication_consent, publication_consented_at, verified_guest
  ) values (
    v_invitation.id, v_booking.id, v_booking.customer_id, v_show.id, v_show.venue,
    v_display_name, p_rating, trim(p_review_text), coalesce(p_contact_requested, false),
    coalesce(p_publication_consent, false),
    case when coalesce(p_publication_consent, false) then v_now else null end,
    v_verified
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
      'verified_guest', v_review.verified_guest,
      'invitation_type', v_invitation.invitation_type
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

comment on table public.review_invitation_events is
  'Immutable staff-attributed lifecycle evidence for manually created review invitations. Token material is never recorded.';
