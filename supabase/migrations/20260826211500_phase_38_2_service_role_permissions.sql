-- Phase 38.2 follow-up: permit only the server service role to operate the
-- RLS-protected Apple Wallet registration and change-tracking tables.

grant select, insert, update, delete
  on public.apple_wallet_devices,
     public.apple_wallet_registrations,
     public.apple_wallet_pass_state
  to service_role;

grant usage, select on sequence public.apple_wallet_update_sequence
  to service_role;
