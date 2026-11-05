begin;

create unique index if not exists communications_pre_show_template_test_once_uidx
  on public.communications (batch_id, type, channel)
  where batch_id = '00000000-0000-4000-8000-000000005105'::uuid
    and type = 'custom_message'
    and channel = 'email'
    and status in ('sending', 'sent', 'suppressed');

comment on index public.communications_pre_show_template_test_once_uidx is
  'Limits the approved 5 November 2026 pre-show template Production test to one accepted delivery.';

commit;
