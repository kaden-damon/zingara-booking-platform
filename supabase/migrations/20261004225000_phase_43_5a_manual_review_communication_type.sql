alter type public.communication_type
  add value if not exists 'post_show_review_manual';

comment on type public.communication_type is
  'Authoritative classification for customer and operational communication records, including staff-triggered manual review invitations.';
