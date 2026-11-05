begin;

create unique index if not exists communications_pre_show_template_test_once_uidx
  on public.communications (batch_id, type, channel)
  where batch_id = 'pre-show-attendance-template-test-2026-11-05-v1'
    and type = 'custom_message'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

comment on index public.communications_pre_show_template_test_once_uidx is
  'Limits the approved 5 November 2026 pre-show template Production test to one accepted delivery.';

commit;
