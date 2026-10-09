alter table public.guest_reviews
  drop constraint if exists guest_reviews_check1,
  drop constraint if exists guest_reviews_publication_state_check;

alter table public.guest_reviews
  add constraint guest_reviews_publication_state_check
  check (
    moderation_status <> 'published'
    or (
      publication_consent_mode = 'public'
      and publication_mode = 'named'
      and publication_consent = true
    )
    or (
      publication_consent_mode = 'anonymous'
      and publication_mode = 'anonymous'
      and publication_consent = false
      and publication_consented_at is not null
    )
  );

comment on constraint guest_reviews_publication_state_check on public.guest_reviews is
  'Published reviews require the matching explicit named or anonymous guest consent state.';
