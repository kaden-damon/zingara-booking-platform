begin;

alter table public.management_email_notification_routes
  add column if not exists email_event_settings jsonb not null default '{}'::jsonb;

alter table public.management_email_notification_routes
  drop constraint if exists management_email_notification_routes_email_event_settings_check,
  add constraint management_email_notification_routes_email_event_settings_check check (
    jsonb_typeof(email_event_settings) = 'object'
  );

update public.management_email_notification_routes
set
  email_event_settings = jsonb_build_object(
    'confirmed', coalesce((email_event_settings->>'confirmed')::boolean, true),
    'declined', coalesce((email_event_settings->>'declined')::boolean, true)
  ),
  updated_at = now()
where notification_key = 'attendance-confirmations';

comment on column public.management_email_notification_routes.email_event_settings is
  'Per-event email delivery controls. The organisation route remains the master switch; non-email attendance behaviour is independent.';

commit;
