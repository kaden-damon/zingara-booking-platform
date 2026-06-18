-- Phase 4C: RLS protection for admin configuration tables only.
--
-- Scope:
-- - roles
-- - permissions
-- - role_permissions
-- - staff_profiles
-- - shows
-- - venue_settings
-- - communication_templates
--
-- Explicitly out of scope:
-- - bookings
-- - customers
-- - payments
-- - tickets
-- - waitlist_entries
-- - corporate_requests
-- - communications
-- - communication_batches
-- - booking_lifecycle_events
-- - ticket_validations
-- - venue_tables
-- - show_tables

begin;

-- ------------------------------------------------------------
-- 1. Remove broad browser-side CRUD access
-- ------------------------------------------------------------

revoke all on table public.roles from anon, authenticated;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.staff_profiles from anon, authenticated;
revoke all on table public.venue_settings from anon, authenticated;
revoke all on table public.communication_templates from anon, authenticated;

-- Shows still need guest-facing calendar visibility.
-- Remove browser-side writes but preserve direct public read access.
revoke insert, update, delete on table public.shows from anon, authenticated;
grant select on table public.shows to anon, authenticated;

-- Server routes use the service role.
grant usage on schema public to service_role;

grant select, insert, update, delete on table public.roles to service_role;
grant select, insert, update, delete on table public.permissions to service_role;
grant select, insert, update, delete on table public.role_permissions to service_role;
grant select, insert, update, delete on table public.staff_profiles to service_role;
grant select, insert, update, delete on table public.shows to service_role;
grant select, insert, update, delete on table public.venue_settings to service_role;
grant select, insert, update, delete on table public.communication_templates to service_role;

-- ------------------------------------------------------------
-- 2. Enable RLS
-- ------------------------------------------------------------

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.shows enable row level security;
alter table public.venue_settings enable row level security;
alter table public.communication_templates enable row level security;

-- ------------------------------------------------------------
-- 3. Remove old Phase 4C policies if this script is rerun
-- ------------------------------------------------------------

drop policy if exists "phase4c_public_read_visible_shows" on public.shows;
drop policy if exists "phase4c_staff_read_own_profile" on public.staff_profiles;

-- ------------------------------------------------------------
-- 4. Public/authenticated read policies
-- ------------------------------------------------------------

-- Guest booking calendar may read visible public show statuses.
-- Inactive and archived shows remain hidden from direct browser reads.
create policy "phase4c_public_read_visible_shows"
on public.shows
for select
to anon, authenticated
using (
  status in (
    'active',
    'sold_out',
    'blackout',
    'venue_closure',
    'special_event'
  )
);

-- Compatibility safety policy for authenticated staff session/profile checks.
-- Full staff management remains server-route/service-role only.
create policy "phase4c_staff_read_own_profile"
on public.staff_profiles
for select
to authenticated
using (user_id = auth.uid());

commit;
