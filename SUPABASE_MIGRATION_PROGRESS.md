# Supabase Migration Progress

Last updated: 2026-06-18

## Current Status

The Supabase migration has completed the Phase 2 business-domain migration pass and Phase 3 staff authentication/management pass. The database schema has been created in migration files, and the application now has a shared Supabase data access layer for the operational business modules listed below. The app still keeps localStorage fallback behaviour while Phase 4 remains pending.

Migration status summary:

- Shows: Business Migration Complete.
- Venue Settings: Business Migration Complete.
- Templates: Business Migration Complete.
- Customers: Business Migration Complete.
- Bookings: Business Migration Complete.
- Payments: Business Migration Complete.
- Tickets: Business Migration Complete.
- Communications: Business Migration Complete.
- Lifecycle Events: Business Migration Complete.
- Ticket Validations: Business Migration Complete.
- Waitlist: Business Migration Complete.
- Corporate Requests: Business Migration Complete.
- Supabase Auth: PASSED and TESTED.
- Staff Profiles & Roles: PASSED and TESTED.
- Staff Management: PASSED and TESTED.
- Staff Invitations: PASSED and TESTED.

Remaining work:

- Production RLS policy implementation.
- Phase 4: Final localStorage retirement, one-time migration/import tooling, hardening, and production readiness cleanup.

## Phase 1: Schema Creation

Status: Complete in repository.

Files:

- `supabase/migrations/202606170001_phase_1_core_schema.sql`
- `supabase/MIGRATION_ORDER.md`

Created schema coverage:

- `customers`
- `shows`
- `venue_tables`
- `show_tables`
- `bookings`
- `tickets`
- `communications`
- `communication_batches`
- `waitlist_entries`
- `payments`
- `booking_lifecycle_events`
- `ticket_validations`
- `corporate_requests`
- `communication_templates`
- `venue_settings`
- `staff_profiles`
- `roles`
- `permissions`
- `role_permissions`

Created enum coverage:

- `booking_status`
- `payment_status`
- `show_status`
- `communication_type`
- `communication_channel`
- `ticket_status`
- `table_status`
- `waitlist_status`
- `payment_type`
- `validation_result`
- `corporate_request_status`
- `corporate_request_type`

Important note:

- Phase 1 created migration files only. Applying the migrations to the live Supabase project must be done separately with the Supabase CLI or SQL editor.

## Phase 2A: Shows

Status: Business Migration Complete.

Service:

- `src/lib/supabase/shows.ts`

Implemented:

- Shared Supabase-backed show reads and writes.
- LocalStorage fallback if Supabase has no rows or cannot be reached.
- Legacy app show IDs preserved in `shows.notes` metadata.
- Show consumers updated across booking/admin workflows.

Known follow-up:

- Supabase permissions were required for `shows`.
- For the migration phase, `anon` required CRUD grants and RLS was temporarily disabled for this table.

## Phase 2B: Venue Settings and Communication Templates

Status: Business Migration Complete.

Services:

- `src/lib/supabase/venueSettings.ts`
- `src/lib/supabase/communicationTemplates.ts`

Implemented:

- Venue settings read/write service.
- Communication template read/write service.
- LocalStorage fallback and seed behaviour.
- Existing template types preserved, including reservation and corporate messaging templates.

Known follow-up:

- Supabase permissions were required for `venue_settings` and `communication_templates`.
- For the migration phase, `anon` required CRUD grants and RLS was temporarily disabled for these tables.

## Phase 2C: Customers

Status: Business Migration Complete.

Service:

- `src/lib/supabase/customers.ts`

Implemented:

- `getCustomers()`
- `getCustomer()`
- `createCustomer()`
- `updateCustomer()`
- `upsertCustomer()`
- `upsertCustomerFromInfo()`
- `getOrCreateCustomerIdFromInfo()`

Integrated areas:

- CRM customer loading.
- CRM save paths.
- Booking customer creation/upsert.
- Corporate request conversion customer linkage.

Current boundary:

- Bookings, communications, and derived history still depend partly on local/demo metadata until their migration is complete.

## Phase 2D: Bookings

Status: Business Migration Complete.

Service:

- `src/lib/supabase/bookings.ts`

Implemented:

- `getBookings()`
- `getBooking()`
- `createBooking()`
- `updateBooking()`
- `deleteBooking()`
- `saveBookings()`
- `getSupabaseBookingId()`

Implemented behaviour:

- Booking records are saved to localStorage first.
- Supabase persistence is attempted after local save.
- Customer relation is resolved through the customer upsert service.
- Show relation is resolved using Supabase show IDs, legacy show metadata, generated show IDs, and booking date/time fallback.
- Full `DemoBooking` metadata is preserved in `bookings.notes` under a temporary metadata prefix.

Previously fixed:

- A show mapping issue prevented booking inserts when `booking.showId` did not resolve to `shows.id`.

## Phase 2E: Tickets and Payments

Status: Business Migration Complete.

Services:

- `src/lib/supabase/tickets.ts`
- `src/lib/supabase/payments.ts`

Implemented:

- Ticket service functions:
  - `getTickets()`
  - `getTicket()`
  - `createTicket()`
  - `updateTicket()`
- Payment service functions:
  - `getPayments()`
  - `getPayment()`
  - `createPayment()`
  - `updatePayment()`

Integrated areas:

- Booking completion attempts to create booking, then payment and ticket.
- Admin payment controls attempt to update payment and ticket records.
- Live ticket lookup reads through the booking service.

Important dependency:

- Payment and ticket creation depend on resolving the Supabase booking row with `getSupabaseBookingId(booking.reference)`.
- If the booking insert fails, payment and ticket creation return early because there is no Supabase `booking_id`.

Test result:

- Booking completion creates the booking, payment, and ticket records through the Supabase-backed persistence path while preserving localStorage fallback.

## Phase 2F: Communications

Status: Business Migration Complete.

Service:

- `src/lib/supabase/communications.ts`

Implemented:

- Communication read/write service.
- Booking communication history persistence.
- CRM communication history integration.
- Broadcast and corporate communication persistence.
- LocalStorage fallback.

## Phase 2G: Booking Lifecycle Events

Status: Business Migration Complete.

Service:

- `src/lib/supabase/lifecycleEvents.ts`

Implemented:

- Lifecycle event persistence for booking creation, confirmation, payment, refund, cancellation, check-in, and comp booking actions.
- Admin timeline loading from Supabase with localStorage fallback.

## Phase 2H: Ticket Validations

Status: Business Migration Complete.

Service:

- `src/lib/supabase/ticketValidations.ts`

Implemented:

- Ticket validation/check-in activity persistence.
- QR validation, duplicate scan, invalid ticket, and manual check-in activity tracking.
- LocalStorage fallback.

## Phase 2I: Waitlist

Status: PASSED and tested. Business Migration Complete.

Service:

- `src/lib/supabase/waitlist.ts`

Implemented:

- Waitlist read/write service.
- Waitlist signup persistence.
- Waitlist status updates, promotions, removals, and conversion persistence.
- LocalStorage fallback.

Test results:

- Waitlist entries save to Supabase.
- Waitlist entries load in Admin.
- Show selector added to Admin Waitlist.
- Promotion/removal/conversion paths functional.

## Phase 2J: Corporate Requests

Status: PASSED and tested. Business Migration Complete.

Service:

- `src/lib/supabase/corporateRequests.ts`

Implemented:

- Corporate request read/write service.
- Guest corporate request submission persistence.
- Admin corporate request management persistence.
- Status updates and request metadata persistence.
- LocalStorage fallback.

Test results:

- Corporate requests save to Supabase.
- Corporate requests load in Admin.
- Status changes persist.
- Corporate request conversion to booking confirmed.

## Phase 3A: Supabase Auth

Status: PASSED and TESTED.

Service:

- `src/lib/supabase/auth.ts`

Implemented:

- Supabase Auth sign-in.
- Supabase Auth sign-out.
- Persistent Supabase session handling.
- Admin gate now uses authenticated Supabase session state.

Test results:

- Supabase Auth login succeeds.
- Existing admin login screen remains intact.
- Existing admin dashboard loads after authentication.
- Sign out clears the active admin session.

## Phase 3B: Staff Profiles & Roles

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffProfiles.ts`

Implemented:

- Default role seeding support.
- Permission and role-permission seeding support.
- Staff profile creation/linkage for authenticated users.
- Admin session role display from `staff_profiles`.

Test results:

- Roles and permissions are available through Supabase.
- Authenticated staff profile is linked to Supabase Auth user.
- Existing Super Admin profile displays correctly in Admin.
- Staff role resolution works from `staff_profiles.role_id`.

## Phase 3C: Staff Management

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffManagement.ts`

Implemented:

- Staff profile listing.
- Staff profile lookup.
- Staff role update.
- Staff active/inactive update.
- Staff profile delete service function.
- Settings → Staff management tab.

Test results:

- Staff list loads in Settings → Staff.
- Role changes save.
- Active toggle saves.
- Existing login still works.

## Phase 3D: Staff Invitations

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffInvitations.ts`
- `src/app/api/admin/staff-invitations/route.ts`

Implemented:

- Super Admin staff creation UI in Settings → Staff.
- Supabase Auth user invitation/creation route.
- Linked `staff_profiles` creation.
- Role assignment during staff creation.
- Staff list refresh after creation.

Test results:

- Staff Invitations API uses configured service-role runtime key.
- Super Admin access validation reaches the server route.
- Create Staff User workflow is available from Settings → Staff.
- Staff profile creation path is linked to Supabase Auth users.

## Supabase Permissions Status

Confirmed migration-phase pattern:

- Tables used by browser-side Supabase services require `anon` CRUD grants while the app still uses the public anon client.
- RLS has been temporarily disabled for migrated tables during this incremental migration.

Known required tables so far:

- `shows`
- `venue_settings`
- `communication_templates`
- `customers`
- `bookings`
- `payments`
- `tickets`
- `communications`
- `booking_lifecycle_events`
- `ticket_validations`
- `waitlist_entries`
- `corporate_requests`
- `roles`
- `permissions`
- `role_permissions`
- `staff_profiles`

Important:

- This is acceptable only as a temporary migration/testing state.
- Before production, RLS must be re-enabled with proper policies, and staff/customer access must be routed through the final auth model.

## Current Data Flow

### Shows

Supabase is primary, localStorage is fallback.

### Venue Settings

Supabase is primary, localStorage is fallback.

### Communication Templates

Supabase is primary, localStorage is fallback.

### Customers

Supabase is primary for migrated CRM paths, localStorage fallback remains.

### Bookings

LocalStorage write occurs first, Supabase write is attempted after.

Read behaviour currently prefers Supabase once rows exist, which can hide local-only bookings if Supabase insert fails.

### Payments and Tickets

Supabase creation depends on successful Supabase booking insertion.

### Communications

Supabase is primary, localStorage fallback remains.

### Lifecycle Events

Supabase is primary, localStorage fallback remains.

### Ticket Validations

Supabase is primary, localStorage fallback remains.

### Waitlist

Supabase is primary, localStorage fallback remains.

### Corporate Requests

Supabase is primary, localStorage fallback remains.

## Remaining Work

Phase 4 remains pending:

- Show table and venue table operational persistence.
- RLS policy implementation.
- LocalStorage-to-Supabase one-time migration/import tooling.

## Production Readiness Notes

The app is not ready to remove localStorage fallback yet.

Phase 2 business-domain migration and Phase 3 staff auth/management migration are complete, but the platform remains hybrid until Phase 4 is completed. Before production, RLS must be re-enabled with proper policies and localStorage fallback must be retired through a controlled migration/import process.
