begin;

alter table public.workflow_configurations
  drop constraint if exists workflow_configurations_workflow_key_check;

alter table public.workflow_configurations
  add constraint workflow_configurations_workflow_key_check
  check (
    workflow_key in (
      'pre_show_reminder',
      'post_show_review',
      'secret_guest_list_customer_acknowledgement'
    )
  );

insert into public.workflow_configurations (
  workflow_key,
  enabled,
  timing_offset_days,
  activated_at,
  subject,
  body,
  cape_town_review_url,
  johannesburg_review_url
) values (
  'secret_guest_list_customer_acknowledgement',
  false,
  1,
  null,
  '🎪 You''re on Zingara''s Secret Guest List!',
  'Transactional acknowledgement for a successfully accepted Secret Guest List enquiry.',
  null,
  null
)
on conflict (workflow_key) do update
set enabled = false,
    activated_at = null,
    subject = excluded.subject,
    body = excluded.body,
    updated_at = now();

create unique index if not exists communications_secret_guest_list_ack_once_uidx
  on public.communications (
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid),
    type,
    channel,
    subject
  )
  where type = 'custom_message'
    and channel = 'email'
    and subject = '🎪 You''re on Zingara''s Secret Guest List!'
    and status in ('sending', 'sent', 'suppressed');

comment on index public.communications_secret_guest_list_ack_once_uidx is
  'Prevents duplicate Secret Guest List customer acknowledgements and duplicate preview sends.';

commit;
