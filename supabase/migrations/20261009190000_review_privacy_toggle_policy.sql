alter table public.guest_reviews
  add column if not exists review_privacy_requested boolean,
  add column if not exists review_publication_policy_version text;

alter table public.guest_reviews
  drop constraint if exists guest_reviews_policy_choice_check,
  add constraint guest_reviews_policy_choice_check check (
    (review_privacy_requested is null and review_publication_policy_version is null)
    or (review_privacy_requested is not null and nullif(trim(review_publication_policy_version), '') is not null)
  ),
  drop constraint if exists guest_reviews_publication_state_check,
  add constraint guest_reviews_publication_state_check check (
    moderation_status <> 'published'
    or (
      publication_consent_mode = 'public'
      and publication_mode = 'named'
      and publication_consent = true
      and (
        review_publication_policy_version is null
        or (
          review_publication_policy_version = 'review-publication-2026-10-09-v1'
          and review_privacy_requested = false
        )
      )
    )
    or (
      publication_mode = 'anonymous'
      and (
        (
          publication_consent_mode = 'anonymous'
          and publication_consent = false
          and publication_consented_at is not null
        )
        or (
          publication_consent_mode = 'public'
          and publication_consent = true
          and review_privacy_requested = false
          and review_publication_policy_version = 'review-publication-2026-10-09-v1'
        )
      )
    )
  );

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
       and coalesce(current_setting('zingara.review_permission_response', true), '') <> 'true'
     )
     or (
       (new.review_privacy_requested is distinct from old.review_privacy_requested
         or new.review_publication_policy_version is distinct from old.review_publication_policy_version)
       and coalesce(current_setting('zingara.review_policy_submission', true), '') <> 'true'
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
  p_publication_consent_mode text,
  p_privacy_requested boolean,
  p_publication_policy_version text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
  v_review_id uuid;
  v_existing public.guest_reviews%rowtype;
  v_expected_mode text;
begin
  if p_privacy_requested is null
     or p_publication_policy_version <> 'review-publication-2026-10-09-v1' then
    raise exception 'REVIEW_PUBLICATION_POLICY_INVALID';
  end if;

  v_expected_mode := case when p_privacy_requested then 'anonymous' else 'public' end;
  if p_publication_consent_mode <> v_expected_mode
     or coalesce(p_publication_consent, false) <> (not p_privacy_requested) then
    raise exception 'REVIEW_PUBLICATION_CHOICE_INVALID';
  end if;

  v_result := public.submit_verified_guest_review(
    p_token_hash,
    p_rating,
    p_review_text,
    p_contact_requested,
    p_publication_consent,
    p_publication_consent_mode
  );
  v_review_id := (v_result ->> 'id')::uuid;

  if coalesce((v_result ->> 'idempotent')::boolean, false) then
    select * into v_existing from public.guest_reviews where id = v_review_id;
    if v_existing.review_privacy_requested is distinct from p_privacy_requested
       or v_existing.review_publication_policy_version is distinct from p_publication_policy_version then
      raise exception 'REVIEW_ALREADY_SUBMITTED';
    end if;
    return v_result;
  end if;

  perform set_config('zingara.review_policy_submission', 'true', true);
  update public.guest_reviews
     set review_privacy_requested = p_privacy_requested,
         review_publication_policy_version = p_publication_policy_version
   where id = v_review_id;
  update public.guest_review_events
     set metadata = metadata || jsonb_build_object(
       'privacy_requested', p_privacy_requested,
       'publication_policy_version', p_publication_policy_version
     )
   where review_id = v_review_id and event_type = 'submitted';

  return v_result || jsonb_build_object(
    'privacy_requested', p_privacy_requested,
    'publication_policy_version', p_publication_policy_version
  );
end;
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
  if p_action='publish' and not (
    v_review.publication_consent_mode = 'public'
    and (
      v_review.review_publication_policy_version is null
      or (
        v_review.review_publication_policy_version = 'review-publication-2026-10-09-v1'
        and v_review.review_privacy_requested = false
      )
    )
  ) then raise exception 'REVIEW_PUBLICATION_CONSENT_REQUIRED'; end if;
  if p_action='publish_anonymous' and not (
    v_review.publication_consent_mode = 'anonymous'
    or (
      v_review.publication_consent_mode = 'public'
      and v_review.review_privacy_requested = false
      and v_review.review_publication_policy_version = 'review-publication-2026-10-09-v1'
    )
  ) then raise exception 'REVIEW_ANONYMOUS_CONSENT_REQUIRED'; end if;
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

create or replace function public.set_guest_review_featured(
  p_review_id uuid,p_expected_revision integer,p_featured boolean,p_actor_staff_profile_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_review public.guest_reviews%rowtype; v_now timestamptz := now();
begin
  select * into v_review from public.guest_reviews where id=p_review_id for update;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status <> 'published' or not (
    (v_review.publication_consent_mode='public' and v_review.publication_mode='named'
      and (v_review.review_publication_policy_version is null
        or (v_review.review_publication_policy_version='review-publication-2026-10-09-v1'
          and v_review.review_privacy_requested=false))) or
    (v_review.publication_consent_mode='anonymous' and v_review.publication_mode='anonymous') or
    (v_review.publication_consent_mode='public' and v_review.publication_mode='anonymous'
      and v_review.review_privacy_requested=false
      and v_review.review_publication_policy_version='review-publication-2026-10-09-v1')
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
      and ((publication_consent_mode='public' and publication_mode='named'
          and (review_publication_policy_version is null
            or (review_publication_policy_version='review-publication-2026-10-09-v1' and review_privacy_requested=false)))
        or (publication_consent_mode='anonymous' and publication_mode='anonymous')
        or (publication_consent_mode='public' and publication_mode='anonymous'
          and review_privacy_requested=false
          and review_publication_policy_version='review-publication-2026-10-09-v1'))
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

drop index if exists public.guest_reviews_public_venue_idx;
drop index if exists public.guest_reviews_public_newest_idx;
drop index if exists public.guest_reviews_public_featured_idx;

create index guest_reviews_public_venue_idx
  on public.guest_reviews (venue, published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode='public' and publication_mode='named'
        and (review_publication_policy_version is null
          or (review_publication_policy_version='review-publication-2026-10-09-v1' and review_privacy_requested=false)))
      or (publication_consent_mode='anonymous' and publication_mode='anonymous')
      or (publication_consent_mode='public' and publication_mode='anonymous'
        and review_privacy_requested=false
        and review_publication_policy_version='review-publication-2026-10-09-v1'));
create index guest_reviews_public_newest_idx
  on public.guest_reviews (published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode='public' and publication_mode='named'
        and (review_publication_policy_version is null
          or (review_publication_policy_version='review-publication-2026-10-09-v1' and review_privacy_requested=false)))
      or (publication_consent_mode='anonymous' and publication_mode='anonymous')
      or (publication_consent_mode='public' and publication_mode='anonymous'
        and review_privacy_requested=false
        and review_publication_policy_version='review-publication-2026-10-09-v1'));
create index guest_reviews_public_featured_idx
  on public.guest_reviews (venue, featured, published_at desc, public_id desc)
  where moderation_status = 'published'
    and ((publication_consent_mode='public' and publication_mode='named'
        and (review_publication_policy_version is null
          or (review_publication_policy_version='review-publication-2026-10-09-v1' and review_privacy_requested=false)))
      or (publication_consent_mode='anonymous' and publication_mode='anonymous')
      or (publication_consent_mode='public' and publication_mode='anonymous'
        and review_privacy_requested=false
        and review_publication_policy_version='review-publication-2026-10-09-v1'));

revoke all on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_verified_guest_review(text,integer,text,boolean,boolean,text,boolean,text) to service_role;

comment on column public.guest_reviews.review_privacy_requested is
  'Exact Request Review Private toggle choice for versioned review submissions. Null identifies historical consent records.';
comment on column public.guest_reviews.review_publication_policy_version is
  'Publication policy version disclosed when the review privacy choice was submitted. Historical records remain null.';
