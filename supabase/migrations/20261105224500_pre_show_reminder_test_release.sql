begin;

create unique index communications_pre_show_reminder_test_release_once_uidx
  on public.communications (subject, type, channel)
  where batch_id is null
    and subject = 'TEST — Zingara Pre-Show Reminder'
    and type = 'show_reminder'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

comment on index public.communications_pre_show_reminder_test_release_once_uidx is
  'Limits the approved 5 November 2026 Show Starts Production reminder test to one accepted delivery.';

commit;
