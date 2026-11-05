begin;

drop index if exists public.communications_pre_show_template_test_once_uidx;

create unique index communications_pre_show_template_test_once_uidx
  on public.communications (subject, type, channel)
  where batch_id is null
    and subject = 'TEST — Zingara Pre-Show Reminder'
    and type = 'custom_message'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

comment on index public.communications_pre_show_template_test_once_uidx is
  'Limits the approved 5 November 2026 pre-show template Production test to one accepted delivery.';

commit;
